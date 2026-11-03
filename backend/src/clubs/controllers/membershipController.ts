import { Request, Response } from 'express';
import mongoose, { type ClientSession, type HydratedDocument } from 'mongoose';
import { addParticipantsToConversation, getClubChannels } from '../../messaging/services/conversation.service';
import { User } from '../../user/models/User';
import { Club } from '../model/clubModel';
import { Membership, type Membership as MembershipShape } from '../model/membershipModel';
import { type MembershipStatus, type ClubStatus, type ClientError } from '../interfaces/clubs.interface';
import { sendError, isDuplicateKey, clubNotFound, notActiveMember, lastOfficer } from '../errors';

type MembershipRecord = HydratedDocument<MembershipShape>;

type ActivationResult = { membership: MembershipRecord } | { error: ClientError };

function rejectionForClub(status: Exclude<ClubStatus, 'APPROVED'>): ClientError {
  if (status === 'PENDING') {
    return { 
      status: 403, 
      code: 'ERR_CLUB_NOT_APPROVED', 
      message: 'This club is pending approval and cannot be joined yet' 
    };
  }
  return { 
    status: 403, 
    code: 'ERR_CLUB_NOT_APPROVED', 
    message: 'This club was rejected and cannot be joined' 
  };
}

function rejectionForMembership(status: Exclude<MembershipStatus, 'INACTIVE'>): ClientError {
  if (status === 'REMOVED') {
    return { 
      status: 403, 
      code: 'ERR_MEMBER_REMOVED', 
      message: 'Removed members cannot rejoin this club' 
    };
  }
  if (status === 'PENDING') {
    return { 
      status: 409, 
      code: 'ERR_MEMBERSHIP_PENDING', 
      message: 'A request to join this club is already pending' 
    };
  }
  if (status === 'REJECTED') {
    return { 
      status: 403, 
      code: 'ERR_MEMBERSHIP_REJECTED', 
      message: 'Rejected members cannot rejoin this club' 
    };
  }
  return { 
    status: 409, 
    code: 'ERR_ALREADY_MEMBER', 
    message: 'Already an active member of this club' 
  };
}

async function activateMembership(
  userId: string,
  clubId: string,
  session: ClientSession
): Promise<ActivationResult> {
  const existing = await Membership.findOne({ userId, clubId }).session(session);

  if (!existing) {
    const [membership] = await Membership.create(
      [{ userId, clubId, role: 'MEMBER', status: 'ACTIVE' }],
      { session }
    );
    return { membership };
  }

  if (existing.status === 'INACTIVE') {
    existing.status = 'ACTIVE';
    return { membership: await existing.save() };
  }

  return { error: rejectionForMembership(existing.status) };
}

async function isLastActiveOfficer(clubId: string, userId: string): Promise<boolean> {
  const otherOfficer = await Membership.exists({
    clubId,
    role: 'OFFICER',
    status: 'ACTIVE',
    userId: { $ne: userId },
  });
  return !otherOfficer;
}

async function approvedClubExists(clubId: string): Promise<boolean> {
  return mongoose.isValidObjectId(clubId) && Boolean(await Club.exists({ _id: clubId, status: 'APPROVED' }));
}

function isAdmin(userId: string) {
  return User.exists({ _id: userId, isAdmin: true });
}

export const getClubMembers = async (req: Request<{ clubId: string }>, res: Response): Promise<void> => {
  const userId = req.session.userId!;
  const clubId = req.params.clubId;

  if (!(await approvedClubExists(clubId))) {
    sendError(res, clubNotFound());
    return;
  }

  const isMember = await Membership.exists({ userId, clubId, status: 'ACTIVE' });
  if (!isMember && !(await isAdmin(userId))) {
    sendError(res, { status: 403, code: 'ERR_MEMBER_REQUIRED', message: 'Club membership required' });
    return;
  }

  const memberships = await Membership.find({ clubId, status: 'ACTIVE' })
    .select('userId role')
    .populate<{ userId: { _id: mongoose.Types.ObjectId; firstName: string; lastName: string } | null }>(
      'userId',
      'firstName lastName'
    )
    .lean()
    .exec();

  const members = memberships
    .flatMap(({ userId: user, role }) =>
      user ? [{ userId: user._id, firstName: user.firstName, lastName: user.lastName, role }] : []
    )
    .sort(
      (a, b) =>
        Number(b.role === 'OFFICER') - Number(a.role === 'OFFICER') ||
        a.lastName.localeCompare(b.lastName) ||
        a.firstName.localeCompare(b.firstName)
    );
  res.status(200).json({ members });
};

export const getMyClubs = async (req: Request, res: Response): Promise<void> => {
  const memberships = await Membership.find({ userId: req.session.userId, status: 'ACTIVE' })
    .select('clubId role')
    .lean()
    .exec();
  const roles = new Map(memberships.map((membership) => [membership.clubId.toString(), membership.role]));

  const clubs = await Club.find({ _id: { $in: [...roles.keys()] }, status: 'APPROVED' })
    .select('-proposerId -__v -status -createdAt -updatedAt')
    .sort({ name: 1 })
    .collation({ locale: 'en', strength: 2 })
    .lean()
    .exec();
  res.status(200).json({ clubs: clubs.map((club) => ({ ...club, role: roles.get(club._id.toString()) })) });
};

export const joinClub = async (req: Request<{ clubId: string }>, res: Response): Promise<void> => {
  const userId = req.session.userId!;
  const clubId = req.params.clubId;

  if (!mongoose.isValidObjectId(clubId)) {
    sendError(res, { 
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
      message: 'Club not found' 
    });
    return;
  }
  if (club.status !== 'APPROVED') {
    sendError(res, rejectionForClub(club.status));
    return;
  }

  const session = await mongoose.startSession();
  try {
    // withTransaction retries on a write conflict, so a second simultaneous join
    // reruns after the first commits and gets the already-member error.
    const result = await session.withTransaction(async () => {
      const activation = await activateMembership(userId, clubId, session);
      if ('error' in activation) {
        return activation;
      }

      const channels = await getClubChannels(club._id);
      // Operations in a transaction have to run one at a time.
      for (const channel of channels) {
        await addParticipantsToConversation(channel._id, [new mongoose.Types.ObjectId(userId)], session);
      }
      return activation;
    });

    if ('error' in result) {
      sendError(res, result.error);
      return;
    }
    res.status(201).json(result.membership);
  } catch (error) {
    if (!isDuplicateKey(error)) {
      throw error;
    }

    const raced = await Membership.findOne({ userId, clubId });
    if (!raced || raced.status === 'INACTIVE') throw error;
    sendError(res, rejectionForMembership(raced.status));
  } finally {
    await session.endSession();
  }
};

export const leaveClub = async (req: Request<{ clubId: string }>, res: Response): Promise<void> => {
  const userId = req.session.userId!;
  const clubId = req.params.clubId;

  if (!mongoose.isValidObjectId(clubId) || !(await Club.exists({ _id: clubId }))) {
    sendError(res, clubNotFound());
    return;
  }

  const membership = await Membership.findOne({ userId, clubId, status: 'ACTIVE' });
  if (!membership) {
    sendError(res, notActiveMember());
    return;
  }
  if (membership.role === 'OFFICER' && (await isLastActiveOfficer(clubId, userId))) {
    sendError(res, lastOfficer());
    return;
  }

  membership.status = 'INACTIVE';
  res.status(200).json(await membership.save());
};
