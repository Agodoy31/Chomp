import { Request, Response } from 'express';
import mongoose, { type ClientSession, type HydratedDocument } from 'mongoose';
import { z } from 'zod';
import { addMemberToClubChannels, commitMemberDeparture, commitMemberRole } from '../services/clubChannelAccess';
import { isAdmin } from '../isAdmin';
import { Club } from '../model/clubModel';
import { Membership, type Membership as MembershipShape } from '../model/membershipModel';
import { type MembershipStatus, type ClientError } from '../interfaces/clubs.interface';
import {
  sendError,
  isDuplicateKey,
  alreadyMember,
  cannotRemoveSelf,
  clubNotFound,
  clubPendingApproval,
  clubRejected,
  invalidRole,
  lastOfficer,
  memberNotFound,
  memberRemoved,
  memberRequired,
  membershipPending,
  membershipRejected,
  notActiveMember,
  officerRequired,
} from '../errors';

type MembershipRecord = HydratedDocument<MembershipShape>;

type ActivationResult = { membership: MembershipRecord } | { error: ClientError };

function rejectionForMembership(status: Exclude<MembershipStatus, 'INACTIVE'>): ClientError {
  if (status === 'REMOVED') {
    return memberRemoved();
  }
  if (status === 'PENDING') {
    return membershipPending();
  }
  if (status === 'REJECTED') {
    return membershipRejected();
  }
  return alreadyMember();
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
    existing.role = 'MEMBER';
    existing.status = 'ACTIVE';
    return { membership: await existing.save({ session }) };
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

async function canManageMembers(userId: string, clubId: string): Promise<boolean> {
  const isOfficer = await Membership.exists({ userId, clubId, role: 'OFFICER', status: 'ACTIVE' });
  return Boolean(isOfficer) || Boolean(await isAdmin(userId));
}

function findActiveMembership(userId: string, clubId: string) {
  return mongoose.isValidObjectId(userId) ? Membership.findOne({ userId, clubId, status: 'ACTIVE' }) : null;
}

const roleUpdateSchema = z.object({ role: z.enum(['MEMBER', 'OFFICER']) });

export const getClubMembers = async (req: Request<{ clubId: string }>, res: Response): Promise<void> => {
  const userId = req.session.userId!;
  const clubId = req.params.clubId;

  if (!(await approvedClubExists(clubId))) {
    sendError(res, clubNotFound());
    return;
  }

  const isMember = await Membership.exists({ userId, clubId, status: 'ACTIVE' });
  if (!isMember && !(await isAdmin(userId))) {
    sendError(res, memberRequired());
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

export const updateMemberRole = async (
  req: Request<{ clubId: string; userId: string }>,
  res: Response
): Promise<void> => {
  const requesterId = req.session.userId!;
  const { clubId, userId } = req.params;

  if (!(await approvedClubExists(clubId))) {
    sendError(res, clubNotFound());
    return;
  }
  if (!(await canManageMembers(requesterId, clubId))) {
    sendError(res, officerRequired());
    return;
  }

  const parsed = roleUpdateSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    sendError(res, invalidRole());
    return;
  }

  const membership = await findActiveMembership(userId, clubId);
  if (!membership) {
    sendError(res, memberNotFound());
    return;
  }
  if (
    membership.role === 'OFFICER' &&
    parsed.data.role === 'MEMBER' &&
    (await isLastActiveOfficer(clubId, userId))
  ) {
    sendError(res, lastOfficer());
    return;
  }

  const membershipBody = await commitMemberRole({ membershipId: membership._id, role: parsed.data.role });
  if (!membershipBody) {
    sendError(res, memberNotFound());
    return;
  }
  res.status(200).json({ membership: membershipBody });
};

export const removeMember = async (
  req: Request<{ clubId: string; userId: string }>,
  res: Response
): Promise<void> => {
  const requesterId = req.session.userId!;
  const { clubId, userId } = req.params;

  if (!(await approvedClubExists(clubId))) {
    sendError(res, clubNotFound());
    return;
  }
  if (!(await canManageMembers(requesterId, clubId))) {
    sendError(res, officerRequired());
    return;
  }
  if (userId === requesterId) {
    sendError(res, cannotRemoveSelf());
    return;
  }

  const membership = await findActiveMembership(userId, clubId);
  if (!membership) {
    sendError(res, memberNotFound());
    return;
  }
  if (membership.role === 'OFFICER' && (await isLastActiveOfficer(clubId, userId))) {
    sendError(res, lastOfficer());
    return;
  }

  const membershipBody = await commitMemberDeparture({ membershipId: membership._id, status: 'REMOVED' });
  if (!membershipBody) {
    sendError(res, memberNotFound());
    return;
  }
  res.status(200).json({ membership: membershipBody });
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
    sendError(res, clubNotFound());
    return;
  }

  const club = await Club.findById(clubId);
  if (!club) {
    sendError(res, clubNotFound());
    return;
  }
  if (club.status !== 'APPROVED') {
    sendError(res, club.status === 'PENDING' ? clubPendingApproval() : clubRejected());
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

      await addMemberToClubChannels(club._id, new mongoose.Types.ObjectId(userId), session);
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

  const membershipBody = await commitMemberDeparture({ membershipId: membership._id, status: 'INACTIVE' });
  if (!membershipBody) {
    sendError(res, notActiveMember());
    return;
  }
  res.status(200).json({ membership: membershipBody });
};
