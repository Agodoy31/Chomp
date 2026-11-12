import mongoose, { type ClientSession, type Types } from 'mongoose';
import { type IConversation } from '../../messaging/interfaces/conversation.interfaces';
import { ConversationParticipant, ParticipantPermission } from '../../messaging/models/ConversationParticipant';
import {
  addParticipantsToConversation,
  createChannel,
  getClubChannels,
  updateParticipantPermissions,
} from '../../messaging/services/conversation.service';
import { messagingPublisher } from '../../messaging/sockets/messagingPublisher';
import { Membership } from '../model/membershipModel';

const GENERAL_CHANNEL_TITLE = 'General';

const CHANNEL_PERMISSION_BY_ROLE: Record<Membership['role'], ParticipantPermission> = {
  OFFICER: ParticipantPermission.MODERATE,
  MEMBER: ParticipantPermission.WRITE,
};

type MembershipBodyFields = {
  _id: string;
  userId: string;
  clubId: string;
  role: Membership['role'];
};

export type ActiveMembershipBody = MembershipBodyFields & { status: 'ACTIVE' };

export type EndedMembershipBody = MembershipBodyFields & { status: 'INACTIVE' | 'REMOVED' };

type DepartureStatus = EndedMembershipBody['status'];

type CommittedDeparture = {
  membership: EndedMembershipBody;
  userId: string;
  channelIds: readonly string[];
};

function membershipFields(membership: {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  clubId: Types.ObjectId;
  role: Membership['role'];
}): MembershipBodyFields {
  return {
    _id: membership._id.toString(),
    userId: membership.userId.toString(),
    clubId: membership.clubId.toString(),
    role: membership.role,
  };
}

export async function createGeneralChannel(
  clubId: Types.ObjectId,
  proposerId: Types.ObjectId,
  session: ClientSession
): Promise<IConversation> {
  const channel = await createChannel(clubId, GENERAL_CHANNEL_TITLE, [proposerId], session);
  await updateParticipantPermissions(
    channel._id,
    undefined,
    [proposerId, CHANNEL_PERMISSION_BY_ROLE.OFFICER],
    session
  );
  return channel;
}

export async function addMemberToClubChannels(
  clubId: Types.ObjectId,
  userId: Types.ObjectId,
  session: ClientSession
): Promise<void> {
  const channels = await getClubChannels(clubId);
  // Operations in a transaction have to run one at a time.
  for (const channel of channels) {
    await addParticipantsToConversation(channel._id, [userId], session);
  }
}

export async function syncMemberChannelPermission(
  clubId: Types.ObjectId,
  userId: Types.ObjectId,
  role: Membership['role'],
  session: ClientSession
): Promise<void> {
  const permission = CHANNEL_PERMISSION_BY_ROLE[role];
  const channels = await getClubChannels(clubId);

  for (const channel of channels) {
    const seat = await ConversationParticipant.findOne({ conversationId: channel._id, userId })
      .select('permission')
      .session(session)
      .lean()
      .exec();
    if (!seat || seat.permission === permission) {
      continue;
    }

    await updateParticipantPermissions(channel._id, undefined, [userId, permission], session);
  }
}

export async function commitMemberRole(input: {
  membershipId: Types.ObjectId;
  role: Membership['role'];
}): Promise<ActiveMembershipBody | null> {
  const session = await mongoose.startSession();
  try {
    return await session.withTransaction(async () => {
      const current = await Membership.findOne({ _id: input.membershipId, status: 'ACTIVE' }).session(session);
      if (!current) {
        return null;
      }
      current.role = input.role;
      await current.save({ session });
      await syncMemberChannelPermission(current.clubId, current.userId, input.role, session);
      return { ...membershipFields(current), status: 'ACTIVE' as const };
    });
  } finally {
    await session.endSession();
  }
}

export async function commitMemberDeparture(input: {
  membershipId: Types.ObjectId;
  status: DepartureStatus;
}): Promise<EndedMembershipBody | null> {
  const session = await mongoose.startSession();
  try {
    const committed = await session.withTransaction(async () => {
      const current = await Membership.findOne({ _id: input.membershipId, status: 'ACTIVE' }).session(session);
      if (!current) {
        return null;
      }
      current.status = input.status;
      await current.save({ session });
      const channelIds = await deleteMemberChannelSeats(current.clubId, current.userId, session);
      const departure: CommittedDeparture = {
        membership: { ...membershipFields(current), status: input.status },
        userId: current.userId.toString(),
        channelIds,
      };
      return departure;
    });
    if (!committed) {
      return null;
    }
    // chat:join_room admits any committed seat, so this runs only after the delete is visible.
    for (const channelId of committed.channelIds) {
      messagingPublisher.evictUserFromConversation(channelId, committed.userId);
    }
    return committed.membership;
  } finally {
    await session.endSession();
  }
}

async function deleteMemberChannelSeats(
  clubId: Types.ObjectId,
  userId: Types.ObjectId,
  session: ClientSession
): Promise<readonly string[]> {
  const channels = await getClubChannels(clubId);
  const channelIds: string[] = [];
  // Operations in a transaction have to run one at a time.
  for (const channel of channels) {
    await ConversationParticipant.deleteOne({ conversationId: channel._id, userId }, { session });
    channelIds.push(channel._id.toString());
  }
  return channelIds;
}
