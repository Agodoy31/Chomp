import mongoose, { Types } from 'mongoose';
import { IHydratedMessage, IMessage } from '../interfaces/message.interfaces';
import { ConversationType, IUserSummary } from '../interfaces/conversation.interfaces';
import { ParticipantPermission } from '../interfaces/conversationParticipant.interfaces';
import { Conversation } from '../models/Conversation';
import { ConversationParticipant } from '../models/ConversationParticipant';
import { Message } from '../models/Message';
import { User } from '../../user/models/User';
import { isUserParticipant } from './conversation.service';
import { MessagingError, MessagingErrorCode } from '../errors/messagingError';

const UUID_V7_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface SendMessageResult {
  message: IHydratedMessage;
  isNew: boolean;
}

async function hydrateMessages(messages: IMessage[]): Promise<IHydratedMessage[]> {
  if (messages.length === 0) {
    return [];
  }

  const uniqueSenderIds = [
    ...new Map(messages.map((m) => [m.senderId.toString(), m.senderId])).values(),
  ];

  const users = await User.find({ _id: { $in: uniqueSenderIds } })
    .select('firstName lastName')
    .lean<IUserSummary[]>()
    .exec();

  const userMap = new Map<string, IUserSummary>(
    users.map((user) => [user._id.toString(), user])
  );

  return messages.map((message) => {
    const sender = userMap.get(message.senderId.toString());
    if (!sender) {
      throw new MessagingError(
        MessagingErrorCode.USER_NOT_FOUND,
        'Message sender not found'
      );
    }

    const { senderId: _senderId, ...rest } = message;
    return {
      ...rest,
      sender,
    };
  });
}

export async function sendMessage(
  conversationId: Types.ObjectId,
  senderId: Types.ObjectId,
  text: string,
  clientId?: string,
  isAnnouncement = false
): Promise<SendMessageResult> {
  if (!conversationId || !mongoose.isObjectIdOrHexString(conversationId)) {
    throw new MessagingError(
      MessagingErrorCode.INVALID_INPUT,
      'Valid conversationId is required'
    );
  }

  if (!senderId || !mongoose.isObjectIdOrHexString(senderId)) {
    throw new MessagingError(
      MessagingErrorCode.INVALID_INPUT,
      'Valid senderId is required'
    );
  }

  if (!text || text.trim().length === 0) {
    throw new MessagingError(
      MessagingErrorCode.INVALID_INPUT,
      'text cannot be empty'
    );
  }

  let cleanClientId: string | undefined;
  if (clientId !== undefined) {
    cleanClientId = clientId.trim();
    if (!UUID_V7_REGEX.test(cleanClientId)) {
      throw new MessagingError(
        MessagingErrorCode.INVALID_INPUT,
        'Invalid clientId'
      );
    }
  }

  const [conversation, participant] = await Promise.all([
    Conversation.findOne({ _id: conversationId, deleted: false })
      .select('type')
      .lean()
      .exec(),
    ConversationParticipant.findOne({
      userId: senderId,
      conversationId,
    })
      .select('permission')
      .lean()
      .exec(),
  ]);

  if (!conversation) {
    throw new MessagingError(
      MessagingErrorCode.CONVERSATION_NOT_FOUND,
      'Conversation not found'
    );
  }

  if (!participant) {
    throw new MessagingError(
      MessagingErrorCode.NOT_PARTICIPANT,
      'Sender is not a participant in this conversation'
    );
  }

  if (participant.permission === ParticipantPermission.READ) {
    throw new MessagingError(
      MessagingErrorCode.PERMISSION_DENIED,
      'Sender has read-only permission in this conversation'
    );
  }

  if (isAnnouncement) {
    if (conversation.type !== ConversationType.CHANNEL) {
      throw new MessagingError(
        MessagingErrorCode.INVALID_INPUT,
        'Announcements are only allowed in club channels'
      );
    }
    if (participant.permission !== ParticipantPermission.MODERATE) {
      throw new MessagingError(
        MessagingErrorCode.OFFICER_PERMISSION_REQUIRED,
        'Only moderators can post announcements'
      );
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
    const [hydrated] = await hydrateMessages([created.toObject<IMessage>()]);
    return {
      message: hydrated,
      isNew: true,
    };
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
        const [hydrated] = await hydrateMessages([existing]);
        return {
          message: hydrated,
          isNew: false,
        };
      }
    }
    throw error;
  }
}

