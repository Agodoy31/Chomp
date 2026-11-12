import { Request, Response } from 'express';
import mongoose from 'mongoose';
import { z } from 'zod';
import { createChannel } from '../../messaging/services/conversation.service';
import { CLUB_CATEGORIES, type ClientError, type ClubFilter } from '../interfaces/clubs.interface';
import { isAdmin } from '../isAdmin';
import { Club } from '../model/clubModel';
import { Membership } from '../model/membershipModel';
import {
  adminRequired,
  clubNameExists,
  clubNotFound,
  clubNotPending,
  invalidCategory,
  invalidClubRequest,
  isDuplicateKey,
  officerRequired,
  sendError,
} from '../errors';

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
            .min(1, 'Meeting location cannot be blank')
            .max(120, 'Meeting location must be 120 characters or fewer')
            .optional(),
        },
        { error: 'Meeting details must be an object' }
      )
      .optional(),
  },
  { error: 'Club name is required' }
);

const clubUpdateSchema = z
  .object(clubRequestSchema.shape, { error: 'Club details must be an object' })
  .partial()
  .refine((fields) => Object.keys(fields).length > 0, 'Provide at least one club field to update');

function clubRequestError(issue: { path: PropertyKey[]; message: string }): ClientError {
  return issue.path[0] === 'category' ? invalidCategory() : invalidClubRequest(issue.message);
}

function findApprovedClubByName(name: string, excludeClubId?: string) {
  const filter = excludeClubId ? { name, status: 'APPROVED', _id: { $ne: excludeClubId } } : { name, status: 'APPROVED' };
  return Club.exists(filter).collation({ locale: 'en', strength: 2 });
}

export const getClubs = async (req: Request, res: Response) => {
  const filter: ClubFilter = { status: 'APPROVED'};
  const queryCategory = req.query.category;
  if (typeof queryCategory === 'string') { // in case of single category
    const match = CLUB_CATEGORIES.find((category) => category === queryCategory.trim().toUpperCase());
    if (match === undefined){
      sendError(res, invalidCategory());
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
      sendError(res, invalidCategory());
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

export const getClubById = async (req: Request<{ clubId: string }>, res: Response): Promise<void> => {
  const clubId = req.params.clubId;
  const club = mongoose.isValidObjectId(clubId)
    ? await Club.findOne({ _id: clubId, status: 'APPROVED' })
        .select('-proposerId -__v -status -createdAt -updatedAt')
        .lean()
        .exec()
    : null;
  if (!club) {
    sendError(res, clubNotFound());
    return;
  }
  res.status(200).json({ club });
};

export const getPendingClubs = async (req: Request, res: Response): Promise<void> => {
  if (!(await isAdmin(req.session.userId!))) {
    sendError(res, adminRequired());
    return;
  }

  const clubs = await Club.find({ status: 'PENDING' }).select('-__v').sort({ createdAt: 1 }).lean().exec();
  res.status(200).json({ clubs });
};

export const requestClub = async (req: Request, res: Response): Promise<void> => {
  const parsed = clubRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    sendError(res, clubRequestError(parsed.error.issues[0]));
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
    sendError(res, clubNameExists());
    return;
  }

  await club.save();
  res.status(201).json(club);
};

export const updateClub = async (req: Request<{ clubId: string }>, res: Response): Promise<void> => {
  const clubId = req.params.clubId;
  if (!mongoose.isValidObjectId(clubId) || !(await Club.exists({ _id: clubId, status: 'APPROVED' }))) {
    sendError(res, clubNotFound());
    return;
  }

  const isOfficer = await Membership.exists({
    userId: req.session.userId,
    clubId,
    role: 'OFFICER',
    status: 'ACTIVE',
  });
  if (!isOfficer && !(await isAdmin(req.session.userId!))) {
    sendError(res, officerRequired());
    return;
  }

  const parsed = clubUpdateSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    sendError(res, clubRequestError(parsed.error.issues[0]));
    return;
  }

  if (parsed.data.name !== undefined && (await findApprovedClubByName(parsed.data.name, clubId))) {
    sendError(res, clubNameExists());
    return;
  }

  try {
    const club = await Club.findOneAndUpdate({ _id: clubId, status: 'APPROVED' }, { $set: parsed.data }, { new: true })
      .select('-proposerId -__v -status -createdAt -updatedAt')
      .lean()
      .exec();
    if (!club) {
      sendError(res, clubNotFound());
      return;
    }
    res.status(200).json({ club });
  } catch (error) {
    if (isDuplicateKey(error)) {
      sendError(res, clubNameExists());
      return;
    }
    throw error;
  }
};

// See Issue #31: https://github.com/Agodoy31/Chomp/issues/31
export const approveClub = async (req: Request<{ clubId: string }>, res: Response): Promise<void> => {
  if (!(await isAdmin(req.session.userId!))) {
    sendError(res, adminRequired());
    return;
  }

  const clubId = req.params.clubId;
  if (!mongoose.isValidObjectId(clubId)) {
    sendError(res, clubNotFound());
    return;
  }

  const club = await Club.findById(clubId);
  if (!club) {
    sendError(res, clubNotFound());
    return;
  }
  if (club.status !== 'PENDING') {
    sendError(res, clubNotPending('approved'));
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
      sendError(res, clubNotPending('approved'));
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
      sendError(res, clubNameExists());
      return;
    }
    throw error;
  } finally {
    await session.endSession();
  }
};

export const rejectClub = async (req: Request<{ clubId: string }>, res: Response): Promise<void> => {
  if (!(await isAdmin(req.session.userId!))) {
    sendError(res, adminRequired());
    return;
  }

  const clubId = req.params.clubId;
  if (!mongoose.isValidObjectId(clubId) || !(await Club.exists({ _id: clubId }))) {
    sendError(res, clubNotFound());
    return;
  }

  // Filtering on PENDING keeps a simultaneous approve and reject from both succeeding.
  const rejected = await Club.findOneAndUpdate(
    { _id: clubId, status: 'PENDING' },
    { status: 'REJECTED' },
    { new: true }
  )
    .select('-__v')
    .lean()
    .exec();
  if (!rejected) {
    sendError(res, clubNotPending('rejected'));
    return;
  }
  res.status(200).json({ club: rejected });
};
