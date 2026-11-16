import { describe, it, expect, beforeAll, afterEach, afterAll } from '@jest/globals';
import mongoose from 'mongoose';
import { Membership, type Membership as MembershipRecord } from '../../src/clubs/model/membershipModel';
import { clearTestDb, closeTestDb, connectTestDb } from '../helpers/db';

function membershipInput(overrides: Record<string, unknown> = {}) {
  return {
    userId: new mongoose.Types.ObjectId(),
    clubId: new mongoose.Types.ObjectId(),
    ...overrides,
  };
}

describe('Membership model', () => {
  beforeAll(async () => {
    await connectTestDb();
    await Membership.init();
  }, 60000);

  afterEach(async () => {
    await clearTestDb();
  });

  afterAll(async () => {
    await closeTestDb();
  });

  it('creates a membership with member role, active status, and timestamps', async () => {
    const membership = await Membership.create(membershipInput());
    const record: MembershipRecord = membership.toObject();

    expect(record.role).toBe('MEMBER');
    expect(record.status).toBe('ACTIVE');
    expect(record.userId).toEqual(membership.userId);
    expect(record.clubId).toEqual(membership.clubId);
    expect(membership.createdAt).toBeInstanceOf(Date);
    expect(membership.updatedAt).toBeInstanceOf(Date);
    expect(Membership.schema.path('userId').options.ref).toBe('User');
    expect(Membership.schema.path('clubId').options.ref).toBe('Club');
  });

  it.each([
    ['userId', { clubId: new mongoose.Types.ObjectId() }],
    ['clubId', { userId: new mongoose.Types.ObjectId() }],
  ])('rejects a membership missing %s', async (field, payload) => {
    await expect(Membership.create(payload)).rejects.toThrow(mongoose.Error.ValidationError);
  });

  it('rejects an unknown role or status', async () => {
    await expect(Membership.create(membershipInput({ role: 'ADMIN' }))).rejects.toThrow(
      mongoose.Error.ValidationError
    );
    await expect(Membership.create(membershipInput({ status: 'APPROVED' }))).rejects.toThrow(
      mongoose.Error.ValidationError
    );
  });

  it('rejects a duplicate membership for the same user and club', async () => {
    const userId = new mongoose.Types.ObjectId();
    const clubId = new mongoose.Types.ObjectId();
    await Membership.create({ userId, clubId });

    await expect(
      Membership.create({ userId, clubId, role: 'OFFICER', status: 'PENDING' })
    ).rejects.toMatchObject({ code: 11000 });
  });

  it('allows the same user in another club and another user in the same club', async () => {
    const userId = new mongoose.Types.ObjectId();
    const clubId = new mongoose.Types.ObjectId();

    await Membership.create({ userId, clubId });
    const otherClub = await Membership.create({
      userId,
      clubId: new mongoose.Types.ObjectId(),
    });
    const otherUser = await Membership.create({
      userId: new mongoose.Types.ObjectId(),
      clubId,
    });

    expect(otherClub.userId).toEqual(userId);
    expect(otherUser.clubId).toEqual(clubId);
  });

  it('indexes memberships by user and club, and rosters by club and status', async () => {
    const indexes = await Membership.collection.indexes();

    const membershipIndex = indexes.find(
      (index) => Object.keys(index.key).join(',') === 'userId,clubId'
    );
    expect(membershipIndex).toEqual(expect.objectContaining({ unique: true }));

    const rosterIndex = indexes.find(
      (index) => Object.keys(index.key).join(',') === 'clubId,status'
    );
    expect(rosterIndex).toBeDefined();
  });
});
