import { describe, it, expect, beforeAll, afterEach, afterAll, jest } from '@jest/globals';
import mongoose, { type ClientSession, type Types } from 'mongoose';
import { Club } from '../../src/clubs/model/clubModel';
import { Membership } from '../../src/clubs/model/membershipModel';
import { cannotDeleteGeneral } from '../../src/clubs/errors';
import {
  addMemberToClubChannels,
  commitMemberDeparture,
  createClubChannel,
  createGeneralChannel,
  removeClubChannel,
  syncMemberChannelPermission,
} from '../../src/clubs/services/clubChannelAccess';
import { ConversationType } from '../../src/messaging/interfaces/conversation.interfaces';
import { Conversation } from '../../src/messaging/models/Conversation';
import { ConversationParticipant, ParticipantPermission } from '../../src/messaging/models/ConversationParticipant';
import { Message } from '../../src/messaging/models/Message';
import * as conversationService from '../../src/messaging/services/conversation.service';
import { messagingPublisher } from '../../src/messaging/sockets/messagingPublisher';
import { User } from '../../src/user/models/User';
import { clearTestDb, closeTestDb, connectTestDb } from '../helpers/db';
import { createTestClub, createTestUser } from '../messaging/services/conversationTestUtils';

const { MODERATE, WRITE } = ParticipantPermission;

async function inTransaction<T>(work: (session: ClientSession) => Promise<T>): Promise<T> {
  const session = await mongoose.startSession();
  try {
    return await session.withTransaction(() => work(session));
  } finally {
    await session.endSession();
  }
}

async function seatPermissions(userId: Types.ObjectId): Promise<Record<string, ParticipantPermission>> {
  const seats = await ConversationParticipant.find({ userId }).lean();
  return Object.fromEntries(seats.map((seat) => [seat.conversationId.toString(), seat.permission]));
}

async function insertClubWithChannels() {
  const officer = await createTestUser();
  const club = await createTestClub(officer._id);
  const general = await inTransaction((session) => createGeneralChannel(club._id, officer._id, session));
  const announcements = await conversationService.createChannel(club._id, 'Announcements', [officer._id]);
  return { officer, club, channelIds: [general._id.toString(), announcements._id.toString()] };
}

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
}, 60000);

afterEach(async () => {
  await clearTestDb();
});

afterAll(async () => {
  await closeTestDb();
});

describe('createGeneralChannel', () => {
  it('creates the General channel and seats the proposer as a moderator', async () => {
    const proposer = await createTestUser();
    const club = await createTestClub(proposer._id);

    const channel = await inTransaction((session) => createGeneralChannel(club._id, proposer._id, session));

    const channels = await Conversation.find().lean();
    expect(channels).toHaveLength(1);
    expect(channels[0]._id.toString()).toBe(channel._id.toString());
    expect(channels[0].type).toBe(ConversationType.CHANNEL);
    expect(channels[0].title).toBe('General');
    expect(channels[0].clubId?.toString()).toBe(club._id.toString());
    expect(await ConversationParticipant.countDocuments()).toBe(1);
    expect(await seatPermissions(proposer._id)).toEqual({ [channel._id.toString()]: MODERATE });
  });

  it('leaves no channel or seat when the caller transaction aborts', async () => {
    const proposer = await createTestUser();
    const club = await createTestClub(proposer._id);

    await expect(
      inTransaction(async (session) => {
        await createGeneralChannel(club._id, proposer._id, session);
        throw new Error('Simulated approval failure');
      })
    ).rejects.toThrow('Simulated approval failure');

    expect(await Conversation.countDocuments()).toBe(0);
    expect(await ConversationParticipant.countDocuments()).toBe(0);
  });
});

describe('addMemberToClubChannels', () => {
  it('seats the member as a writer on every club channel without a system message', async () => {
    const { club, channelIds } = await insertClubWithChannels();
    const member = await createTestUser();

    await inTransaction((session) => addMemberToClubChannels(club._id, member._id, session));

    expect(await seatPermissions(member._id)).toEqual({ [channelIds[0]]: WRITE, [channelIds[1]]: WRITE });
    expect(await Message.countDocuments()).toBe(0);
  });
});

