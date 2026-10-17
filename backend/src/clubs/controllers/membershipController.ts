import { Request, Response } from 'express';
import mongoose, { type HydratedDocument } from 'mongoose';
import {
  AlreadyMemberError,
  AuthenticationRequiredError,
  ClubNotApprovedError,
  ClubNotFoundError,
  MemberRemovedError,
} from '../../errors/clubErrors';
import { CustomError } from '../../errors/customError';
import { Club } from '../model/clubModel';
import { Membership, type Membership as MembershipShape } from '../model/membershipModel';

type MembershipRecord = HydratedDocument<MembershipShape>;

type SessionUser =
  | string
  | mongoose.Types.ObjectId
  | {
      id?: unknown;
      _id?: unknown;
    };

type RequestWithSession = Request & {
  session?: {
    user?: SessionUser;
  };
};

function isObjectId(value: unknown): value is string | mongoose.Types.ObjectId {
  return value instanceof mongoose.Types.ObjectId || (typeof value === 'string' && mongoose.isValidObjectId(value));
}

function readUserId(req: RequestWithSession): string {
  const user = req.session?.user;
  const raw =
    typeof user === 'string' || user instanceof mongoose.Types.ObjectId ? user : user?.id ?? user?._id;

  if (!isObjectId(raw)) {
    throw new AuthenticationRequiredError();
  }

  return raw.toString();
}

function isDuplicateKey(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && (error as { code: unknown }).code === 11000;
}

function rejectionForClub(status: string): ClubNotApprovedError {
  if (status === 'PENDING') {
    return new ClubNotApprovedError('This club is pending approval and cannot be joined yet');
  }
  if (status === 'REJECTED') {
    return new ClubNotApprovedError('This club was rejected and cannot be joined');
  }
  return new ClubNotApprovedError();
}

function rejectionForMembership(status: string): CustomError {
  if (status === 'REMOVED') {
    return new MemberRemovedError();
  }
  if (status === 'PENDING') {
    return new AlreadyMemberError('A request to join this club is already pending');
  }
  if (status === 'REJECTED') {
    return new AlreadyMemberError('A previous request to join this club was rejected');
  }
  return new AlreadyMemberError();
}

function reactivate(membership: MembershipRecord) {
  membership.status = 'ACTIVE';
  membership.role = 'MEMBER';
  return membership.save();
}

async function activateMembership(userId: string, clubId: string) {
  const existing = await Membership.findOne({ userId, clubId });

  if (!existing) {
    return Membership.create({ userId, clubId, role: 'MEMBER', status: 'ACTIVE' });
  }

  if (existing.status === 'INACTIVE') {
    return reactivate(existing);
  }

  throw rejectionForMembership(existing.status);
}

export const joinClub = async (req: RequestWithSession, res: Response): Promise<void> => {
  const userId = readUserId(req);
  const clubId = Array.isArray(req.params.clubId) ? req.params.clubId[0] : req.params.clubId;

  if (!mongoose.isValidObjectId(clubId)) {
    throw new ClubNotFoundError();
  }

  const club = await Club.findById(clubId);
  if (!club) {
    throw new ClubNotFoundError();
  }
  if (club.status !== 'APPROVED') {
    throw rejectionForClub(club.status);
  }

  try {
    const membership = await activateMembership(userId, clubId);
    res.status(201).json(membership);
  } catch (error) {
    if (!isDuplicateKey(error)) {
      throw error;
    }

    const raced = await Membership.findOne({ userId, clubId });
    if (raced?.status === 'INACTIVE') {
      res.status(201).json(await reactivate(raced));
      return;
    }

    throw rejectionForMembership(raced?.status ?? 'ACTIVE');
  }
};
