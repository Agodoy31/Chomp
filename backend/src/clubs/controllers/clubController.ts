import { Request, Response } from 'express';
import mongoose from 'mongoose';
import { createChannel } from '../../messaging/services/conversation.service';
import { User } from '../../user/models/User';
import {
  CLUB_CATEGORIES,
  type ClientError,
  type ClubFilter,
  type ClubRequest,
} from '../interfaces/clubs.interface';
import { Club } from '../model/clubModel';
import { Membership } from '../model/membershipModel';
import { adminRequired, authenticationRequired, isDuplicateKey, sendError } from '../errors';

const DEFAULT_CHANNEL_TITLE = 'General';

const clubNotFound: ClientError = { status: 404, code: 'ERR_CLUB_NOT_FOUND', message: 'Club not found' };

const clubNotPending: ClientError = {
  status: 409,
  code: 'ERR_CLUB_NOT_PENDING',
  message: 'Only pending club requests can be approved',
};

const clubNameExists: ClientError = {
  status: 409,
  code: 'ERR_CLUB_NAME_EXISTS',
  message: 'An approved club already uses this name',
};

const invalidCategory: ClientError = { status: 400, code: 'ERR_INVALID_CATEGORY', message: 'Invalid Category' };

function findApprovedClubByName(name: string) {
  return Club.exists({ name, status: 'APPROVED' }).collation({ locale: 'en', strength: 2 });
}

export const getClubs = async (req: Request, res: Response) => {
  const filter: ClubFilter = { status: 'APPROVED'};
  const queryCategory = req.query.category;
  if (typeof queryCategory === 'string') { // in case of single category
    const match = CLUB_CATEGORIES.find((category) => category === queryCategory.trim().toUpperCase());
    if (match === undefined){
      sendError(res, { 
        status: 400, 
        code: 'ERR_INVALID_CATEGORY', 
        message: 'Invalid Category' 
      });
      return;
    }
    filter.category = match;

  } else if (Array.isArray(queryCategory)) { // in case of multiple categories
    const categories = queryCategory
      .map((category) => {
        if (typeof category !== 'string') return undefined;
         return CLUB_CATEGORIES.find((entry) => entry === category.trim().toUpperCase());
      });
    if (categories.some((category) => category === undefined)){
      sendError(res, { 
        status: 400, 
        code: 'ERR_INVALID_CATEGORY', 
        message: 'Invalid Category' 
      });
      return;
    }
    filter.category = { $in: categories.filter((category) => category !== undefined) };
  }

  const clubs = await Club.find(filter)
    .select('-proposerId -__v -status -createdAt -updatedAt')
    .sort({ name: 1 })
    .collation({ locale: 'en', strength: 2 })
    .lean()
    .exec();
  res.status(200).json({ clubs });
};

export const requestClub = async (req: Request, res: Response): Promise<void> => {
  const userId = req.session?.userId;
  if (!userId) {
    sendError(res, authenticationRequired());
    return;
  }

  const { name, description, category, meeting }: Partial<ClubRequest> = req.body ?? {};
  const club = new Club({
    name,
    description,
    category: typeof category === 'string' ? category.trim().toUpperCase() : category,
    meeting,
    proposerId: userId,
    status: 'PENDING',
  });

  const validationError = club.validateSync();
  if (validationError) {
    const [firstError] = Object.values(validationError.errors);
    sendError(
      res,
      firstError.path === 'category'
        ? invalidCategory
        : { status: 400, code: 'ERR_INVALID_CLUB_REQUEST', message: firstError.message }
    );
    return;
  }

  if (await findApprovedClubByName(club.name)) {
    sendError(res, clubNameExists);
    return;
  }

  await club.save();
  res.status(201).json(club);
};

// See Issue #31: https://github.com/Agodoy31/Chomp/issues/31
export const createClub = async (req: Request<{ clubId: string }>, res: Response): Promise<void> => {
  const userId = req.session?.userId;
  if (!userId) {
    sendError(res, authenticationRequired());
    return;
  }

  const isAdmin = await User.exists({ _id: userId, isAdmin: true });
  if (!isAdmin) {
    sendError(res, adminRequired());
    return;
  }

  const clubId = req.params.clubId;
  if (!mongoose.isValidObjectId(clubId)) {
    sendError(res, clubNotFound);
    return;
  }

  const club = await Club.findById(clubId);
  if (!club) {
    sendError(res, clubNotFound);
    return;
  }
  if (club.status !== 'PENDING') {
    sendError(res, clubNotPending);
    return;
  }

  const proposerExists = await User.exists({ _id: club.proposerId });
  if (!proposerExists) {
    sendError(res, {
      status: 404,
      code: 'ERR_PROPOSER_NOT_FOUND',
      message: 'The student who requested this club no longer exists',
    });
    return;
  }

  const session = await mongoose.startSession();
  try {
    session.startTransaction();

    const approved = await Club.findOneAndUpdate(
      { _id: club._id, status: 'PENDING' },
      { status: 'APPROVED' },
      { new: true, session }
    );
    // Another request can approve or reject the club after the status check above.
    if (!approved) {
      await session.abortTransaction();
      sendError(res, clubNotPending);
      return;
    }

    const [membership] = await Membership.create(
      [{ userId: club.proposerId, clubId: club._id, role: 'OFFICER', status: 'ACTIVE' }],
      { session }
    );
    const conversation = await createChannel(club._id, DEFAULT_CHANNEL_TITLE, [club.proposerId], session);

    await session.commitTransaction();
    res.status(201).json({ club: approved, membership, conversation });
  } catch (error) {
    if (session.inTransaction()) {
      await session.abortTransaction();
    }
    if (isDuplicateKey(error) && (await findApprovedClubByName(club.name))) {
      sendError(res, clubNameExists);
      return;
    }
    throw error;
  } finally {
    await session.endSession();
  }
};
