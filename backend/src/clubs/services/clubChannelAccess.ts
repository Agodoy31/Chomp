import mongoose, { type ClientSession, type Types } from 'mongoose';
import { ConversationType, type IConversation } from '../../messaging/interfaces/conversation.interfaces';
import { MessagingError, MessagingErrorCode } from '../../messaging/errors/messagingError';
import { Conversation } from '../../messaging/models/Conversation';
import { ConversationParticipant, ParticipantPermission } from '../../messaging/models/ConversationParticipant';
import {
  addParticipantsToConversation,
  createChannel,
  getClubChannels,
  softDeleteConversation,
  updateConversationTitle,
  updateParticipantPermissions,
  type PermissionUpdate,
} from '../../messaging/services/conversation.service';
import { messagingPublisher } from '../../messaging/sockets/messagingPublisher';
import { type ClientError } from '../interfaces/clubs.interface';
import { cannotDeleteGeneral, cannotRenameGeneral, channelNotFound, channelTitleExists, clubNotFound } from '../errors';
import { Membership } from '../model/membershipModel';

const GENERAL_CHANNEL_TITLE = 'General';

const CHANNEL_PERMISSION_BY_ROLE: Record<Membership['role'], ParticipantPermission> = {
  OFFICER: ParticipantPermission.MODERATE,
  MEMBER: ParticipantPermission.WRITE,
};

type MembershipBody = {
  _id: string;
  userId: string;
  clubId: string;
  role: Membership['role'];
  status: Membership['status'];
};

type CommittedDeparture = {
  membership: MembershipBody;
  channelIds: readonly string[];
};

function membershipBody(membership: {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  clubId: Types.ObjectId;
  role: Membership['role'];
  status: Membership['status'];
}): MembershipBody {
  return {
    _id: membership._id.toString(),
    userId: membership.userId.toString(),
    clubId: membership.clubId.toString(),
    role: membership.role,
    status: membership.status,
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
}): Promise<MembershipBody | null> {
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
      return membershipBody(current);
    });
  } finally {
    await session.endSession();
  }
}

export async function commitMemberDeparture(input: {
  membershipId: Types.ObjectId;
  status: 'INACTIVE' | 'REMOVED';
}): Promise<MembershipBody | null> {
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
        membership: membershipBody(current),
        channelIds,
      };
      return departure;
    });
    if (!committed) {
      return null;
    }
    // chat:join_room admits any committed seat, so this runs only after the delete is visible.
    for (const channelId of committed.channelIds) {
      messagingPublisher.evictUserFromConversation(channelId, committed.membership.userId);
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

type ChannelBody = { _id: string; title: string };

export type ChannelCommandResult = { channel: ChannelBody } | { error: ClientError };

function channelWriteError(error: unknown): ClientError | null {
  if (error instanceof MessagingError && error.code === MessagingErrorCode.CHANNEL_TITLE_EXISTS) {
    return channelTitleExists();
  }
  if (error instanceof MessagingError && error.code === MessagingErrorCode.CLUB_NOT_FOUND) {
    return clubNotFound();
  }
  return null;
}

export async function createClubChannel(input: { clubId: Types.ObjectId; title: string }): Promise<ChannelCommandResult> {
  const session = await mongoose.startSession();
  try {
    const channel = await session.withTransaction(async () => {
      const roster = await Membership.find({ clubId: input.clubId, status: 'ACTIVE' })
        .select('userId role')
        .session(session)
        .lean();
      // Joining later walks every club channel, so the people already here have to be seated now.
      const created = await createChannel(
        input.clubId,
        input.title,
        roster.map((membership) => membership.userId),
        session
      );
      const officerUpdates: PermissionUpdate[] = roster
        .filter((membership) => membership.role === 'OFFICER')
        .map((membership) => [membership.userId, CHANNEL_PERMISSION_BY_ROLE.OFFICER]);
      if (officerUpdates.length > 0) {
        await updateParticipantPermissions(created._id, undefined, officerUpdates, session);
      }
      return { _id: created._id.toString(), title: created.title ?? input.title };
    });
    return { channel };
  } catch (error) {
    const ruled = channelWriteError(error);
    if (ruled) {
      return { error: ruled };
    }
    throw error;
  } finally {
    await session.endSession();
  }
}

export async function renameClubChannel(input: {
  clubId: Types.ObjectId;
  channelId: Types.ObjectId;
  title: string;
  requesterId: Types.ObjectId;
}): Promise<ChannelCommandResult> {
  const channel = await Conversation.findOne({
    _id: input.channelId,
    clubId: input.clubId,
    type: ConversationType.CHANNEL,
  })
    .select('title')
    .lean();
  if (!channel) {
    return { error: channelNotFound() };
  }
  if (channel.title === input.title) {
    return { channel: { _id: input.channelId.toString(), title: input.title } };
  }
  if (channel.title === GENERAL_CHANNEL_TITLE) {
    return { error: cannotRenameGeneral() };
  }

  try {
    const updated = await updateConversationTitle(input.channelId, input.requesterId, input.title);
    const savedTitle = updated.title ?? input.title;
    messagingPublisher.conversationRenamed(input.channelId.toString(), savedTitle);
    return { channel: { _id: updated._id.toString(), title: savedTitle } };
  } catch (error) {
    if (error instanceof MessagingError && error.code === MessagingErrorCode.CONVERSATION_NOT_FOUND) {
      return { error: channelNotFound() };
    }
    const ruled = channelWriteError(error);
    if (ruled) {
      return { error: ruled };
    }
    throw error;
  }
}

export async function removeClubChannel(input: {
  clubId: Types.ObjectId;
  channelId: Types.ObjectId;
}): Promise<ChannelCommandResult> {
  const channel = await Conversation.findOne({
    _id: input.channelId,
    clubId: input.clubId,
    type: ConversationType.CHANNEL,
    deleted: false,
  })
    .select('title')
    .lean();
  if (!channel?.title) {
    return { error: channelNotFound() };
  }
  if (channel.title === GENERAL_CHANNEL_TITLE) {
    return { error: cannotDeleteGeneral() };
  }

  try {
    const removed = await softDeleteConversation(input.channelId);
    messagingPublisher.conversationDeleted(input.channelId.toString(), removed.participantUserIds);
    return { channel: { _id: input.channelId.toString(), title: channel.title } };
  } catch (error) {
    if (error instanceof MessagingError && error.code === MessagingErrorCode.CONVERSATION_NOT_FOUND) {
      return { error: channelNotFound() };
    }
    throw error;
  }
}
