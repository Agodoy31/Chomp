import { Request, Response } from 'express';
import mongoose from 'mongoose';
import { getClubChannels } from '../../messaging/services/conversation.service';
import { updateConversationTitleBodySchema } from '../../messaging/validators/conversation.validator';
import { approvedClubExists, canManageChannels, isActiveMemberOrAdmin } from '../clubAccess';
import {
  channelNotFound,
  clubNotFound,
  invalidChannelTitle,
  memberRequired,
  officerRequired,
  sendError,
} from '../errors';
import {
  type ChannelCommandResult,
  createClubChannel as commitClubChannel,
  removeClubChannel as commitChannelRemoval,
  renameClubChannel as commitChannelRename,
} from '../services/clubChannelAccess';

function sendChannel(res: Response, status: number, result: ChannelCommandResult): void {
  if ('error' in result) {
    sendError(res, result.error);
    return;
  }
  res.status(status).json({ channel: result.channel });
}

export const listClubChannels = async (req: Request<{ clubId: string }>, res: Response): Promise<void> => {
  const userId = req.session.userId!;
  const clubId = req.params.clubId;

  if (!(await approvedClubExists(clubId))) {
    sendError(res, clubNotFound());
    return;
  }
  if (!(await isActiveMemberOrAdmin(userId, clubId))) {
    sendError(res, memberRequired());
    return;
  }

  const channels = await getClubChannels(new mongoose.Types.ObjectId(clubId));
  res.status(200).json({
    channels: channels.map((channel) => ({ _id: channel._id.toString(), title: channel.title })),
  });
};

export const createClubChannel = async (req: Request<{ clubId: string }>, res: Response): Promise<void> => {
  const userId = req.session.userId!;
  const clubId = req.params.clubId;

  if (!(await approvedClubExists(clubId))) {
    sendError(res, clubNotFound());
    return;
  }
  if (!(await canManageChannels(userId, clubId))) {
    sendError(res, officerRequired());
    return;
  }

  const parsed = updateConversationTitleBodySchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    sendError(res, invalidChannelTitle());
    return;
  }

  sendChannel(
    res,
    201,
    await commitClubChannel({ clubId: new mongoose.Types.ObjectId(clubId), title: parsed.data.title })
  );
};

export const renameClubChannel = async (
  req: Request<{ clubId: string; channelId: string }>,
  res: Response
): Promise<void> => {
  const userId = req.session.userId!;
  const { clubId, channelId } = req.params;

  if (!(await approvedClubExists(clubId))) {
    sendError(res, clubNotFound());
    return;
  }
  if (!(await canManageChannels(userId, clubId))) {
    sendError(res, officerRequired());
    return;
  }
  if (!mongoose.isValidObjectId(channelId)) {
    sendError(res, channelNotFound());
    return;
  }

  const parsed = updateConversationTitleBodySchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    sendError(res, invalidChannelTitle());
    return;
  }

  sendChannel(
    res,
    200,
    await commitChannelRename({
      clubId: new mongoose.Types.ObjectId(clubId),
      channelId: new mongoose.Types.ObjectId(channelId),
      title: parsed.data.title,
      requesterId: new mongoose.Types.ObjectId(userId),
    })
  );
};

export const removeClubChannel = async (
  req: Request<{ clubId: string; channelId: string }>,
  res: Response
): Promise<void> => {
  const userId = req.session.userId!;
  const { clubId, channelId } = req.params;

  if (!(await approvedClubExists(clubId))) {
    sendError(res, clubNotFound());
    return;
  }
  if (!(await canManageChannels(userId, clubId))) {
    sendError(res, officerRequired());
    return;
  }
  if (!mongoose.isValidObjectId(channelId)) {
    sendError(res, channelNotFound());
    return;
  }

  sendChannel(
    res,
    200,
    await commitChannelRemoval({
      clubId: new mongoose.Types.ObjectId(clubId),
      channelId: new mongoose.Types.ObjectId(channelId),
    })
  );
};
