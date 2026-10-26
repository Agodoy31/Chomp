import { Request, Response } from 'express';
import mongoose, { type HydratedDocument } from 'mongoose';
import { Club } from '../model/clubModel';
import { Membership, type Membership as MembershipShape } from '../model/membershipModel';
import { type MembershipStatus, type ClubStatus, type ClientError } from '../interfaces/clubs.interface';
import { 
  sendError, isDuplicateKey, authenticationRequired } from '../errors';

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
  if (status === 'REJECTED') {
    return { 
      status: 403, 
      code: 'ERR_CLUB_NOT_APPROVED', 
      message: 'This club was rejected and cannot be joined' 
    };
  }
  return { 
    status: 403, 
    code: 'ERR_CLUB_NOT_APPROVED', 
    message: 'This club is pending approval and cannot be joined yet' 
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

export const joinClub = async (req: Request<{ clubId: string }>, res: Response): Promise<void> => {
  const userId = req.session?.userId;
  if (!userId) {
    sendError(res, authenticationRequired()); 
    return;
  }

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
    if (!raced || raced.status === 'INACTIVE') throw error;
    sendError(res, rejectionForMembership(raced.status));
  }
};
