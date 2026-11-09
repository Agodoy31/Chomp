import { Request, Response, RequestHandler } from 'express';
import mongoose from 'mongoose';
import { Club } from '../../clubs/model/clubModel';
import { Membership } from '../../clubs/model/membershipModel';
import {
  UpdateBioResponse,
  UserProfileClubItem,
  UserProfileResponse,
} from '../interfaces/user.interfaces';
import { User } from '../models/User';
import { updateBioSchema } from '../validators/user.validator';

export const getUserProfile: RequestHandler = async (
  req: Request,
  res: Response
): Promise<void> => {
  const { userId } = req.params;

  if (!userId || !mongoose.isObjectIdOrHexString(userId)) {
    res.status(400).json({ code: 'ERR_INVALID_INPUT', message: 'Valid userId is required' });
    return;
  }

  const user = await User.findById(userId).select('_id firstName lastName email bio').lean();

  if (!user) {
    res.status(404).json({ code: 'ERR_USER_NOT_FOUND', message: 'User not found' });
    return;
  }

  const memberships = await Membership.find({ userId: user._id, status: 'ACTIVE' })
    .select('clubId role')
    .lean();
  const roleMap = new Map(
    memberships.map(({ clubId, role }) => [clubId.toString(), role])
  );
  const clubIds = memberships.map(({ clubId }) => clubId);
  const clubs = await Club.find({ _id: { $in: clubIds }, status: 'APPROVED' })
    .select('_id name description category')
    .sort({ name: 1 })
    .collation({ locale: 'en', strength: 2 })
    .lean();
  const clubsWithRole: UserProfileClubItem[] = clubs.map((club) => ({
    _id: club._id.toString(),
    name: club.name,
    description: club.description,
    category: club.category,
    role: roleMap.get(club._id.toString())!,
  }));
  const response: UserProfileResponse = {
    id: user._id.toString(),
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    bio: user.bio || '',
    clubs: clubsWithRole,
  };

  res.status(200).json(response);
};

export const updateBio: RequestHandler = async (
  req: Request,
  res: Response
): Promise<void> => {
  const parseResult = updateBioSchema.safeParse(req.body);

  if (!parseResult.success) {
    res.status(400).json({
      code: 'ERR_INVALID_INPUT',
      message: 'Bio must be a string up to 500 characters',
    });
    return;
  }

  const userId = req.session?.userId;

  if (!userId) {
    res.status(401).json({ message: 'ERR_REQUIRE_AUTH' });
    return;
  }

  const updatedUser = await User.findByIdAndUpdate(
    userId,
    { bio: parseResult.data.bio },
    { new: true }
  )
    .select('_id firstName lastName email bio')
    .lean();

  if (!updatedUser) {
    res.status(404).json({ code: 'ERR_USER_NOT_FOUND', message: 'User not found' });
    return;
  }

  const response: UpdateBioResponse = {
    id: updatedUser._id.toString(),
    firstName: updatedUser.firstName,
    lastName: updatedUser.lastName,
    email: updatedUser.email,
    bio: updatedUser.bio || '',
  };

  res.status(200).json(response);
};
