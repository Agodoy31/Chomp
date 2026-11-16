import { describe, it, expect, beforeAll, afterEach, afterAll } from '@jest/globals';
import mongoose from 'mongoose';
import request from 'supertest';
import app from '../../src/app';
import { Club } from '../../src/clubs/model/clubModel';
import { Membership } from '../../src/clubs/model/membershipModel';
import { Conversation } from '../../src/messaging/models/Conversation';
import { ConversationParticipant } from '../../src/messaging/models/ConversationParticipant';
import { createChannel } from '../../src/messaging/services/conversation.service';
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

async function insertChannels(clubId: mongoose.Types.ObjectId) {
  const zebra = await createChannel(clubId, 'Zebra');
  const apple = await createChannel(clubId, 'apple');
  const general = await createChannel(clubId, 'General');
  return [
    { _id: apple._id.toString(), title: 'apple' },
    { _id: general._id.toString(), title: 'General' },
    { _id: zebra._id.toString(), title: 'Zebra' },
  ];
}

describe('GET /api/clubs/:clubId/channels', () => {
  let admin: LoggedInAgent;
  let student: LoggedInAgent;
  let studentId: mongoose.Types.ObjectId;

  beforeAll(async () => {
    await connectTestDb();
    await Promise.all([
      Club.init(),
      Membership.init(),
      Conversation.init(),
      ConversationParticipant.init(),
      User.init(),
    ]);
    const [adminUser, studentUser] = await Promise.all([createUser(true), createUser()]);
    studentId = studentUser._id;
    [admin, student] = await Promise.all([logIn(adminUser), logIn(studentUser)]);
  }, 60000);

  afterEach(async () => {
    await clearTestDb(['users']);
  });

  afterAll(async () => {
    await closeTestDb();
  });

  it('returns 401 when the user is not logged in', async () => {
    const club = await insertClub();

    const res = await request(app).get(`/api/clubs/${club._id.toString()}/channels`);

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ message: 'ERR_REQUIRE_AUTH', redirectTo: '/login' });
  });

  it('returns 404 for a pending, rejected, missing, or malformed club', async () => {
    const pending = await insertClub('PENDING');
    const rejected = await insertClub('REJECTED');
    const clubIds = [
      pending._id.toString(),
      rejected._id.toString(),
      new mongoose.Types.ObjectId().toString(),
      'nope',
    ];

    for (const clubId of clubIds) {
      const res = await admin.get(`/api/clubs/${clubId}/channels`);
      expect({ status: res.status, body: res.body }).toEqual({
        status: 404,
        body: { code: 'ERR_CLUB_NOT_FOUND', message: 'Club not found' },
      });
    }
  });

  it('returns 403 when the user has no membership', async () => {
    const club = await insertClub();

    const res = await student.get(`/api/clubs/${club._id.toString()}/channels`);

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('ERR_MEMBER_REQUIRED');
  });

  it.each(['REMOVED', 'INACTIVE'] as const)(
    'returns 403 when the membership is %s',
    async (status) => {
      const club = await insertClub();
      await Membership.create({ userId: studentId, clubId: club._id, status });

      const res = await student.get(`/api/clubs/${club._id.toString()}/channels`);

      expect(res.status).toBe(403);
      expect(res.body.code).toBe('ERR_MEMBER_REQUIRED');
    }
  );

  it('lists that club channels in case-insensitive title order for an active member', async () => {
    const club = await insertClub();
    const other = await insertClub();
    await Membership.create({ userId: studentId, clubId: club._id, role: 'MEMBER', status: 'ACTIVE' });
    const channels = await insertChannels(club._id);
    await createChannel(other._id, 'mango');

    const res = await student.get(`/api/clubs/${club._id.toString()}/channels`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ channels });
    for (const channel of res.body.channels) {
      expect(Object.keys(channel).sort()).toEqual(['_id', 'title']);
    }
  });

  it('lets an admin with no membership list the channels', async () => {
    const club = await insertClub();
    const channels = await insertChannels(club._id);

    const res = await admin.get(`/api/clubs/${club._id.toString()}/channels`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ channels });
  });
});
