import { Request, Response } from 'express';
import mongoose from 'mongoose';
import { z } from 'zod';
import { createChannel } from '../../messaging/services/conversation.service';
import { User } from '../../user/models/User';
import { CLUB_CATEGORIES, type ClubFilter } from '../interfaces/clubs.interface';
import { Club } from '../model/clubModel';
import { Membership } from '../model/membershipModel';
import { adminRequired, isDuplicateKey, sendError } from '../errors';

const DEFAULT_CHANNEL_TITLE = 'General';

const clubNameRegex = /^[\p{L}\p{M}\p{N}\p{P} +]+$/u;
const dayOfWeekRegex = /^(monday|tuesday|wednesday|thursday|friday|saturday|sunday)$/i;
const meetingTimeRegex = /^(0?[1-9]|1[0-2]):[0-5]\d ?[AP]M$/i;

const clubRequestSchema = z.object(
  {
    name: z
      .string({
        error: (issue) => (issue.input === undefined ? 'Club name is required' : 'Club name must be text'),
      })
      .trim()
      .min(1, 'Club name is required')
      .max(100, 'Club name must be 100 characters or fewer')
      .regex(clubNameRegex, 'Club name can only use letters, numbers, spaces, punctuation, and +'),
    description: z
      .string({
        error: (issue) =>
          issue.input === undefined ? 'Club description is required' : 'Club description must be text',
      })
      .trim()
      .min(1, 'Club description is required')
      .max(1000, 'Club description must be 1000 characters or fewer'),
    category: z.string().trim().toUpperCase().pipe(z.enum(CLUB_CATEGORIES)).optional(),
    meeting: z
      .object(
        {
          day: z
            .string({ error: 'Meeting day must be text' })
            .trim()
            .regex(dayOfWeekRegex, 'Meeting day must be a day of the week')
            .optional(),
          time: z
            .string({ error: 'Meeting time must be text' })
            .trim()
            .regex(meetingTimeRegex, 'Meeting time must look like 6:30 PM')
            .optional(),
          location: z
            .string({ error: 'Meeting location must be text' })
            .trim()
            .max(120, 'Meeting location must be 120 characters or fewer')
            .optional(),
        },
        { error: 'Meeting details must be an object' }
      )
      .optional(),
  },
  { error: 'Club name is required' }
);

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
  const parsed = clubRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    const [issue] = parsed.error.issues;
    sendError(
      res,
      issue.path[0] === 'category'
        ? { 
          status: 400, 
          code: 'ERR_INVALID_CATEGORY', 
          message: 'Invalid Category' 
        }
        : { 
          status: 400, 
          code: 'ERR_INVALID_CLUB_REQUEST', 
          message: issue.message 
      });
    return;
  }

  const { name, description, category, meeting } = parsed.data;
  const club = new Club({
    name,
    description,
    category,
    meeting,
    proposerId: req.session.userId,
    status: 'PENDING',
  });

  if (await findApprovedClubByName(club.name)) {
    sendError(res, {
      status: 409,
      code: 'ERR_CLUB_NAME_EXISTS',
      message: 'An approved club already uses this name',
    });
    return;
  }

  await club.save();
  res.status(201).json(club);
};

// See Issue #31: https://github.com/Agodoy31/Chomp/issues/31
export const approveClub = async (req: Request<{ clubId: string }>, res: Response): Promise<void> => {
  const isAdmin = await User.exists({ _id: req.session.userId, isAdmin: true });
  if (!isAdmin) {
    sendError(res, adminRequired());
    return;
  }

  const clubId = req.params.clubId;
  if (!mongoose.isValidObjectId(clubId)) {
    sendError(res, 
      { 
        status: 404, 
        code: 'ERR_CLUB_NOT_FOUND', 
        message: 'Club not found' 
      });
    return;
  }

  const club = await Club.findById(clubId);
  if (!club) {
    sendError(res, {
      status: 404,
      code: 'ERR_CLUB_NOT_FOUND',
      message: 'Club not found',
    });
    return;
  }
  if (club.status !== 'PENDING') {
    sendError(res, {
      status: 409,
      code: 'ERR_CLUB_NOT_PENDING',
      message: 'Only pending club requests can be approved',
    });
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
      sendError(res, {
        status: 409,
        code: 'ERR_CLUB_NOT_PENDING',
        message: 'Only pending club requests can be approved',
      });
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
    if (isDuplicateKey(error)) {
      sendError(res, {
        status: 409,
        code: 'ERR_CLUB_NAME_EXISTS',
        message: 'An approved club already uses this name',
      });
      return;
    }
    throw error;
  } finally {
    await session.endSession();
  }
};
