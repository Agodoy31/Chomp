import { describe, it, expect, beforeAll, afterEach, afterAll, jest } from '@jest/globals';
import mongoose, { type ClientSession, type Types } from 'mongoose';
import { Club } from '../../src/clubs/model/clubModel';
import {
  addMemberToClubChannels,
  createGeneralChannel,
  syncMemberChannelPermission,
} from '../../src/clubs/services/clubChannelAccess';
import { ConversationType } from '../../src/messaging/interfaces/conversation.interfaces';
import { Conversation } from '../../src/messaging/models/Conversation';
import { ConversationParticipant, ParticipantPermission } from '../../src/messaging/models/ConversationParticipant';
import { Message } from '../../src/messaging/models/Message';
import * as conversationService from '../../src/messaging/services/conversation.service';
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
  await ConversationParticipant.updateOne(
    { conversationId: announcements._id, userId: officer._id },
    { permission: MODERATE }
  );
  return { officer, club, channelIds: [general._id.toString(), announcements._id.toString()] };
}

beforeAll(async () => {
  await connectTestDb();
  await Promise.all([Club.init(), Conversation.init(), ConversationParticipant.init(), Message.init(), User.init()]);
}, 60000);

afterEach(async () => {
  jest.restoreAllMocks();
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

    await inTransaction((session) =>
      syncMemberChannelPermission(club._id, member._id, 'OFFICER', officer._id, session)
    );
    expect(await seatPermissions(member._id)).toEqual({ [channelIds[0]]: MODERATE, [channelIds[1]]: MODERATE });

    await inTransaction((session) =>
      syncMemberChannelPermission(club._id, member._id, 'MEMBER', officer._id, session)
    );
    expect(await seatPermissions(member._id)).toEqual({ [channelIds[0]]: WRITE, [channelIds[1]]: WRITE });
    expect(await Message.countDocuments()).toBe(0);
  });

  it('updates through an existing channel moderator when the actor has no seat', async () => {
    const { officer, club, channelIds } = await insertClubWithChannels();
    const [member, admin] = await Promise.all([createTestUser(), createTestUser({ isAdmin: true })]);
    await inTransaction((session) => addMemberToClubChannels(club._id, member._id, session));
    const updateSpy = jest.spyOn(conversationService, 'updateParticipantPermissions');

    await inTransaction((session) =>
      syncMemberChannelPermission(club._id, member._id, 'OFFICER', admin._id, session)
    );

    expect(await seatPermissions(member._id)).toEqual({ [channelIds[0]]: MODERATE, [channelIds[1]]: MODERATE });
    expect(updateSpy.mock.calls.map(([, requesterId]) => requesterId.toString())).toEqual([
      officer._id.toString(),
      officer._id.toString(),
    ]);
  });

  it('sets the seat directly when the channel has no moderator', async () => {
    const officer = await createTestUser();
    const club = await createTestClub(officer._id);
    const member = await createTestUser();
    const general = await conversationService.createChannel(club._id, 'General', [member._id]);

    await inTransaction((session) =>
      syncMemberChannelPermission(club._id, member._id, 'OFFICER', officer._id, session)
    );

    expect(await seatPermissions(member._id)).toEqual({ [general._id.toString()]: MODERATE });
  });

  it('keeps the previous permission when the caller transaction aborts', async () => {
    const { officer, club, channelIds } = await insertClubWithChannels();
    const member = await createTestUser();
    await inTransaction((session) => addMemberToClubChannels(club._id, member._id, session));

    await expect(
      inTransaction(async (session) => {
        await syncMemberChannelPermission(club._id, member._id, 'OFFICER', officer._id, session);
        throw new Error('Simulated role update failure');
      })
    ).rejects.toThrow('Simulated role update failure');

    expect(await seatPermissions(member._id)).toEqual({ [channelIds[0]]: WRITE, [channelIds[1]]: WRITE });
  });
});
