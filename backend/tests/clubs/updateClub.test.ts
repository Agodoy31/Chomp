import { describe, it, expect, beforeAll, afterEach, afterAll } from '@jest/globals';
import mongoose from 'mongoose';
import request from 'supertest';
import app from '../../src/app';
import { Club } from '../../src/clubs/model/clubModel';
import { Membership } from '../../src/clubs/model/membershipModel';
import { User } from '../../src/user/models/User';
import { createUser, logIn, type LoggedInAgent } from '../helpers/auth';
import { clearTestDb, closeTestDb, connectTestDb } from '../helpers/db';

async function insertClub(overrides: Record<string, unknown> = {}) {
  return Club.create({
    name: 'Chess Club',
    description: 'Weekly chess matches',
    category: 'ACADEMIC',
    meeting: { day: 'Monday', time: '6:30 PM', location: 'Library West' },
    proposerId: new mongoose.Types.ObjectId(),
    status: 'APPROVED',
    ...overrides,
  });
}

describe('PATCH /api/clubs/:clubId', () => {
  let officer: LoggedInAgent;
  let officerId: mongoose.Types.ObjectId;
  let member: LoggedInAgent;
  let memberId: mongoose.Types.ObjectId;

  beforeAll(async () => {
    await connectTestDb();
    await Promise.all([Club.init(), Membership.init(), User.init()]);
    const [officerUser, memberUser] = await Promise.all([createUser(), createUser()]);
    officerId = officerUser._id;
    memberId = memberUser._id;
    [officer, member] = await Promise.all([logIn(officerUser), logIn(memberUser)]);
  }, 60000);

  afterEach(async () => {
    await clearTestDb(['users']);
  });

  afterAll(async () => {
    await closeTestDb();
  });

  async function insertOfficerClub(overrides: Record<string, unknown> = {}) {
    const club = await insertClub(overrides);
    await Membership.create([
      { userId: officerId, clubId: club._id, role: 'OFFICER', status: 'ACTIVE' },
      { userId: memberId, clubId: club._id, role: 'MEMBER', status: 'ACTIVE' },
    ]);
    return club;
  }

  it('updates only the fields sent and returns the public club', async () => {
    const club = await insertOfficerClub();

    const res = await officer
      .patch(`/api/clubs/${club._id.toString()}`)
      .send({ description: '  Now with blitz  ', category: 'other' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      club: {
        _id: club._id.toString(),
        name: 'Chess Club',
        description: 'Now with blitz',
        category: 'OTHER',
        meeting: { day: 'Monday', time: '6:30 PM', location: 'Library West' },
      },
    });
  });

  it('replaces the meeting details and renames the club, including a change of letter case only', async () => {
    const club = await insertOfficerClub();

    const res = await officer
      .patch(`/api/clubs/${club._id.toString()}`)
      .send({ name: 'CHESS CLUB', meeting: { day: 'Friday' } });

    expect(res.status).toBe(200);
    const stored = await Club.findById(club._id).lean();
    expect(stored?.name).toBe('CHESS CLUB');
    expect(stored?.meeting).toEqual({ day: 'Friday' });
  });

  it('ignores status and proposerId in the body', async () => {
    const club = await insertOfficerClub();

    const res = await officer
      .patch(`/api/clubs/${club._id.toString()}`)
      .send({ description: 'Updated', status: 'REJECTED', proposerId: officerId.toString() });

    expect(res.status).toBe(200);
    const stored = await Club.findById(club._id).lean();
    expect(stored?.status).toBe('APPROVED');
    expect(stored?.proposerId.toString()).toBe(club.proposerId.toString());
  });

  it('returns 409 when another approved club already uses the name in any letter case', async () => {
    await insertClub({ name: 'Go Club' });
    const club = await insertOfficerClub();

    const res = await officer.patch(`/api/clubs/${club._id.toString()}`).send({ name: 'go club' });

    expect(res.status).toBe(409);
    expect(res.body).toEqual({ code: 'ERR_CLUB_NAME_EXISTS', message: 'An approved club already uses this name' });
    expect((await Club.findById(club._id).lean())?.name).toBe('Chess Club');
  });

  it('returns 400 for an empty body, invalid fields, and an unknown category', async () => {
    const club = await insertOfficerClub();
    const url = `/api/clubs/${club._id.toString()}`;

    const cases = [
      [{}, 'ERR_INVALID_CLUB_REQUEST', 'Provide at least one club field to update'],
      [{ name: '   ' }, 'ERR_INVALID_CLUB_REQUEST', 'Club name is required'],
      [{ description: 'x'.repeat(1001) }, 'ERR_INVALID_CLUB_REQUEST', 'Club description must be 1000 characters or fewer'],
      [{ meeting: { time: 'noon' } }, 'ERR_INVALID_CLUB_REQUEST', 'Meeting time must look like 6:30 PM'],
      [{ category: 'GAMING' }, 'ERR_INVALID_CATEGORY', 'Invalid Category'],
    ] as const;
    for (const [body, code, message] of cases) {
      const res = await officer.patch(url).send(body);
      expect({ status: res.status, body: res.body }).toEqual({ status: 400, body: { code, message } });
    }
    expect((await Club.findById(club._id).lean())?.description).toBe('Weekly chess matches');
  });

  it('returns 403 for a member who is not an officer and for an officer who left', async () => {
    const club = await insertOfficerClub();
    await Membership.updateOne({ userId: officerId, clubId: club._id }, { status: 'INACTIVE' });

    for (const agent of [member, officer]) {
      const res = await agent.patch(`/api/clubs/${club._id.toString()}`).send({ description: 'Hacked' });
      expect({ status: res.status, body: res.body }).toEqual({
        status: 403,
        body: { code: 'ERR_OFFICER_REQUIRED', message: 'Club officer access required' },
      });
    }
  });

  it('returns 404 for a pending, missing, or malformed club', async () => {
    const pending = await insertOfficerClub({ status: 'PENDING' });

    for (const clubId of [pending._id.toString(), new mongoose.Types.ObjectId().toString(), 'nope']) {
      const res = await officer.patch(`/api/clubs/${clubId}`).send({ description: 'Updated' });
      expect({ status: res.status, body: res.body }).toEqual({
        status: 404,
        body: { code: 'ERR_CLUB_NOT_FOUND', message: 'Club not found' },
      });
    }
  });

  it('returns 401 when the user is not logged in', async () => {
    const club = await insertOfficerClub();

    const res = await request(app).patch(`/api/clubs/${club._id.toString()}`).send({ description: 'Updated' });

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ message: 'ERR_REQUIRE_AUTH', redirectTo: '/login' });
  });
});
