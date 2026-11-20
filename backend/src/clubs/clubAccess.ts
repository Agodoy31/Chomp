import mongoose from 'mongoose';
import { isAdmin } from './isAdmin';
import { Club } from './model/clubModel';
import { Membership } from './model/membershipModel';

export async function approvedClubExists(clubId: string): Promise<boolean> {
  return mongoose.isValidObjectId(clubId) && Boolean(await Club.exists({ _id: clubId, status: 'APPROVED' }));
}

export async function isActiveMemberOrAdmin(userId: string, clubId: string): Promise<boolean> {
  const isMember = await Membership.exists({ userId, clubId, status: 'ACTIVE' });
  return Boolean(isMember) || Boolean(await isAdmin(userId));
}

async function isActiveOfficerOrAdmin(userId: string, clubId: string): Promise<boolean> {
  const isOfficer = await Membership.exists({ userId, clubId, role: 'OFFICER', status: 'ACTIVE' });
  return Boolean(isOfficer) || Boolean(await isAdmin(userId));
}

export function canManageChannels(userId: string, clubId: string): Promise<boolean> {
  return isActiveOfficerOrAdmin(userId, clubId);
}

export function canManageMembers(userId: string, clubId: string): Promise<boolean> {
  return isActiveOfficerOrAdmin(userId, clubId);
}
