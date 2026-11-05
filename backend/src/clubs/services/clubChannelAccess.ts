import { type ClientSession, type Types } from 'mongoose';
import { type IConversation } from '../../messaging/interfaces/conversation.interfaces';
import { ConversationParticipant, ParticipantPermission } from '../../messaging/models/ConversationParticipant';
import {
  addParticipantsToConversation,
  createChannel,
  getClubChannels,
  updateParticipantPermissions,
} from '../../messaging/services/conversation.service';
import { type Membership } from '../model/membershipModel';

const GENERAL_CHANNEL_TITLE = 'General';

const CHANNEL_PERMISSION_BY_ROLE: Record<Membership['role'], ParticipantPermission> = {
  OFFICER: ParticipantPermission.MODERATE,
  MEMBER: ParticipantPermission.WRITE,
};

export async function createGeneralChannel(
  clubId: Types.ObjectId,
  proposerId: Types.ObjectId,
  session: ClientSession
): Promise<IConversation> {
  const channel = await createChannel(clubId, GENERAL_CHANNEL_TITLE, [proposerId], session);
  // updateParticipantPermissions requires a moderator requester, and the proposer holds the only seat.
  await ConversationParticipant.updateOne(
    { conversationId: channel._id, userId: proposerId },
    { permission: CHANNEL_PERMISSION_BY_ROLE.OFFICER },
    { session }
  ).exec();
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
  actorId: Types.ObjectId,
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

    const moderators = await ConversationParticipant.find({
      conversationId: channel._id,
      permission: ParticipantPermission.MODERATE,
    })
      .select('userId')
      .session(session)
      .lean()
      .exec();
    // updateParticipantPermissions only accepts a channel moderator as the requester. An admin can change
    // a role without holding a seat, and a channel can have no moderator yet.
    const requester =
      moderators.find((moderator) => moderator.userId.toString() === actorId.toString()) ?? moderators.at(0);

    if (requester) {
      await updateParticipantPermissions(channel._id, requester.userId, [userId, permission], session);
    } else {
      await ConversationParticipant.updateOne(
        { conversationId: channel._id, userId },
        { permission },
        { session }
      ).exec();
    }
  }
}
