import { describe, it, expect, beforeAll, afterEach, afterAll, jest } from '@jest/globals';
import mongoose, { type ClientSession, type Types } from 'mongoose';
import { Club } from '../../src/clubs/model/clubModel';
import { Membership } from '../../src/clubs/model/membershipModel';
import { channelTitleExists, lastChannel } from '../../src/clubs/errors';
import {
  addMemberToClubChannels,
  commitMemberDeparture,
  commitMemberRole,
  createClubChannel,
  createGeneralChannel,
  removeClubChannel,
  renameClubChannel,
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

  it('keeps the membership active and both seats when the second seat delete fails', async () => {
    const { club, channelIds } = await insertClubWithChannels();
    const member = await createTestUser();
    await inTransaction((session) => addMemberToClubChannels(club._id, member._id, session));
    const membership = await Membership.create({
      userId: member._id,
      clubId: club._id,
      role: 'MEMBER',
      status: 'ACTIVE',
    });
    const evict = jest.spyOn(messagingPublisher, 'evictUserFromConversation');
    const originalDelete = ConversationParticipant.deleteOne.bind(ConversationParticipant);
    let calls = 0;
    const deleteOne = jest.spyOn(ConversationParticipant, 'deleteOne').mockImplementation((...args) => {
      calls += 1;
      if (calls === 2) {
        return Promise.reject(new Error('seat delete failed'));
      }
      return originalDelete(...args);
    });

    await expect(
      commitMemberDeparture({ membershipId: membership._id, status: 'REMOVED' })
    ).rejects.toThrow('seat delete failed');

    expect((await Membership.findById(membership._id).lean())?.status).toBe('ACTIVE');
    expect(await seatPermissions(member._id)).toEqual({ [channelIds[0]]: WRITE, [channelIds[1]]: WRITE });
    expect(evict).not.toHaveBeenCalled();
    deleteOne.mockRestore();
    evict.mockRestore();
  });
});

