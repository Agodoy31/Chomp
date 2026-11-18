import { Request, Response } from 'express';
import mongoose from 'mongoose';
import { getClubChannels } from '../../messaging/services/conversation.service';
import { clubNotFound, memberRequired, sendError } from '../errors';
import { isAdmin } from '../isAdmin';
import { Club } from '../model/clubModel';
import { Membership } from '../model/membershipModel';

async function approvedClubExists(clubId: string): Promise<boolean> {
  return mongoose.isValidObjectId(clubId) && Boolean(await Club.exists({ _id: clubId, status: 'APPROVED' }));
}

async function isActiveMemberOrAdmin(userId: string, clubId: string): Promise<boolean> {
  const isMember = await Membership.exists({ userId, clubId, status: 'ACTIVE' });
  return Boolean(isMember) || Boolean(await isAdmin(userId));
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
