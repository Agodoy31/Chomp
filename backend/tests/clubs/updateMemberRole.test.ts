import { describe, it, expect, beforeAll, afterEach, afterAll } from '@jest/globals';
import mongoose from 'mongoose';
import request from 'supertest';
import app from '../../src/app';
import { Club } from '../../src/clubs/model/clubModel';
import { Membership } from '../../src/clubs/model/membershipModel';
import { ConversationType } from '../../src/messaging/interfaces/conversation.interfaces';
import { Conversation } from '../../src/messaging/models/Conversation';
import { ConversationParticipant, ParticipantPermission } from '../../src/messaging/models/ConversationParticipant';
import { User } from '../../src/user/models/User';
import { createUser, logIn, type LoggedInAgent } from '../helpers/auth';
import { clearTestDb, closeTestDb, connectTestDb } from '../helpers/db';
import { createTestClub } from '../messaging/services/conversationTestUtils';

function insertClub(status: 'PENDING' | 'APPROVED' | 'REJECTED' = 'APPROVED') {
  return createTestClub(new mongoose.Types.ObjectId(), {
    description: 'Weekly meetings',
    category: 'OTHER',
    status,
  });
}

function roleUrl(clubId: mongoose.Types.ObjectId | string, userId: mongoose.Types.ObjectId | string) {
  return `/api/clubs/${clubId.toString()}/members/${userId.toString()}`;
}

describe('PATCH /api/clubs/:clubId/members/:userId', () => {
  let admin: LoggedInAgent;
  let officer: LoggedInAgent;
  let officerId: mongoose.Types.ObjectId;
  let member: LoggedInAgent;
  let memberId: mongoose.Types.ObjectId;

  beforeAll(async () => {
    await connectTestDb();
    await Promise.all([Club.init(), Membership.init(), Conversation.init(), ConversationParticipant.init(), User.init()]);
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
  it('lets an officer promote a member, and the promoted officer demote the original officer', async () => {
    const club = await insertClubWithRoster();

    const promote = await officer.patch(roleUrl(club._id, memberId)).send({ role: 'OFFICER' });
    expect(promote.status).toBe(200);
    expect(promote.body).toEqual({
      membership: {
        _id: expect.any(String),
        userId: memberId.toString(),
        clubId: club._id.toString(),
        role: 'OFFICER',
        status: 'ACTIVE',
      },
    });

    const demote = await member.patch(roleUrl(club._id, officerId)).send({ role: 'MEMBER' });
    expect(demote.status).toBe(200);
    expect((await Membership.findOne({ userId: officerId, clubId: club._id }).lean())?.role).toBe('MEMBER');
  });

  it('moves the channel seat to moderate on promotion and back to write on demotion', async () => {
    const club = await insertClubWithRoster();
    const channel = await Conversation.create({
      type: ConversationType.CHANNEL,
      clubId: club._id,
      title: 'General',
    });
    await ConversationParticipant.create({
      conversationId: channel._id,
      userId: memberId,
      permission: ParticipantPermission.WRITE,
    });

    const promote = await officer.patch(roleUrl(club._id, memberId)).send({ role: 'OFFICER' });
    expect(promote.status).toBe(200);
    expect(
      (await ConversationParticipant.findOne({ conversationId: channel._id, userId: memberId }).lean())?.permission
    ).toBe(ParticipantPermission.MODERATE);

    const demote = await officer.patch(roleUrl(club._id, memberId)).send({ role: 'MEMBER' });
    expect(demote.status).toBe(200);
    expect(
      (await ConversationParticipant.findOne({ conversationId: channel._id, userId: memberId }).lean())?.permission
    ).toBe(ParticipantPermission.WRITE);
  });

  it('lets an admin who is not a member change a role', async () => {
    const club = await insertClubWithRoster();

    const res = await admin.patch(roleUrl(club._id, memberId)).send({ role: 'OFFICER' });

    expect(res.status).toBe(200);
    expect((await Membership.findOne({ userId: memberId, clubId: club._id }).lean())?.role).toBe('OFFICER');
  });

  it('returns 409 when demoting the last active officer, including the officer demoting themselves', async () => {
    const club = await insertClubWithRoster();

    for (const agent of [officer, admin]) {
      const res = await agent.patch(roleUrl(club._id, officerId)).send({ role: 'MEMBER' });
      expect({ status: res.status, body: res.body }).toEqual({
        status: 409,
        body: { code: 'ERR_LAST_OFFICER', message: 'A club must keep at least one active officer' },
      });
    }
    expect((await Membership.findOne({ userId: officerId, clubId: club._id }).lean())?.role).toBe('OFFICER');
  });

  it('returns 400 when the role is missing or unknown', async () => {
    const club = await insertClubWithRoster();

    for (const body of [{}, { role: 'ADMIN' }, { role: 'officer' }]) {
      const res = await officer.patch(roleUrl(club._id, memberId)).send(body);
      expect({ status: res.status, body: res.body }).toEqual({
        status: 400,
        body: { code: 'ERR_INVALID_ROLE', message: 'Role must be MEMBER or OFFICER' },
      });
    }
  });

  it('returns 404 when the target is not an active member of the club', async () => {
    const club = await insertClubWithRoster();
    const inactiveId = new mongoose.Types.ObjectId();
    await Membership.create({ userId: inactiveId, clubId: club._id, status: 'INACTIVE' });

    for (const userId of [inactiveId.toString(), new mongoose.Types.ObjectId().toString(), 'nope']) {
      const res = await officer.patch(roleUrl(club._id, userId)).send({ role: 'OFFICER' });
      expect({ status: res.status, body: res.body }).toEqual({
        status: 404,
        body: { code: 'ERR_MEMBER_NOT_FOUND', message: 'Active member not found in this club' },
      });
    }
  });

  it('returns 403 when a regular member tries to change a role', async () => {
    const club = await insertClubWithRoster();

    const res = await member.patch(roleUrl(club._id, memberId)).send({ role: 'OFFICER' });

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ code: 'ERR_OFFICER_REQUIRED', message: 'Club officer access required' });
    expect((await Membership.findOne({ userId: memberId, clubId: club._id }).lean())?.role).toBe('MEMBER');
  });

  it('returns 404 for a pending, missing, or malformed club', async () => {
    const pending = await insertClubWithRoster('PENDING');

    for (const clubId of [pending._id.toString(), new mongoose.Types.ObjectId().toString(), 'nope']) {
      const res = await admin.patch(roleUrl(clubId, memberId)).send({ role: 'OFFICER' });
      expect({ status: res.status, body: res.body }).toEqual({
        status: 404,
        body: { code: 'ERR_CLUB_NOT_FOUND', message: 'Club not found' },
      });
    }
  });

  it('returns 401 when the user is not logged in', async () => {
    const club = await insertClubWithRoster();

    const res = await request(app).patch(roleUrl(club._id, memberId)).send({ role: 'OFFICER' });

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ message: 'ERR_REQUIRE_AUTH', redirectTo: '/login' });
  });
});
