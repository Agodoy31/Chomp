import { describe, it, expect, beforeAll, afterEach, afterAll } from '@jest/globals';
import mongoose from 'mongoose';
import { Club, type Club as ClubRecord } from '../../clubs/model/clubModel';
import { clearTestDb, closeTestDb, connectTestDb } from '../helpers/db';

function clubInput(overrides: Record<string, unknown> = {}) {
  return {
    name: 'Chess Club',
    description: 'Weekly chess matches',
    proposerId: new mongoose.Types.ObjectId(),
    ...overrides,
  };
}

describe('Club model', () => {
  beforeAll(async () => {
    await connectTestDb();
    await Club.init();
  }, 60000);

  afterEach(async () => {
    await clearTestDb();
  });

  afterAll(async () => {
    await closeTestDb();
  });

  it('creates a club with pending status and timestamps', async () => {
    const club = await Club.create(clubInput());
    const record: ClubRecord = club.toObject();

    expect(record.name).toBe('Chess Club');
    expect(record.description).toBe('Weekly chess matches');
    expect(record.proposerId).toEqual(club.proposerId);
    expect(record.status).toBe('PENDING');
    expect(record.category).toBeUndefined();
    expect(record.meeting).toBeUndefined();
    expect(club.createdAt).toBeInstanceOf(Date);
    expect(club.updatedAt).toBeInstanceOf(Date);
    expect(Club.schema.path('proposerId').options.ref).toBe('User');
  });

  it('stores category and meeting details without a meeting id', async () => {
    const club = await Club.create(
      clubInput({
        category: 'Recreation',
        meeting: {
          day: 'Wednesday',
          time: '6:30 PM',
          location: 'Turlington Hall 2304',
        },
      })
    );

    expect(club.toObject().meeting).toEqual({
      day: 'Wednesday',
      time: '6:30 PM',
      location: 'Turlington Hall 2304',
    });
  });

  it.each([
    ['name', { description: 'Weekly chess matches', proposerId: new mongoose.Types.ObjectId() }],
    ['description', { name: 'Chess Club', proposerId: new mongoose.Types.ObjectId() }],
    ['proposerId', { name: 'Chess Club', description: 'Weekly chess matches' }],
  ])('rejects a club missing %s', async (_field, payload) => {
    await expect(Club.create(payload)).rejects.toThrow(mongoose.Error.ValidationError);
  });

  it('rejects an unknown status', async () => {
    await expect(Club.create(clubInput({ status: 'ACTIVE' }))).rejects.toThrow(
      mongoose.Error.ValidationError
    );
  });

  it('rejects a second approved club with the same name in any letter case', async () => {
    await Club.create(clubInput({ name: 'Robotics', status: 'APPROVED' }));

    await expect(
      Club.create(clubInput({ name: 'robotics', status: 'APPROVED' }))
    ).rejects.toMatchObject({ code: 11000 });
  });

  it('allows duplicate names when the clubs are not both approved', async () => {
    await Club.create(clubInput({ name: 'Robotics', status: 'PENDING' }));
    await Club.create(clubInput({ name: 'robotics', status: 'PENDING' }));
    await Club.create(clubInput({ name: 'Robotics', status: 'REJECTED' }));

    const approved = await Club.create(clubInput({ name: 'Robotics', status: 'APPROVED' }));
    expect(approved.status).toBe('APPROVED');
  });

  it('indexes approved names and status with category', async () => {
    const indexes = await Club.collection.indexes();

    const nameIndex = indexes.find((index) => Object.keys(index.key).join(',') === 'name');
    expect(nameIndex).toEqual(
      expect.objectContaining({
        unique: true,
        partialFilterExpression: { status: 'APPROVED' },
        collation: expect.objectContaining({ locale: 'en', strength: 2 }),
      })
    );

    const discoveryIndex = indexes.find(
      (index) => Object.keys(index.key).join(',') === 'status,category'
    );
    expect(discoveryIndex).toBeDefined();
  });
});
