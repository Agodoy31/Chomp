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
