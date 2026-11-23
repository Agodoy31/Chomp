import { describe, it, expect, beforeAll, afterEach, afterAll, jest } from '@jest/globals';
import mongoose from 'mongoose';
import request from 'supertest';
import app from '../../src/app';
import { Club } from '../../src/clubs/model/clubModel';
import { Membership } from '../../src/clubs/model/membershipModel';
import { ConversationType } from '../../src/messaging/interfaces/conversation.interfaces';
import { Conversation } from '../../src/messaging/models/Conversation';
import { ConversationParticipant, ParticipantPermission } from '../../src/messaging/models/ConversationParticipant';
import { Message } from '../../src/messaging/models/Message';
import { messagingPublisher } from '../../src/messaging/sockets/messagingPublisher';
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

function channelsUrl(clubId: mongoose.Types.ObjectId | string) {
  return `/api/clubs/${clubId.toString()}/channels`;
}

function channelUrl(clubId: mongoose.Types.ObjectId | string, channelId: mongoose.Types.ObjectId | string) {
  return `/api/clubs/${clubId.toString()}/channels/${channelId.toString()}`;
}

describe('club channel management', () => {
  let admin: LoggedInAgent;
  let adminId: mongoose.Types.ObjectId;
  let officer: LoggedInAgent;
  let officerId: mongoose.Types.ObjectId;
  let member: LoggedInAgent;
  let memberId: mongoose.Types.ObjectId;
  let outsider: LoggedInAgent;

  beforeAll(async () => {
    await connectTestDb();
    await Promise.all([
      Club.init(),
      Membership.init(),
      Conversation.init(),
      ConversationParticipant.init(),
      Message.init(),
      User.init(),
    ]);
    const [adminUser, officerUser, memberUser, outsiderUser] = await Promise.all([
      createUser(true),
      createUser(),
      createUser(),
      createUser(),
    ]);
    adminId = adminUser._id;
    officerId = officerUser._id;
    memberId = memberUser._id;
    [admin, officer, member, outsider] = await Promise.all([
      logIn(adminUser),
      logIn(officerUser),
      logIn(memberUser),
      logIn(outsiderUser),
    ]);
  }, 60000);

  afterEach(async () => {
    jest.restoreAllMocks();
    await clearTestDb(['users']);
  });

  afterAll(async () => {
    await closeTestDb();
  });

  async function insertChannel(clubId: mongoose.Types.ObjectId, title: string) {
    const channel = await Conversation.create({
      type: ConversationType.CHANNEL,
      clubId,
      title,
    });
    await ConversationParticipant.create([
      { conversationId: channel._id, userId: officerId, permission: ParticipantPermission.MODERATE },
      { conversationId: channel._id, userId: memberId, permission: ParticipantPermission.WRITE },
    ]);
    return channel;
  }

  async function insertRoster() {
    const club = await insertClub();
    await Membership.create([
      { userId: officerId, clubId: club._id, role: 'OFFICER', status: 'ACTIVE' },
      { userId: memberId, clubId: club._id, role: 'MEMBER', status: 'ACTIVE' },
    ]);
    const general = await insertChannel(club._id, 'General');
    return { club, general };
  }

  describe('POST /api/clubs/:clubId/channels', () => {
    it('returns 401 when the user is not logged in', async () => {
      const { club } = await insertRoster();

      const res = await request(app).post(channelsUrl(club._id)).send({ title: 'Events' });

      expect(res.status).toBe(401);
      expect(res.body).toEqual({ message: 'ERR_REQUIRE_AUTH', redirectTo: '/login' });
      expect(await Conversation.countDocuments({ title: 'Events' })).toBe(0);
    });

    it('returns 404 when the club id is malformed or the club is not approved', async () => {
      const pending = await insertClub('PENDING');
      const rejected = await insertClub('REJECTED');
      const missing = new mongoose.Types.ObjectId();

      for (const clubId of ['nope', missing, pending._id, rejected._id]) {
        const res = await officer.post(channelsUrl(clubId)).send({ title: 'Events' });
        expect(res.status).toBe(404);
        expect(res.body.code).toBe('ERR_CLUB_NOT_FOUND');
      }
      expect(await Conversation.countDocuments({ title: 'Events' })).toBe(0);
    });

    it('returns 403 when the user is not an active officer', async () => {
      const { club } = await insertRoster();

      for (const agent of [member, outsider]) {
        const res = await agent.post(channelsUrl(club._id)).send({ title: 'Events' });
        expect(res.status).toBe(403);
        expect(res.body.code).toBe('ERR_OFFICER_REQUIRED');
      }
      expect(await Conversation.countDocuments({ title: 'Events' })).toBe(0);
    });

    it.each(['INACTIVE', 'REMOVED', 'PENDING', 'REJECTED'] as const)(
      'returns 403 when the officer membership is %s',
      async (status) => {
        const { club, general } = await insertRoster();
        await Membership.create({
          userId: new mongoose.Types.ObjectId(),
          clubId: club._id,
          role: 'OFFICER',
          status: 'ACTIVE',
        });
        await Membership.updateOne({ userId: officerId, clubId: club._id }, { status });

        const res = await officer.post(channelsUrl(club._id)).send({ title: 'Events' });

        expect(res.status).toBe(403);
        expect(res.body.code).toBe('ERR_OFFICER_REQUIRED');
        expect(await Conversation.countDocuments({ clubId: club._id })).toBe(1);
        expect((await Conversation.findById(general._id).lean())?.title).toBe('General');
      }
    );

    it.each([
      [{}, 'missing'],
      [{ title: '   ' }, 'blank'],
      [{ title: 'Events@' }, 'punctuation'],
      [{ title: 'Events\nroom' }, 'newline'],
      [{ title: 'e'.repeat(101) }, 'too long'],
      [{ title: 4 }, 'not text'],
    ])('returns 400 for %j', async (body) => {
      const { club } = await insertRoster();

      const res = await officer.post(channelsUrl(club._id)).send(body);

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('ERR_INVALID_CHANNEL_TITLE');
      expect(await Conversation.countDocuments({ clubId: club._id })).toBe(1);
    });

    it('creates a trimmed channel, seats the active roster, and lists it with General', async () => {
      const { club, general } = await insertRoster();

      const res = await officer.post(channelsUrl(club._id)).send({ title: "  Officers' Q&A  " });

      expect(res.status).toBe(201);
      expect(res.body).toEqual({ channel: { _id: expect.any(String), title: "Officers' Q&A" } });
      const channelId = res.body.channel._id as string;
      expect(
        (await ConversationParticipant.findOne({ conversationId: channelId, userId: officerId }).lean())?.permission
      ).toBe(ParticipantPermission.MODERATE);
      expect(
        (await ConversationParticipant.findOne({ conversationId: channelId, userId: memberId }).lean())?.permission
      ).toBe(ParticipantPermission.WRITE);
      expect(await Message.countDocuments({ conversationId: channelId })).toBe(0);

      const listed = await member.get(channelsUrl(club._id));
      expect(listed.status).toBe(200);
      expect(listed.body.channels).toEqual([
        { _id: general._id.toString(), title: 'General' },
        { _id: channelId, title: "Officers' Q&A" },
      ]);
    });

    it('lets an admin who is not a member add a channel without taking a seat', async () => {
      const { club } = await insertRoster();

      const res = await admin.post(channelsUrl(club._id)).send({ title: 'Events' });

      expect(res.status).toBe(201);
      expect(await ConversationParticipant.exists({ conversationId: res.body.channel._id, userId: adminId })).toBeNull();
      expect(await ConversationParticipant.countDocuments({ conversationId: res.body.channel._id })).toBe(2);
    });

    it('returns 409 when the title matches an existing channel without regard to case', async () => {
      const { club, general } = await insertRoster();

      const res = await officer.post(channelsUrl(club._id)).send({ title: 'general' });

      expect(res.status).toBe(409);
      expect(res.body.code).toBe('ERR_CHANNEL_TITLE_EXISTS');
      expect(await Conversation.countDocuments({ clubId: club._id })).toBe(1);
      expect((await Conversation.findById(general._id).lean())?.title).toBe('General');
    });
  });

  describe('PATCH /api/clubs/:clubId/channels/:channelId', () => {
    it('returns 401 when the user is not logged in', async () => {
      const { club, general } = await insertRoster();

      const res = await request(app).patch(channelUrl(club._id, general._id)).send({ title: 'Lobby' });

      expect(res.status).toBe(401);
      expect(res.body).toEqual({ message: 'ERR_REQUIRE_AUTH', redirectTo: '/login' });
      expect((await Conversation.findById(general._id).lean())?.title).toBe('General');
    });

    it('returns 404 when the club is not approved', async () => {
      const club = await insertClub('PENDING');

      const res = await officer.patch(channelUrl(club._id, new mongoose.Types.ObjectId())).send({ title: 'Lobby' });

      expect(res.status).toBe(404);
      expect(res.body.code).toBe('ERR_CLUB_NOT_FOUND');
      expect(await Conversation.countDocuments({ clubId: club._id })).toBe(0);
    });

    it('returns 403 when a member tries to rename a channel', async () => {
      const { club, general } = await insertRoster();

      const res = await member.patch(channelUrl(club._id, general._id)).send({ title: 'Lobby' });

      expect(res.status).toBe(403);
      expect(res.body.code).toBe('ERR_OFFICER_REQUIRED');
      expect((await Conversation.findById(general._id).lean())?.title).toBe('General');
    });

    it('returns 404 when the channel is missing, belongs to another club, or is not a channel', async () => {
      const { club, general } = await insertRoster();
      const other = await insertRoster();
      const group = await Conversation.create({ type: ConversationType.GROUP, title: 'Officers' });

      for (const channelId of ['nope', new mongoose.Types.ObjectId(), other.general._id, group._id]) {
        const res = await officer.patch(channelUrl(club._id, channelId)).send({ title: 'Lobby' });
        expect(res.status).toBe(404);
        expect(res.body.code).toBe('ERR_CHANNEL_NOT_FOUND');
      }
      expect((await Conversation.findById(general._id).lean())?.title).toBe('General');
      expect((await Conversation.findById(other.general._id).lean())?.title).toBe('General');
      expect((await Conversation.findById(group._id).lean())?.title).toBe('Officers');
    });

    it('returns 400 for an invalid title and keeps the stored title', async () => {
      const { club, general } = await insertRoster();

      const res = await officer.patch(channelUrl(club._id, general._id)).send({ title: 'Lobby@' });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('ERR_INVALID_CHANNEL_TITLE');
      expect((await Conversation.findById(general._id).lean())?.title).toBe('General');
    });

    it('renames the channel and publishes the trimmed title', async () => {
      const { club, general } = await insertRoster();
      const events = await insertChannel(club._id, 'Events');
      const renamed = jest.spyOn(messagingPublisher, 'conversationRenamed');

      const res = await officer.patch(channelUrl(club._id, events._id)).send({ title: '  Lobby  ' });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ channel: { _id: events._id.toString(), title: 'Lobby' } });
      expect((await Conversation.findById(events._id).lean())?.title).toBe('Lobby');
      expect((await Conversation.findById(general._id).lean())?.title).toBe('General');
      expect(renamed).toHaveBeenCalledWith(events._id.toString(), 'Lobby');
    });

    it('lets an admin rename a channel and accepts a case-only change', async () => {
      const { club } = await insertRoster();
      const events = await insertChannel(club._id, 'Events');

      const res = await admin.patch(channelUrl(club._id, events._id)).send({ title: 'events' });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ channel: { _id: events._id.toString(), title: 'events' } });
      expect((await Conversation.findById(events._id).lean())?.title).toBe('events');
    });

    it('rejects renaming General', async () => {
      const { club, general } = await insertRoster();

      for (const title of ['Lobby', 'general', 'General']) {
        const res = await officer.patch(channelUrl(club._id, general._id)).send({ title });
        expect(res.status).toBe(409);
        expect(res.body.code).toBe('ERR_GENERAL_CHANNEL');
      }
      expect((await Conversation.findById(general._id).lean())?.title).toBe('General');
    });

    it('does not publish when the title is unchanged', async () => {
      const { club } = await insertRoster();
      const events = await insertChannel(club._id, 'Events');
      const renamed = jest.spyOn(messagingPublisher, 'conversationRenamed');

      const res = await officer.patch(channelUrl(club._id, events._id)).send({ title: 'Events' });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ channel: { _id: events._id.toString(), title: 'Events' } });
      expect(renamed).not.toHaveBeenCalled();
    });

    it('returns 409 when another channel in the club already uses the title', async () => {
      const { club } = await insertRoster();
      const events = await insertChannel(club._id, 'Events');
      await insertChannel(club._id, 'Lobby');

      const res = await officer.patch(channelUrl(club._id, events._id)).send({ title: 'lobby' });

      expect(res.status).toBe(409);
      expect(res.body.code).toBe('ERR_CHANNEL_TITLE_EXISTS');
      expect((await Conversation.findById(events._id).lean())?.title).toBe('Events');
    });
  });

  describe('DELETE /api/clubs/:clubId/channels/:channelId', () => {
    it('returns 401 when the user is not logged in', async () => {
      const { club, general } = await insertRoster();

      const res = await request(app).delete(channelUrl(club._id, general._id));

      expect(res.status).toBe(401);
      expect(res.body).toEqual({ message: 'ERR_REQUIRE_AUTH', redirectTo: '/login' });
      expect(await Conversation.findById(general._id)).not.toBeNull();
    });

    it('returns 403 when a member tries to remove a channel', async () => {
      const { club, general } = await insertRoster();
      await insertChannel(club._id, 'Events');

      const res = await member.delete(channelUrl(club._id, general._id));

      expect(res.status).toBe(403);
      expect(res.body.code).toBe('ERR_OFFICER_REQUIRED');
      expect(await Conversation.countDocuments({ clubId: club._id })).toBe(2);
    });

    it('returns 404 when the channel is missing, belongs to another club, or is not a channel', async () => {
      const { club, general } = await insertRoster();
      const other = await insertRoster();
      const group = await Conversation.create({ type: ConversationType.GROUP, title: 'Officers' });

      for (const channelId of ['nope', new mongoose.Types.ObjectId(), other.general._id, group._id]) {
        const res = await officer.delete(channelUrl(club._id, channelId));
        expect(res.status).toBe(404);
        expect(res.body.code).toBe('ERR_CHANNEL_NOT_FOUND');
      }
      expect(await Conversation.findById(general._id)).not.toBeNull();
      expect(await Conversation.findById(other.general._id)).not.toBeNull();
      expect(await Conversation.findById(group._id)).not.toBeNull();
    });

    it('rejects deleting General and keeps its seats and messages', async () => {
      const { club, general } = await insertRoster();
      await Message.create({ conversationId: general._id, senderId: officerId, text: 'hello' });
      const deleted = jest.spyOn(messagingPublisher, 'conversationDeleted');

      const res = await officer.delete(channelUrl(club._id, general._id));

      expect(res.status).toBe(409);
      expect(res.body.code).toBe('ERR_GENERAL_CHANNEL');
      expect((await Conversation.findById(general._id).lean())?.deleted).not.toBe(true);
      expect(await ConversationParticipant.countDocuments({ conversationId: general._id })).toBe(2);
      expect(await Message.countDocuments({ conversationId: general._id })).toBe(1);
      expect(deleted).not.toHaveBeenCalled();
    });

    it('soft-deletes one channel, keeps its messages, and leaves the club', async () => {
      const { club, general } = await insertRoster();
      const events = await insertChannel(club._id, 'Events');
      await Message.create([
        { conversationId: events._id, senderId: memberId, text: 'practice moved' },
        { conversationId: general._id, senderId: officerId, text: 'welcome' },
      ]);
      const deleted = jest.spyOn(messagingPublisher, 'conversationDeleted');
      const kicked = jest.spyOn(messagingPublisher, 'participantRemoved');

      const res = await officer.delete(channelUrl(club._id, events._id));

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ channel: { _id: events._id.toString(), title: 'Events' } });
      expect((await Conversation.findById(events._id).lean())?.deleted).toBe(true);
      expect(await Message.countDocuments({ conversationId: events._id })).toBe(1);
      expect(await ConversationParticipant.countDocuments({ conversationId: events._id })).toBe(0);
      expect((await Conversation.findById(general._id).lean())?.deleted).not.toBe(true);
      expect(await Message.countDocuments({ conversationId: general._id })).toBe(1);
      expect(await ConversationParticipant.countDocuments({ conversationId: general._id })).toBe(2);
      expect(await Membership.countDocuments({ clubId: club._id, status: 'ACTIVE' })).toBe(2);
      expect(deleted).toHaveBeenCalledTimes(1);
      expect(deleted.mock.calls[0][0]).toBe(events._id.toString());
      expect(deleted.mock.calls[0][1].slice().sort()).toEqual([memberId.toString(), officerId.toString()].sort());
      expect(kicked).not.toHaveBeenCalled();

      const listed = await member.get(channelsUrl(club._id));
      expect(listed.body).toEqual({ channels: [{ _id: general._id.toString(), title: 'General' }] });
    });

    it('returns 404 when renaming or deleting a soft-deleted channel', async () => {
      const { club } = await insertRoster();
      const events = await insertChannel(club._id, 'Events');
      expect((await officer.delete(channelUrl(club._id, events._id))).status).toBe(200);

      const renamed = await officer.patch(channelUrl(club._id, events._id)).send({ title: 'Events' });
      const again = await officer.delete(channelUrl(club._id, events._id));

      expect(renamed.status).toBe(404);
      expect(renamed.body.code).toBe('ERR_CHANNEL_NOT_FOUND');
      expect(again.status).toBe(404);
      expect(again.body.code).toBe('ERR_CHANNEL_NOT_FOUND');
      expect((await Conversation.findById(events._id).lean())?.deleted).toBe(true);
    });

    it('rejects deleting General even when another channel exists', async () => {
      const { club, general } = await insertRoster();
      const events = await insertChannel(club._id, 'Events');

      const res = await admin.delete(channelUrl(club._id, general._id));

      expect(res.status).toBe(409);
      expect(res.body.code).toBe('ERR_GENERAL_CHANNEL');
      expect((await Conversation.findById(general._id).lean())?.deleted).not.toBe(true);
      expect((await Conversation.findById(events._id).lean())?.title).toBe('Events');
    });
  });
});