describe('createClubChannel', () => {
  it('seats active members by role and skips removed members, missing users, and other clubs', async () => {
    const officer = await createTestUser();
    const member = await createTestUser();
    const removed = await createTestUser();
    const outsider = await createTestUser();
    const missingId = new mongoose.Types.ObjectId();
    const club = await createTestClub(officer._id);
    const otherClub = await createTestClub(outsider._id);
    await Membership.create([
      { userId: officer._id, clubId: club._id, role: 'OFFICER', status: 'ACTIVE' },
      { userId: member._id, clubId: club._id, role: 'MEMBER', status: 'ACTIVE' },
      { userId: removed._id, clubId: club._id, role: 'OFFICER', status: 'REMOVED' },
      { userId: missingId, clubId: club._id, role: 'MEMBER', status: 'ACTIVE' },
      { userId: outsider._id, clubId: otherClub._id, role: 'OFFICER', status: 'ACTIVE' },
    ]);

    const result = await createClubChannel({ clubId: club._id, title: "  Officers' Q&A  " });

    expect(result).toEqual({ channel: { _id: expect.any(String), title: "Officers' Q&A" } });
    if (!('channel' in result)) {
      return;
    }
    expect(await seatPermissions(officer._id)).toEqual({ [result.channel._id]: MODERATE });
    expect(await seatPermissions(member._id)).toEqual({ [result.channel._id]: WRITE });
    expect(await ConversationParticipant.countDocuments({ userId: { $in: [removed._id, missingId, outsider._id] } })).toBe(
      0
    );
    expect(await Message.countDocuments()).toBe(0);
    expect(await Conversation.countDocuments({ clubId: otherClub._id })).toBe(0);
  });

  it('returns a title conflict for a case-insensitive match and keeps the first channel', async () => {
    const officer = await createTestUser();
    const club = await createTestClub(officer._id);
    await Membership.create({ userId: officer._id, clubId: club._id, role: 'OFFICER', status: 'ACTIVE' });

    expect(await createClubChannel({ clubId: club._id, title: 'Events' })).toEqual({
      channel: { _id: expect.any(String), title: 'Events' },
    });
    await expect(createClubChannel({ clubId: club._id, title: 'events' })).resolves.toEqual({
      error: channelTitleExists(),
    });
    expect(await Conversation.countDocuments({ clubId: club._id })).toBe(1);
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

  it('rolls the new channel and its seats back when permission updates fail', async () => {
    const officer = await createTestUser();
    const club = await createTestClub(officer._id);
    await Membership.create({ userId: officer._id, clubId: club._id, role: 'OFFICER', status: 'ACTIVE' });
    const save = jest.spyOn(ConversationParticipant.prototype, 'save').mockRejectedValue(new Error('seat save failed'));

    try {
      await expect(createClubChannel({ clubId: club._id, title: 'Events' })).rejects.toThrow('seat save failed');
      expect(await Conversation.countDocuments()).toBe(0);
      expect(await ConversationParticipant.countDocuments()).toBe(0);
    } finally {
      save.mockRestore();
    }
  });
});

describe('renameClubChannel', () => {
  it('renames the channel and publishes the saved title', async () => {
    const officer = await createTestUser();
    const club = await createTestClub(officer._id);
    const general = await inTransaction((session) => createGeneralChannel(club._id, officer._id, session));
    const renamed = jest.spyOn(messagingPublisher, 'conversationRenamed');

    try {
      const result = await renameClubChannel({
        clubId: club._id,
        channelId: general._id,
        title: '  Lobby  ',
        requesterId: officer._id,
      });

      expect(result).toEqual({ channel: { _id: general._id.toString(), title: 'Lobby' } });
      expect((await Conversation.findById(general._id).lean())?.title).toBe('Lobby');
      expect(renamed).toHaveBeenCalledTimes(1);
      expect(renamed).toHaveBeenCalledWith(general._id.toString(), 'Lobby');
    } finally {
      renamed.mockRestore();
    }
  });

  it('keeps the stored title when the request does not change it', async () => {
    const officer = await createTestUser();
    const club = await createTestClub(officer._id);
    const general = await inTransaction((session) => createGeneralChannel(club._id, officer._id, session));
    const renamed = jest.spyOn(messagingPublisher, 'conversationRenamed');

    try {
      await expect(
        renameClubChannel({
          clubId: club._id,
          channelId: general._id,
          title: 'General',
          requesterId: officer._id,
        })
      ).resolves.toEqual({ channel: { _id: general._id.toString(), title: 'General' } });
      expect(renamed).not.toHaveBeenCalled();
    } finally {
      renamed.mockRestore();
    }
  });

  it('returns a title conflict and leaves both channels unchanged', async () => {
    const { officer, club, channelIds } = await insertClubWithChannels();

    await expect(
      renameClubChannel({
        clubId: club._id,
        channelId: new mongoose.Types.ObjectId(channelIds[0]),
        title: 'announcements',
        requesterId: officer._id,
      })
    ).resolves.toEqual({ error: channelTitleExists() });
    expect((await Conversation.findById(channelIds[0]).lean())?.title).toBe('General');
  });
});

describe('removeClubChannel', () => {
  it('deletes that channel after its seats are gone and leaves the other channel', async () => {
    const { officer, club, channelIds } = await insertClubWithChannels();
    const removedId = channelIds[1];
    const keptId = channelIds[0];
    await Message.create([
      { conversationId: removedId, senderId: officer._id, text: 'going away' },
      { conversationId: keptId, senderId: officer._id, text: 'staying' },
    ]);
    const seatCounts: Array<Promise<number>> = [];
    const removed = jest.spyOn(messagingPublisher, 'participantRemoved').mockImplementation((conversationId, userId) => {
      seatCounts.push(ConversationParticipant.countDocuments({ conversationId, userId }));
    });

    try {
      await expect(
        removeClubChannel({ clubId: club._id, channelId: new mongoose.Types.ObjectId(removedId) })
      ).resolves.toEqual({ channel: { _id: removedId, title: 'Announcements' } });

      expect(await Conversation.findById(removedId)).toBeNull();
      expect((await Conversation.findById(keptId).lean())?.title).toBe('General');
      expect(await Message.countDocuments({ conversationId: removedId })).toBe(0);
      expect(await Message.countDocuments({ conversationId: keptId })).toBe(1);
      expect(await ConversationParticipant.countDocuments({ conversationId: removedId })).toBe(0);
      expect(await seatPermissions(officer._id)).toEqual({ [keptId]: MODERATE });
      expect(removed).toHaveBeenCalledWith(removedId, officer._id.toString());
      expect(await Promise.all(seatCounts)).toEqual([0]);
    } finally {
      removed.mockRestore();
    }
  });

  it('keeps the last channel, its messages, and the club timestamp', async () => {
    const officer = await createTestUser();
    const club = await createTestClub(officer._id);
    const general = await inTransaction((session) => createGeneralChannel(club._id, officer._id, session));
    await Message.create({ conversationId: general._id, senderId: officer._id, text: 'hello' });
    const before = await Club.findById(club._id).lean();
    const removed = jest.spyOn(messagingPublisher, 'participantRemoved');

    try {
      await expect(removeClubChannel({ clubId: club._id, channelId: general._id })).resolves.toEqual({
        error: lastChannel(),
      });
      expect((await Conversation.findById(general._id).lean())?.title).toBe('General');
      expect(await Message.countDocuments({ conversationId: general._id })).toBe(1);
      expect(await ConversationParticipant.countDocuments({ conversationId: general._id })).toBe(1);
      expect((await Club.findById(club._id).lean())?.updatedAt).toEqual(before?.updatedAt);
      expect(removed).not.toHaveBeenCalled();
    } finally {
      removed.mockRestore();
    }
  });

  it('keeps both channels when deleting their messages fails', async () => {
    const { club, channelIds } = await insertClubWithChannels();
    const removed = jest.spyOn(messagingPublisher, 'participantRemoved');
    const deleteMany = jest.spyOn(Message, 'deleteMany').mockRejectedValue(new Error('message delete failed'));

    try {
      await expect(
        removeClubChannel({ clubId: club._id, channelId: new mongoose.Types.ObjectId(channelIds[1]) })
      ).rejects.toThrow('message delete failed');
      expect(await Conversation.countDocuments({ clubId: club._id })).toBe(2);
      expect(await ConversationParticipant.countDocuments()).toBe(2);
      expect(removed).not.toHaveBeenCalled();
    } finally {
      deleteMany.mockRestore();
      removed.mockRestore();
    }
  });
});

describe('commitMemberRole', () => {
  it('rolls the role and the seat back when the permission update fails', async () => {
    const { club, channelIds } = await insertClubWithChannels();
    const member = await createTestUser();
    await inTransaction((session) => addMemberToClubChannels(club._id, member._id, session));
    const membership = await Membership.create({
      userId: member._id,
      clubId: club._id,
      role: 'MEMBER',
      status: 'ACTIVE',
    });
    const save = jest.spyOn(ConversationParticipant.prototype, 'save').mockRejectedValue(new Error('seat save failed'));

    await expect(commitMemberRole({ membershipId: membership._id, role: 'OFFICER' })).rejects.toThrow(
      'seat save failed'
    );

    expect((await Membership.findById(membership._id).lean())?.role).toBe('MEMBER');
    expect(await seatPermissions(member._id)).toEqual({ [channelIds[0]]: WRITE, [channelIds[1]]: WRITE });
    save.mockRestore();
  });
});
