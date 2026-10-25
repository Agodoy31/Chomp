import mongoose, { Types } from 'mongoose';
import { IMessage } from '../interfaces/message.interfaces';
import { ConversationType } from '../interfaces/conversation.interfaces';
import { ParticipantPermission } from '../interfaces/conversationParticipant.interfaces';
import { Conversation } from '../models/Conversation';
import { ConversationParticipant } from '../models/ConversationParticipant';
import { Message } from '../models/Message';
import { isUserParticipant } from './conversation.service';

const UUID_V7_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function sendMessage(
  conversationId: Types.ObjectId | string,
  senderId: Types.ObjectId | string,
  text: string,
  clientId?: string,
  isAnnouncement = false
): Promise<IMessage> {
  if (!conversationId || !mongoose.isObjectIdOrHexString(conversationId)) {
    throw new Error('Valid conversationId is required');
  }

  if (!senderId || !mongoose.isObjectIdOrHexString(senderId)) {
    throw new Error('Valid senderId is required');
  }

  if (!text || text.trim().length === 0) {
    throw new Error('text cannot be empty');
  }

  let cleanClientId: string | undefined;
  if (clientId !== undefined) {
    cleanClientId = clientId.trim();
    if (!UUID_V7_REGEX.test(cleanClientId)) {
      throw new Error('Invalid clientId');
    }
  }

  const convObjectId = new Types.ObjectId(conversationId.toString());
  const senderObjectId = new Types.ObjectId(senderId.toString());

  const [conversation, participant] = await Promise.all([
    Conversation.findById(convObjectId).select('type').lean().exec(),
    ConversationParticipant.findOne({
      userId: senderObjectId,
      conversationId: convObjectId,
    })
      .select('permission')
      .lean()
      .exec(),
  ]);

  if (!conversation) {
    throw new Error('Conversation not found');
  }

  if (!participant) {
    throw new Error('Sender is not a participant in this conversation');
  }

  if (participant.permission === ParticipantPermission.READ) {
    throw new Error('Sender has read-only permission in this conversation');
  }

  if (isAnnouncement) {
    if (conversation.type !== ConversationType.CHANNEL) {
      throw new Error('Announcements are only allowed in club channels');
    }
    if (participant.permission !== ParticipantPermission.MODERATE) {
      throw new Error('Only moderators can post announcements');
    }
  }

  try {
    const created = await Message.create({
      conversationId: convObjectId,
      senderId: senderObjectId,
      text: text.trim(),
      clientId: cleanClientId,
      isAnnouncement,
      isSystem: false,
    });
    return created.toObject<IMessage>();
  } catch (error: unknown) {
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 11000 &&
      cleanClientId
    ) {
      const existing = await Message.findOne({
        conversationId: convObjectId,
        clientId: cleanClientId,
      })
        .lean<IMessage>()
        .exec();

      if (existing) {
        return existing;
      }
    }
    throw error;
  }
}

export async function getMessages(
  conversationId: Types.ObjectId | string,
  requestingUserId: Types.ObjectId | string,
  limit?: number
): Promise<IMessage[]> {
  if (!conversationId || !mongoose.isObjectIdOrHexString(conversationId)) {
    throw new Error('Valid conversationId is required');
  }

  if (!requestingUserId || !mongoose.isObjectIdOrHexString(requestingUserId)) {
    throw new Error('Valid requestingUserId is required');
  }

  const convObjectId = new Types.ObjectId(conversationId.toString());
  const userObjectId = new Types.ObjectId(requestingUserId.toString());

  const isParticipant = await isUserParticipant(convObjectId, userObjectId);
  if (!isParticipant) {
    throw new Error('User is not a participant in this conversation');
  }

  const query = Message.find({ conversationId: convObjectId }).sort({
    createdAt: -1,
    _id: -1,
  });

  if (typeof limit === 'number' && limit > 0) {
    query.limit(limit);
  }

  return query.lean<IMessage[]>().exec();
}