export async function getMessages(
  conversationId: Types.ObjectId,
  requestingUserId: Types.ObjectId,
  limit?: number
): Promise<IHydratedMessage[]> {
  if (!conversationId || !mongoose.isObjectIdOrHexString(conversationId)) {
    throw new MessagingError(
      MessagingErrorCode.INVALID_INPUT,
      'Valid conversationId is required'
    );
  }

  if (!requestingUserId || !mongoose.isObjectIdOrHexString(requestingUserId)) {
    throw new MessagingError(
      MessagingErrorCode.INVALID_INPUT,
      'Valid requestingUserId is required'
    );
  }

  const [conversationExists, isParticipant] = await Promise.all([
    Conversation.exists({ _id: conversationId, deleted: false }),
    isUserParticipant(conversationId, requestingUserId),
  ]);
  if (!conversationExists) {
    throw new MessagingError(
      MessagingErrorCode.CONVERSATION_NOT_FOUND,
      'Conversation not found'
    );
  }
  if (!isParticipant) {
    throw new MessagingError(
      MessagingErrorCode.NOT_PARTICIPANT,
      'User is not a participant in this conversation'
    );
  }

  const query = Message.find({ conversationId }).sort({
    createdAt: -1,
    _id: -1,
  });

  if (typeof limit === 'number' && limit > 0) {
    query.limit(limit);
  }

  const messages = await query.lean<IMessage[]>().exec();
  const sanitized = messages.map((message) => {
    if (message.removedAt) {
      return {
        ...message,
        text: 'This message was deleted',
      };
    }
    return message;
  });
  return hydrateMessages(sanitized);
}

export async function deleteMessage(
  conversationId: Types.ObjectId,
  messageId: Types.ObjectId,
  requestingUserId: Types.ObjectId
): Promise<IHydratedMessage> {
  if (!conversationId || !mongoose.isObjectIdOrHexString(conversationId)) {
    throw new MessagingError(
      MessagingErrorCode.VALIDATION_FAILED,
      'Valid conversationId is required'
    );
  }

  if (!messageId || !mongoose.isObjectIdOrHexString(messageId)) {
    throw new MessagingError(
      MessagingErrorCode.VALIDATION_FAILED,
      'Valid messageId is required'
    );
  }

  if (!requestingUserId || !mongoose.isObjectIdOrHexString(requestingUserId)) {
    throw new MessagingError(
      MessagingErrorCode.VALIDATION_FAILED,
      'Valid requestingUserId is required'
    );
  }

  const message = await Message.findById(messageId).exec();
  if (!message || message.conversationId.toString() !== conversationId.toString()) {
    throw new MessagingError(
      MessagingErrorCode.MESSAGE_NOT_FOUND,
      'Message not found'
    );
  }

  const conversationExists = await Conversation.exists({
    _id: conversationId,
    deleted: false,
  });
  if (!conversationExists) {
    throw new MessagingError(
      MessagingErrorCode.CONVERSATION_NOT_FOUND,
      'Conversation not found'
    );
  }

  if (message.isSystem) {
    throw new MessagingError(
      MessagingErrorCode.PERMISSION_DENIED,
      'System messages cannot be deleted'
    );
  }

  const requesterParticipant = await ConversationParticipant.findOne({
    userId: requestingUserId,
    conversationId: message.conversationId,
  })
    .select('permission')
    .lean()
    .exec();

  if (!requesterParticipant) {
    throw new MessagingError(
      MessagingErrorCode.PERMISSION_DENIED,
      'User is not authorized to delete this message'
    );
  }

  const isAuthor = message.senderId.toString() === requestingUserId.toString();
  if (!isAuthor && requesterParticipant.permission !== ParticipantPermission.MODERATE) {
    throw new MessagingError(
      MessagingErrorCode.PERMISSION_DENIED,
      'User is not authorized to delete this message'
    );
  }

  if (!message.removedAt) {
    message.removedAt = new Date();
    message.removedBy = requestingUserId;
    await message.save();
  }

  const messageObject = message.toObject<IMessage>();
  const [hydrated] = await hydrateMessages([
    {
      ...messageObject,
      text: 'This message was deleted',
    },
  ]);
  return hydrated;
}