describe('syncMemberChannelPermission', () => {
  it('promotes and demotes a member on every club channel', async () => {
    const { club, channelIds } = await insertClubWithChannels();
    const member = await createTestUser();
    await inTransaction((session) => addMemberToClubChannels(club._id, member._id, session));

    await inTransaction((session) => syncMemberChannelPermission(club._id, member._id, 'OFFICER', session));
    expect(await seatPermissions(member._id)).toEqual({ [channelIds[0]]: MODERATE, [channelIds[1]]: MODERATE });

    await inTransaction((session) => syncMemberChannelPermission(club._id, member._id, 'MEMBER', session));
    expect(await seatPermissions(member._id)).toEqual({ [channelIds[0]]: WRITE, [channelIds[1]]: WRITE });
    expect(await Message.countDocuments()).toBe(0);
  });

  it('keeps the previous permission when the caller transaction aborts', async () => {
    const { club, channelIds } = await insertClubWithChannels();
    const member = await createTestUser();
    await inTransaction((session) => addMemberToClubChannels(club._id, member._id, session));

    await expect(
      inTransaction(async (session) => {
        await syncMemberChannelPermission(club._id, member._id, 'OFFICER', session);
        throw new Error('Simulated role update failure');
      })
    ).rejects.toThrow('Simulated role update failure');

    expect(await seatPermissions(member._id)).toEqual({ [channelIds[0]]: WRITE, [channelIds[1]]: WRITE });
  });
});

describe('commitMemberDeparture', () => {
  it('deletes every channel seat and drops sockets only after that delete commits', async () => {
    const { club, channelIds } = await insertClubWithChannels();
    const member = await createTestUser();
    await inTransaction((session) => addMemberToClubChannels(club._id, member._id, session));
    const membership = await Membership.create({
      userId: member._id,
      clubId: club._id,
      role: 'MEMBER',
      status: 'ACTIVE',
    });
    const seatCounts: Array<Promise<number>> = [];
    const evict = jest.spyOn(messagingPublisher, 'evictUserFromConversation').mockImplementation((conversationId, userId) => {
      seatCounts.push(ConversationParticipant.countDocuments({ conversationId, userId }));
    });

    const body = await commitMemberDeparture({ membershipId: membership._id, status: 'INACTIVE' });

    expect(body).toEqual({
      _id: membership._id.toString(),
      userId: member._id.toString(),
      clubId: club._id.toString(),
      role: 'MEMBER',
      status: 'INACTIVE',
    });
    expect(await ConversationParticipant.countDocuments({ userId: member._id })).toBe(0);
    expect(await Message.countDocuments()).toBe(0);
    expect(evict.mock.calls.map((call) => call[0]).sort()).toEqual([...channelIds].sort());
    expect(evict.mock.calls.every((call) => call[1] === member._id.toString())).toBe(true);
    expect(await Promise.all(seatCounts)).toEqual([0, 0]);

    evict.mockClear();
    await expect(
      commitMemberDeparture({ membershipId: membership._id, status: 'INACTIVE' })
    ).resolves.toBeNull();
    expect(evict).not.toHaveBeenCalled();
    evict.mockRestore();
  });
});

