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
  conversationId: Types.ObjectId,
  senderId: Types.ObjectId,
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

  const [conversation, participant] = await Promise.all([
    Conversation.findById(conversationId).select('type').lean().exec(),
    ConversationParticipant.findOne({
      userId: senderId,
      conversationId,
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
      conversationId,
      senderId,
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
        conversationId,
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
  conversationId: Types.ObjectId,
  requestingUserId: Types.ObjectId,
  limit?: number
): Promise<IMessage[]> {
  if (!conversationId || !mongoose.isObjectIdOrHexString(conversationId)) {
    throw new Error('Valid conversationId is required');
  }

  if (!requestingUserId || !mongoose.isObjectIdOrHexString(requestingUserId)) {
    throw new Error('Valid requestingUserId is required');
  }

  const isParticipant = await isUserParticipant(conversationId, requestingUserId);
  if (!isParticipant) {
    throw new Error('User is not a participant in this conversation');
  }

  const query = Message.find({ conversationId }).sort({
    createdAt: -1,
    _id: -1,
  });

  if (typeof limit === 'number' && limit > 0) {
    query.limit(limit);
  }

  const messages = await query.lean<IMessage[]>().exec();
  return messages.map((message) => {
    if (message.removedAt) {
      return {
        ...message,
        text: 'This message was deleted',
      };
    }
    return message;
  });
}

export async function deleteMessage(
  messageId: Types.ObjectId,
  requestingUserId: Types.ObjectId
): Promise<IMessage> {
  if (!messageId || !mongoose.isObjectIdOrHexString(messageId)) {
    throw new Error('Valid messageId is required');
  }

  if (!requestingUserId || !mongoose.isObjectIdOrHexString(requestingUserId)) {
    throw new Error('Valid requestingUserId is required');
  }

  const message = await Message.findById(messageId).exec();
  if (!message) {
    throw new Error('Message not found');
  }

  if (message.isSystem) {
    throw new Error('System messages cannot be deleted');
  }

  const requesterParticipant = await ConversationParticipant.findOne({
    userId: requestingUserId,
    conversationId: message.conversationId,
  })
    .select('permission')
    .lean()
    .exec();

  if (!requesterParticipant) {
    throw new Error('User is not authorized to delete this message');
  }

  const isAuthor = message.senderId.toString() === requestingUserId.toString();
  if (!isAuthor && requesterParticipant.permission !== ParticipantPermission.MODERATE) {
    throw new Error('User is not authorized to delete this message');
  }

  if (!message.removedAt) {
    message.removedAt = new Date();
    message.removedBy = requestingUserId;
    await message.save();
  }

  const messageObject = message.toObject<IMessage>();
  return {
    ...messageObject,
    text: 'This message was deleted',
  };
}

