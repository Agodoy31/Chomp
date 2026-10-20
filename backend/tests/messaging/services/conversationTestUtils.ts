import { Types } from 'mongoose';
import { User, IUserDocument } from '../../../src/user/models/User';
import { Club } from '../../../src/clubs/model/clubModel';

export async function createTestUser(
  overrides: Partial<IUserDocument> = {}
): Promise<IUserDocument> {
  const userId = overrides._id ?? new Types.ObjectId();
  return User.create({
    _id: userId,
    email: `student_${userId.toString()}@ufl.edu`,
    hashedPassword: 'hashedPassword123',
    firstName: 'Albert',
    lastName: 'Gator',
    ...overrides,
  });
}

export async function createTestClub(
  proposerId: Types.ObjectId,
  overrides: Partial<any> = {}
): Promise<any> {
  const clubId = overrides._id ?? new Types.ObjectId();
  return Club.create({
    _id: clubId,
    name: `Test Club ${clubId.toString()}`,
    description: 'A test club description',
    category: 'ACADEMIC',
    proposerId,
    status: 'APPROVED',
    ...overrides,
  });
}
