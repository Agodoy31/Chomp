import { Request, Response } from 'express';
import mongoose, { Types } from 'mongoose';
import {
  messageHistoryQuerySchema,
  postMessageBodySchema,
} from '../validators/message.validator';
import { deleteMessage, getMessages, sendMessage } from '../services/message.service';
import { MessagingError, MessagingErrorCode } from '../errors/messagingError';
import { sendMessagingError } from './messagingErrorResponse';
import { toMessageResponse } from '../serializers/messageResponse';
import { messagingPublisher } from '../sockets/messagingPublisher';
import { Conversation, ConversationType } from '../models/Conversation';
import { ConversationParticipant } from '../models/ConversationParticipant';
import { Message } from '../models/Message';
import { getUserConversationFeedItem } from '../services/conversation.service';
import { toConversationFeedResponse } from '../serializers/conversationFeedResponse';

export async function postMessageHandler(req: Request, res: Response): Promise<void> {
  const id = req.params?.id;
  if (typeof id !== 'string' || !mongoose.isObjectIdOrHexString(id)) {
    res.status(400).json({
      code: 'ERR_INVALID_INPUT',
      message: 'Valid conversationId is required',
    });
    return;
  }

  const parseResult = postMessageBodySchema.safeParse(req.body);
  if (!parseResult.success) {
    const firstIssue = parseResult.error.issues[0];
    const field = firstIssue?.path[0] !== undefined ? String(firstIssue.path[0]) : undefined;
    const message = firstIssue?.message || 'Validation failed';
    res.status(400).json({
      code: 'ERR_VALIDATION_FAILED',
      message,
      ...(field !== undefined ? { field } : {}),
    });
    return;
  }

  const userId = req.session?.userId;
  if (typeof userId !== 'string' || !mongoose.isObjectIdOrHexString(userId)) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  try {
    const { message, isNew } = await sendMessage(
      new Types.ObjectId(id),
      new Types.ObjectId(userId),
      parseResult.data.text,
      parseResult.data.clientId,
      parseResult.data.isAnnouncement
    );

    if (isNew) {
      messagingPublisher.messageCreated(message);

      const conversation = await Conversation.findById(id).select('type').lean();
      if (conversation && conversation.type === ConversationType.DIRECT) {
        const messageCount = await Message.countDocuments({
          conversationId: new Types.ObjectId(id),
        });
        if (messageCount === 1) {
          const participants = await ConversationParticipant.find({
            conversationId: new Types.ObjectId(id),
          })
            .select('userId')
            .lean();
          for (const p of participants) {
            const feedItem = await getUserConversationFeedItem(
              new Types.ObjectId(id),
              p.userId
            );
            if (feedItem) {
              messagingPublisher.conversationAdded(
                p.userId.toString(),
                toConversationFeedResponse(feedItem)
              );
            }
          }
        }
      }
    }

    res.status(isNew ? 201 : 200).json(toMessageResponse(message));
  } catch (error) {
    sendMessagingError(res, error);
  }
}

export async function getMessageHistoryHandler(req: Request, res: Response): Promise<void> {
  const id = req.params?.id;
  if (typeof id !== 'string' || !mongoose.isObjectIdOrHexString(id)) {
    res.status(400).json({
      code: 'ERR_INVALID_INPUT',
      message: 'Valid conversationId is required',
    });
    return;
  }

  const parseResult = messageHistoryQuerySchema.safeParse(req.query);
  if (!parseResult.success) {
    res.status(400).json({
      code: 'ERR_VALIDATION_FAILED',
      message: 'limit must be an integer between 1 and 100',
    });
    return;
  }

  const userId = req.session?.userId;
  if (typeof userId !== 'string' || !mongoose.isObjectIdOrHexString(userId)) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const conversationId = new Types.ObjectId(id);
  const requestingUserId = new Types.ObjectId(userId);

  try {
    const messages = await getMessages(
      conversationId,
      requestingUserId,
      parseResult.data.limit
    );
    const response = messages.map(toMessageResponse);
    res.status(200).json(response);
  } catch (error: unknown) {
    if (
      error instanceof MessagingError &&
      (error.code === MessagingErrorCode.NOT_PARTICIPANT ||
        error.code === MessagingErrorCode.CONVERSATION_NOT_FOUND)
    ) {
      res.status(404).json({
        code: 'ERR_CONVERSATION_NOT_FOUND',
        message: 'Conversation not found',
      });
      return;
    }
    sendMessagingError(res, error);
  }
}

export async function deleteMessageHandler(req: Request, res: Response): Promise<void> {
  const id = req.params?.id;
  if (typeof id !== 'string' || !mongoose.isObjectIdOrHexString(id)) {
    res.status(400).json({
      code: MessagingErrorCode.VALIDATION_FAILED,
      message: 'Valid conversationId is required',
      field: 'id',
    });
    return;
  }

  const messageId = req.params?.messageId;
  if (typeof messageId !== 'string' || !mongoose.isObjectIdOrHexString(messageId)) {
    res.status(400).json({
      code: MessagingErrorCode.VALIDATION_FAILED,
      message: 'Valid messageId is required',
      field: 'messageId',
    });
    return;
  }

  const userId = req.session?.userId;
  if (typeof userId !== 'string' || !mongoose.isObjectIdOrHexString(userId)) {
    res.status(401).json({ message: 'ERR_REQUIRE_AUTH' });
    return;
  }

  try {
    const deleted = await deleteMessage(
      new Types.ObjectId(id),
      new Types.ObjectId(messageId),
      new Types.ObjectId(userId)
    );
    messagingPublisher.messageDeleted(deleted);
    res.status(200).json(toMessageResponse(deleted));
  } catch (error: unknown) {
    sendMessagingError(res, error);
  }
}
