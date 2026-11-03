import { describe, it, expect, beforeAll, afterEach, afterAll } from '@jest/globals';
import mongoose from 'mongoose';
import request from 'supertest';
import app from '../../src/app';
import { Club } from '../../src/clubs/model/clubModel';
import { Membership } from '../../src/clubs/model/membershipModel';
import { User } from '../../src/user/models/User';
import { createUser, logIn, type LoggedInAgent } from '../helpers/auth';
import { clearTestDb, closeTestDb, connectTestDb } from '../helpers/db';

async function insertClub(status: 'PENDING' | 'APPROVED' | 'REJECTED' = 'APPROVED') {
  return Club.create({
    name: `Club ${new mongoose.Types.ObjectId().toHexString()}`,
    description: 'Weekly meetings',
    proposerId: new mongoose.Types.ObjectId(),
    status,
  });
}

function memberUrl(clubId: mongoose.Types.ObjectId | string, userId: mongoose.Types.ObjectId | string) {
  return `/api/clubs/${clubId.toString()}/members/${userId.toString()}`;
}

describe('DELETE /api/clubs/:clubId/members/:userId', () => {
  let admin: LoggedInAgent;
  let officer: LoggedInAgent;
  let officerId: mongoose.Types.ObjectId;
  let member: LoggedInAgent;
  let memberId: mongoose.Types.ObjectId;

  beforeAll(async () => {
    await connectTestDb();
    await Promise.all([Club.init(), Membership.init(), User.init()]);
    const [adminUser, officerUser, memberUser] = await Promise.all([createUser(true), createUser(), createUser()]);
    officerId = officerUser._id;
    memberId = memberUser._id;
    [admin, officer, member] = await Promise.all([logIn(adminUser), logIn(officerUser), logIn(memberUser)]);
  }, 60000);

  afterEach(async () => {
    await clearTestDb(['users']);
  });

  afterAll(async () => {
    await closeTestDb();
  });

  async function insertClubWithRoster(status: 'PENDING' | 'APPROVED' | 'REJECTED' = 'APPROVED') {
    const club = await insertClub(status);
    await Membership.create([
      { userId: officerId, clubId: club._id, role: 'OFFICER', status: 'ACTIVE' },
      { userId: memberId, clubId: club._id, role: 'MEMBER', status: 'ACTIVE' },
    ]);
    return club;
  }

  it('marks the member as removed so they cannot rejoin', async () => {
    const club = await insertClubWithRoster();

    const res = await officer.delete(memberUrl(club._id, memberId));

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ userId: memberId.toString(), status: 'REMOVED' });
    expect((await Membership.findOne({ userId: memberId, clubId: club._id }).lean())?.status).toBe('REMOVED');

    const rejoin = await member.post(`/api/clubs/${club._id.toString()}/join`);
    expect(rejoin.status).toBe(403);
    expect(rejoin.body.code).toBe('ERR_MEMBER_REMOVED');
  });

  it('lets an admin remove an officer when another active officer remains', async () => {
    const club = await insertClubWithRoster();
    await Membership.updateOne({ userId: memberId, clubId: club._id }, { role: 'OFFICER' });

    const res = await admin.delete(memberUrl(club._id, officerId));

    expect(res.status).toBe(200);
    expect((await Membership.findOne({ userId: officerId, clubId: club._id }).lean())?.status).toBe('REMOVED');
  });

  it('returns 409 when removing the last active officer', async () => {
    const club = await insertClubWithRoster();

    const res = await admin.delete(memberUrl(club._id, officerId));

    expect(res.status).toBe(409);
    expect(res.body).toEqual({ code: 'ERR_LAST_OFFICER', message: 'A club must keep at least one active officer' });
    expect((await Membership.findOne({ userId: officerId, clubId: club._id }).lean())?.status).toBe('ACTIVE');
  });

  it('returns 400 when an officer tries to remove themselves', async () => {
    const club = await insertClubWithRoster();

    const res = await officer.delete(memberUrl(club._id, officerId));

    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      code: 'ERR_CANNOT_REMOVE_SELF',
      message: 'Use leave to exit a club instead of removing yourself',
    });
  });

  it('returns 404 when the target is not an active member of the club', async () => {
    const club = await insertClubWithRoster();
    const inactiveId = new mongoose.Types.ObjectId();
    await Membership.create({ userId: inactiveId, clubId: club._id, status: 'INACTIVE' });

    for (const userId of [inactiveId.toString(), new mongoose.Types.ObjectId().toString(), 'nope']) {
      const res = await officer.delete(memberUrl(club._id, userId));
      expect({ status: res.status, body: res.body }).toEqual({
        status: 404,
        body: { code: 'ERR_MEMBER_NOT_FOUND', message: 'Active member not found in this club' },
      });
    }
    expect((await Membership.findOne({ userId: inactiveId }).lean())?.status).toBe('INACTIVE');
  });

  it('returns 403 when a regular member tries to remove someone', async () => {
    const club = await insertClubWithRoster();

    const res = await member.delete(memberUrl(club._id, officerId));

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ code: 'ERR_OFFICER_REQUIRED', message: 'Club officer access required' });
    expect((await Membership.findOne({ userId: officerId, clubId: club._id }).lean())?.status).toBe('ACTIVE');
  });

  it('returns 404 for a pending, missing, or malformed club', async () => {
    const pending = await insertClubWithRoster('PENDING');

    for (const clubId of [pending._id.toString(), new mongoose.Types.ObjectId().toString(), 'nope']) {
      const res = await admin.delete(memberUrl(clubId, memberId));
      expect({ status: res.status, body: res.body }).toEqual({
        status: 404,
        body: { code: 'ERR_CLUB_NOT_FOUND', message: 'Club not found' },
      });
    }
  });

  it('returns 401 when the user is not logged in', async () => {
    const club = await insertClubWithRoster();

    const res = await request(app).delete(memberUrl(club._id, memberId));

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ message: 'ERR_REQUIRE_AUTH', redirectTo: '/login' });
  });
});