describe('createClubChannel', () => {
  it('seats active members by role and skips removed members and other clubs', async () => {
    const officer = await createTestUser();
    const member = await createTestUser();
    const removed = await createTestUser();
    const outsider = await createTestUser();
    const club = await createTestClub(officer._id);
    const otherClub = await createTestClub(outsider._id);
    await Membership.create([
      { userId: officer._id, clubId: club._id, role: 'OFFICER', status: 'ACTIVE' },
      { userId: member._id, clubId: club._id, role: 'MEMBER', status: 'ACTIVE' },
      { userId: removed._id, clubId: club._id, role: 'OFFICER', status: 'REMOVED' },
      { userId: outsider._id, clubId: otherClub._id, role: 'OFFICER', status: 'ACTIVE' },
    ]);

    const result = await createClubChannel({ clubId: club._id, title: 'Events' });

    expect(result).toEqual({ channel: { _id: expect.any(String), title: 'Events' } });
    if (!('channel' in result)) {
      return;
    }
    expect(await seatPermissions(officer._id)).toEqual({ [result.channel._id]: MODERATE });
    expect(await seatPermissions(member._id)).toEqual({ [result.channel._id]: WRITE });
    expect(await ConversationParticipant.countDocuments({ userId: { $in: [removed._id, outsider._id] } })).toBe(0);
    expect(await Message.countDocuments()).toBe(0);
    expect(await Conversation.countDocuments({ clubId: otherClub._id })).toBe(0);
  });

  it('lets another club use the same channel title', async () => {
    const firstOfficer = await createTestUser();
    const secondOfficer = await createTestUser();
    const first = await createTestClub(firstOfficer._id);
    const second = await createTestClub(secondOfficer._id);
    await Membership.create([
      { userId: firstOfficer._id, clubId: first._id, role: 'OFFICER', status: 'ACTIVE' },
      { userId: secondOfficer._id, clubId: second._id, role: 'OFFICER', status: 'ACTIVE' },
    ]);

    const created = await Promise.all([
      createClubChannel({ clubId: first._id, title: 'Events' }),
      createClubChannel({ clubId: second._id, title: 'Events' }),
    ]);

    expect(created.every((result) => 'channel' in result)).toBe(true);
    expect(await Conversation.countDocuments({ title: 'Events' })).toBe(2);
  });
});

describe('removeClubChannel', () => {
  it('soft-deletes that channel, keeps its messages, and leaves the other channel', async () => {
    const { officer, club, channelIds } = await insertClubWithChannels();
    const removedId = channelIds[1];
    const keptId = channelIds[0];
    await Message.create([
      { conversationId: removedId, senderId: officer._id, text: 'going away' },
      { conversationId: keptId, senderId: officer._id, text: 'staying' },
    ]);
    const deleted = jest.spyOn(messagingPublisher, 'conversationDeleted');
    const kicked = jest.spyOn(messagingPublisher, 'participantRemoved');

    try {
      await expect(
        removeClubChannel({ clubId: club._id, channelId: new mongoose.Types.ObjectId(removedId) })
      ).resolves.toEqual({ channel: { _id: removedId, title: 'Announcements' } });

      expect((await Conversation.findById(removedId).lean())?.deleted).toBe(true);
      expect((await Conversation.findById(keptId).lean())?.title).toBe('General');
      expect(await Message.countDocuments({ conversationId: removedId })).toBe(1);
      expect(await Message.countDocuments({ conversationId: keptId })).toBe(1);
      expect(await ConversationParticipant.countDocuments({ conversationId: removedId })).toBe(0);
      expect(await seatPermissions(officer._id)).toEqual({ [keptId]: MODERATE });
      expect(deleted).toHaveBeenCalledWith(removedId, [officer._id.toString()]);
      expect(kicked).not.toHaveBeenCalled();
    } finally {
      deleted.mockRestore();
      kicked.mockRestore();
    }
  });

  it('refuses to delete General and leaves the club timestamp alone', async () => {
    const officer = await createTestUser();
    const club = await createTestClub(officer._id);
    const general = await inTransaction((session) => createGeneralChannel(club._id, officer._id, session));
    await Message.create({ conversationId: general._id, senderId: officer._id, text: 'hello' });
    const before = await Club.findById(club._id).lean();
    const deleted = jest.spyOn(messagingPublisher, 'conversationDeleted');

    try {
      await expect(removeClubChannel({ clubId: club._id, channelId: general._id })).resolves.toEqual({
        error: cannotDeleteGeneral(),
      });
      expect((await Conversation.findById(general._id).lean())?.deleted).not.toBe(true);
      expect(await Message.countDocuments({ conversationId: general._id })).toBe(1);
      expect(await ConversationParticipant.countDocuments({ conversationId: general._id })).toBe(1);
      expect((await Club.findById(club._id).lean())?.updatedAt).toEqual(before?.updatedAt);
      expect(deleted).not.toHaveBeenCalled();
    } finally {
      deleted.mockRestore();
    }
  });
});
