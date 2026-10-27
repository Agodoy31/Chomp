import { Request, Response } from 'express';
import mongoose, { Types } from 'mongoose';
import { IMessage } from '../interfaces/message.interfaces';
import { IMessageResponse } from '../interfaces/message.responses';
import {
  messageHistoryQuerySchema,
  postMessageBodySchema,
} from '../validators/message.validator';
import { getMessages, sendMessage } from '../services/message.service';
import { MessagingError, MessagingErrorCode } from '../errors/messagingError';
import { sendMessagingError } from './messagingErrorResponse';

export function toMessageResponse(message: IMessage): IMessageResponse {
  const response: IMessageResponse = {
    _id: message._id.toString(),
    conversationId: message.conversationId.toString(),
    senderId: message.senderId.toString(),
    text: message.removedAt ? 'This message was deleted' : message.text,
    isAnnouncement: message.isAnnouncement,
    isSystem: message.isSystem,
    createdAt: message.createdAt.toISOString(),
  };

  if (message.clientId) {
    response.clientId = message.clientId;
  }

  if (message.removedAt) {
    response.removedAt = message.removedAt.toISOString();
  }

  return response;
}

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
    const code = firstIssue?.message || 'ERR_VALIDATION_FAILED';
    let message = 'Validation failed';
    if (code === 'ERR_TEXT_EMPTY') {
      message = 'Message text cannot be empty';
    } else if (code === 'ERR_CLIENT_ID_INVALID') {
      message = 'Client ID must be a valid UUIDv7';
    }
    res.status(400).json({ code, message });
    return;
  }

  const userId = req.session?.userId;
  if (typeof userId !== 'string' || !mongoose.isObjectIdOrHexString(userId)) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  try {
    const message = await sendMessage(
      new Types.ObjectId(id),
      new Types.ObjectId(userId),
      parseResult.data.text,
      parseResult.data.clientId,
      parseResult.data.isAnnouncement
    );

    res.status(201).json(toMessageResponse(message));
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
