import { Request, Response } from 'express';
import mongoose, { Types } from 'mongoose';
import { createConversationBodySchema } from '../validators/conversation.validator';
import {
  createDirectConversation,
  createGroupConversation,
  getConversationDetails,
} from '../services/conversation.service';
import { MessagingErrorCode } from '../errors/messagingError';
import { sendMessagingError } from './messagingErrorResponse';

export async function postConversationHandler(req: Request, res: Response): Promise<void> {
  const body = req.body;
  if (!body || typeof body !== 'object') {
    res.status(400).json({
      code: 'ERR_VALIDATION_FAILED',
      message: 'Validation failed',
    });
    return;
  }

  if (body.type === 'CHANNEL') {
    res.status(400).json({
      code: MessagingErrorCode.CHANNEL_CREATION_NOT_SUPPORTED,
      message: 'Club channels cannot be created through this endpoint',
    });
    return;
  }

  if (body.type === 'GROUP' && (typeof body.title !== 'string' || body.title.trim().length === 0)) {
    res.status(400).json({
      code: MessagingErrorCode.TITLE_REQUIRED,
      message: 'Title is required',
    });
    return;
  }

  const parseResult = createConversationBodySchema.safeParse(body);
  if (!parseResult.success) {
    res.status(400).json({
      code: 'ERR_VALIDATION_FAILED',
      message: 'Validation failed',
    });
    return;
  }

  const sessionUserId = req.session?.userId;
  if (typeof sessionUserId !== 'string' || !mongoose.isObjectIdOrHexString(sessionUserId)) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const creatorId = new Types.ObjectId(sessionUserId);

  try {
    if (parseResult.data.type === 'DIRECT') {
      const recipientRaw = parseResult.data.recipientId;
      if (!mongoose.isObjectIdOrHexString(recipientRaw)) {
        res.status(400).json({
          code: MessagingErrorCode.INVALID_INPUT,
          message: 'Valid recipientId is required',
        });
        return;
      }

      const recipientId = new Types.ObjectId(recipientRaw);
      const result = await createDirectConversation(creatorId, recipientId);
      const details = await getConversationDetails(result.conversation._id, creatorId);
      if (!details) {
        res.status(500).json({
          code: 'ERR_SERVER_ERROR',
          message: 'An unexpected error occurred',
        });
        return;
      }

      res.status(result.isNew ? 201 : 200).json(details);
      return;
    }

    const participantIdsRaw = parseResult.data.participantIds;
    const participantIds: Types.ObjectId[] = [];
    for (const id of participantIdsRaw) {
      if (!mongoose.isObjectIdOrHexString(id)) {
        res.status(400).json({
          code: MessagingErrorCode.INVALID_INPUT,
          message: 'Valid participantIds are required',
        });
        return;
      }
      participantIds.push(new Types.ObjectId(id));
    }

    const group = await createGroupConversation(
      creatorId,
      participantIds,
      parseResult.data.title.trim()
    );
    const details = await getConversationDetails(group._id, creatorId);
    if (!details) {
      res.status(500).json({
        code: 'ERR_SERVER_ERROR',
        message: 'An unexpected error occurred',
      });
      return;
    }

    res.status(201).json(details);
  } catch (error: unknown) {
    sendMessagingError(res, error);
  }
}
