import { describe, it, expect, beforeAll, afterEach, afterAll, jest } from '@jest/globals';
import mongoose, { type ClientSession, type Types } from 'mongoose';
import { Club } from '../../src/clubs/model/clubModel';
import { Membership } from '../../src/clubs/model/membershipModel';
import {
  addMemberToClubChannels,
  commitMemberDeparture,
  commitMemberRole,
  createGeneralChannel,
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

  it('does nothing when the club has no channels', async () => {
    const officer = await createTestUser();
    const club = await createTestClub(officer._id);
    const member = await createTestUser();

    await inTransaction((session) => addMemberToClubChannels(club._id, member._id, session));

    expect(await ConversationParticipant.countDocuments()).toBe(0);
  });

  it('keeps an existing moderator seat and adds a writer seat on channels the user is missing from', async () => {
    const officer = await createTestUser();
    const club = await createTestClub(officer._id);
    const general = await inTransaction((session) => createGeneralChannel(club._id, officer._id, session));
    const announcements = await conversationService.createChannel(club._id, 'Announcements');

    await inTransaction((session) => addMemberToClubChannels(club._id, officer._id, session));

    expect(await seatPermissions(officer._id)).toEqual({
      [general._id.toString()]: MODERATE,
      [announcements._id.toString()]: WRITE,
    });
  });
});

describe('syncMemberChannelPermission', () => {
  it('promotes and demotes a member on every seated channel and skips channels without a seat', async () => {
    const { officer, club, channelIds } = await insertClubWithChannels();
    const member = await createTestUser();
    await inTransaction((session) => addMemberToClubChannels(club._id, member._id, session));
    await conversationService.createChannel(club._id, 'Events', [officer._id]);

    await inTransaction((session) => syncMemberChannelPermission(club._id, member._id, 'OFFICER', session));
    expect(await seatPermissions(member._id)).toEqual({ [channelIds[0]]: MODERATE, [channelIds[1]]: MODERATE });

    await inTransaction((session) => syncMemberChannelPermission(club._id, member._id, 'MEMBER', session));
    expect(await seatPermissions(member._id)).toEqual({ [channelIds[0]]: WRITE, [channelIds[1]]: WRITE });
    expect(await Message.countDocuments()).toBe(0);
  });

  it('promotes the only seated member when the channel has no moderator', async () => {
    const officer = await createTestUser();
    const club = await createTestClub(officer._id);
    const member = await createTestUser();
    const general = await conversationService.createChannel(club._id, 'General', [member._id]);

    await inTransaction((session) => syncMemberChannelPermission(club._id, member._id, 'OFFICER', session));

    expect(await seatPermissions(member._id)).toEqual({ [general._id.toString()]: MODERATE });
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
      role: 'OFFICER',
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
