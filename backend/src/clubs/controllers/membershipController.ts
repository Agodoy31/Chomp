import { Request, Response } from 'express';
import mongoose, { type HydratedDocument } from 'mongoose';
import { Club } from '../model/clubModel';
import { Membership, type Membership as MembershipShape } from '../model/membershipModel';

type MembershipRecord = HydratedDocument<MembershipShape>;

type RequestWithSession = Request<{ clubId: string }> & {
  session?: {
    userId?: string;
  };
};

type ClientError = {
  status: number;
  code: string;
  message: string;
};

type ActivationResult = { membership: MembershipRecord } | { error: ClientError };

function isDuplicateKey(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 11000;
}

function sendError(res: Response, error: ClientError): void {
  res.status(error.status).json({ code: error.code, message: error.message });
}

function clubNotFound(): ClientError {
  return { status: 404, code: 'ERR_CLUB_NOT_FOUND', message: 'Club not found' };
}

function rejectionForClub(status: string): ClientError {
  if (status === 'PENDING') {
    return {
      status: 403,
      code: 'ERR_CLUB_NOT_APPROVED',
      message: 'This club is pending approval and cannot be joined yet',
    };
  }
  if (status === 'REJECTED') {
    return {
      status: 403,
      code: 'ERR_CLUB_NOT_APPROVED',
      message: 'This club was rejected and cannot be joined',
    };
  }
  return { status: 403, code: 'ERR_CLUB_NOT_APPROVED', message: 'Club is not approved' };
}

function rejectionForMembership(status: string): ClientError {
  if (status === 'REMOVED') {
    return {
      status: 403,
      code: 'ERR_MEMBER_REMOVED',
      message: 'Removed members cannot rejoin this club',
    };
  }
  if (status === 'PENDING') {
    return {
      status: 409,
      code: 'ERR_ALREADY_MEMBER',
      message: 'A request to join this club is already pending',
    };
  }
  if (status === 'REJECTED') {
    return {
      status: 409,
      code: 'ERR_ALREADY_MEMBER',
      message: 'A previous request to join this club was rejected',
    };
  }
  return {
    status: 409,
    code: 'ERR_ALREADY_MEMBER',
    message: 'Already an active member of this club',
  };
}

function reactivate(membership: MembershipRecord) {
  membership.status = 'ACTIVE';
  membership.role = 'MEMBER';
  return membership.save();
}

async function activateMembership(userId: string, clubId: string): Promise<ActivationResult> {
  const existing = await Membership.findOne({ userId, clubId });

  if (!existing) {
    return { membership: await Membership.create({ userId, clubId, role: 'MEMBER', status: 'ACTIVE' }) };
  }

  if (existing.status === 'INACTIVE') {
    return { membership: await reactivate(existing) };
  }

  return { error: rejectionForMembership(existing.status) };
}

export const joinClub = async (req: RequestWithSession, res: Response): Promise<void> => {
  const userId = req.session?.userId;
  if (!userId) {
    res.status(401).json({
      code: 'ERR_AUTHENTICATION_REQUIRED',
      message: 'Authentication required',
    });
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
  if (club.status !== 'APPROVED') {
    sendError(res, rejectionForClub(club.status));
    return;
  }

  try {
    const result = await activateMembership(userId, clubId);
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
    if (raced?.status === 'INACTIVE') {
      res.status(201).json(await reactivate(raced));
      return;
    }

    sendError(res, rejectionForMembership(raced?.status ?? 'ACTIVE'));
  }
};
