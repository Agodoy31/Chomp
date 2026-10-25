import mongoose, { Types } from 'mongoose';
import { IMessage } from '../interfaces/message.interfaces';
import { ParticipantPermission } from '../interfaces/conversationParticipant.interfaces';
import { Conversation } from '../models/Conversation';
import { ConversationParticipant } from '../models/ConversationParticipant';
import { Message } from '../models/Message';

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

  const conversation = await Conversation.findById(convObjectId).lean().exec();
  if (!conversation) {
    throw new Error('Conversation not found');
  }

  const participant = await ConversationParticipant.findOne({
    conversationId: convObjectId,
    userId: senderObjectId,
  })
    .lean()
    .exec();

  if (!participant) {
    throw new Error('Sender is not a participant in this conversation');
  }

  if (participant.permission === ParticipantPermission.READ) {
    throw new Error('Sender has read-only permission in this conversation');
  }

  if (isAnnouncement && participant.permission !== ParticipantPermission.MODERATE) {
    throw new Error('Only moderators can post announcements');
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
