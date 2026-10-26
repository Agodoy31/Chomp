import { describe, it, expect, beforeAll, afterEach, afterAll, jest } from '@jest/globals';
import mongoose, { Types } from 'mongoose';
import { connectTestDb, clearTestDb, closeTestDb } from '../../helpers/db';
import { Conversation } from '../../../src/messaging/models/Conversation';
import { ConversationParticipant } from '../../../src/messaging/models/ConversationParticipant';
import { Message } from '../../../src/messaging/models/Message';
import { ConversationType } from '../../../src/messaging/interfaces/conversation.interfaces';
import { User } from '../../../src/user/models/User';
import { Club } from '../../../src/clubs/model/clubModel';
import {
  DEFAULT_GROUP_CONVERSATION_TITLE,
  createChannel,
  createDirectConversation,
  createGroupConversation,
} from '../../../src/messaging/services/conversation.service';
import { createTestUser, createTestClub } from './conversationTestUtils';

beforeAll(async () => {
  await connectTestDb();
  await Promise.all([
    Club.init(),
    Conversation.init(),
    ConversationParticipant.init(),
    Message.init(),
    User.init(),
  ]);
}, 60000);

afterEach(async () => {
  jest.restoreAllMocks();
  await clearTestDb();
});

afterAll(async () => {
  await closeTestDb();
});

describe('createDirectConversation service', () => {
  it('creates new direct conversation and persists two participants in a transaction with isNew set to true', async () => {
    const user1 = await createTestUser({
      firstName: 'Potato',
      lastName: 'Sculpture',
      email: 'french_fries_monument@ufl.edu',
    });
    const user2 = await createTestUser({
      firstName: 'Reitz',
      lastName: 'Bowler',
      email: 'game.room@ufl.edu',
    });
    const expectedDmPairKey = [user1._id.toString(), user2._id.toString()].sort().join(':');

    const result = await createDirectConversation(user1._id, user2._id);

    expect(result.isNew).toBe(true);
    expect(result.conversation).toBeDefined();
    expect(result.conversation.type).toBe(ConversationType.DIRECT);
    expect(result.conversation.dmPairKey).toBe(expectedDmPairKey);

    const participants = await ConversationParticipant.find({
      conversationId: result.conversation._id,
    }).lean().exec();

    expect(participants).toHaveLength(2);
    const participantUserIds = participants.map((p) => {
      return p.userId.toString();
    });
    expect(participantUserIds).toContain(user1._id.toString());
    expect(participantUserIds).toContain(user2._id.toString());
  });

  it('returns existing conversation with isNew false regardless of caller argument order', async () => {
    const userA = await createTestUser({
      firstName: 'Tim',
      lastName: 'Tebow',
      email: 'ttebow15@ufl.edu',
    });
    const userB = await createTestUser({
      firstName: 'Potato',
      lastName: 'Sculpture',
      email: 'french_fries_monument@ufl.edu',
    });

    const firstResult = await createDirectConversation(userA._id, userB._id);
    expect(firstResult.isNew).toBe(true);

    const secondResult = await createDirectConversation(userB._id, userA._id);
    expect(secondResult.isNew).toBe(false);
    expect(secondResult.conversation._id.toString()).toBe(firstResult.conversation._id.toString());
    expect(secondResult.conversation.dmPairKey).toBe(firstResult.conversation.dmPairKey);

    const participants = await ConversationParticipant.find({
      conversationId: firstResult.conversation._id,
    }).lean().exec();
    expect(participants).toHaveLength(2);
  });

  it('throws error when creatorId and recipientId are identical', async () => {
    const user = await createTestUser({
      firstName: 'Reitz',
      lastName: 'Bowler',
      email: 'game.room@ufl.edu',
    });

    await expect(createDirectConversation(user._id, user._id)).rejects.toMatchObject({
      name: 'MessagingError',
      code: 'ERR_MESSAGE_SELF',
      message: 'Cannot start a direct message conversation with yourself',
    });

    const count = await Conversation.countDocuments().exec();
    expect(count).toBe(0);
  });

  it('throws error when creatorId or recipientId is invalid or missing', async () => {
    const validId = new Types.ObjectId();

    await expect(
      createDirectConversation(null as unknown as Types.ObjectId, validId)
    ).rejects.toThrow('Valid creatorId is required');

    await expect(
      createDirectConversation(undefined as unknown as Types.ObjectId, validId)
    ).rejects.toThrow('Valid creatorId is required');

    await expect(
      createDirectConversation('invalid-id' as unknown as Types.ObjectId, validId)
    ).rejects.toThrow('Valid creatorId is required');

    await expect(
      createDirectConversation(validId, null as unknown as Types.ObjectId)
    ).rejects.toThrow('Valid recipientId is required');

    await expect(
      createDirectConversation(validId, undefined as unknown as Types.ObjectId)
    ).rejects.toThrow('Valid recipientId is required');

    await expect(
      createDirectConversation(validId, 'invalid-id' as unknown as Types.ObjectId)
    ).rejects.toThrow('Valid recipientId is required');
  });

  it('handles race condition duplicate key error 11000 by returning existing conversation with isNew set to false', async () => {
    const user1 = await createTestUser({
      firstName: 'Potato',
      lastName: 'Sculpture',
      email: 'french_fries_monument@ufl.edu',
    });
    const user2 = await createTestUser({
      firstName: 'Reitz',
      lastName: 'Bowler',
      email: 'game.room@ufl.edu',
    });
    const dmPairKey = [user1._id.toString(), user2._id.toString()].sort().join(':');

    const winner = await Conversation.create({
      type: ConversationType.DIRECT,
      dmPairKey,
    });
    await ConversationParticipant.create([
      { conversationId: winner._id, userId: user1._id },
      { conversationId: winner._id, userId: user2._id },
    ]);

    const originalFindOne = Conversation.findOne.bind(Conversation);
    let findOneCallCount = 0;
    jest.spyOn(Conversation, 'findOne').mockImplementation((...args: any[]) => {
      findOneCallCount += 1;
      if (findOneCallCount === 1) {
        return {
          lean: () => {
            return {
              exec: async () => {
                return null;
              },
            };
          },
        } as any;
      }
      return originalFindOne(...(args as [any]));
    });

    const result = await createDirectConversation(user1._id, user2._id);

    expect(result.isNew).toBe(false);
    expect(result.conversation._id.toString()).toBe(winner._id.toString());
    expect(result.conversation.dmPairKey).toBe(dmPairKey);
  });

  it('rolls back transaction cleanly without creating orphaned conversation if participant creation fails', async () => {
    const user1 = await createTestUser({
      firstName: 'Potato',
      lastName: 'Sculpture',
      email: 'french_fries_monument@ufl.edu',
    });
    const user2 = await createTestUser({
      firstName: 'Tim',
      lastName: 'Tebow',
      email: 'ttebow15@ufl.edu',
    });
    const dmPairKey = [user1._id.toString(), user2._id.toString()].sort().join(':');

    jest
      .spyOn(ConversationParticipant, 'create')
      .mockRejectedValueOnce(new Error('Simulated participant creation failure'));

    await expect(createDirectConversation(user1._id, user2._id)).rejects.toThrow(
      'Simulated participant creation failure'
    );

    const orphanedConversation = await Conversation.findOne({ dmPairKey }).lean().exec();
    expect(orphanedConversation).toBeNull();

    const participants = await ConversationParticipant.find({
      userId: { $in: [user1._id, user2._id] },
    }).lean().exec();
    expect(participants).toHaveLength(0);
  });

  it('throws error when creator or recipient does not exist in database', async () => {
    const validUser = await createTestUser({
      firstName: 'Potato',
      lastName: 'Sculpture',
      email: 'french_fries_monument@ufl.edu',
    });
    const missingUserA = new Types.ObjectId();
    const missingUserB = new Types.ObjectId();

    await expect(
      createDirectConversation(missingUserA, validUser._id)
    ).rejects.toMatchObject({
      name: 'MessagingError',
      code: 'ERR_USER_NOT_FOUND',
      message: 'One or more users do not exist',
    });

    await expect(
      createDirectConversation(validUser._id, missingUserA)
    ).rejects.toMatchObject({
      name: 'MessagingError',
      code: 'ERR_USER_NOT_FOUND',
      message: 'One or more users do not exist',
    });

    await expect(
      createDirectConversation(missingUserA, missingUserB)
    ).rejects.toMatchObject({
      name: 'MessagingError',
      code: 'ERR_USER_NOT_FOUND',
      message: 'One or more users do not exist',
    });
  });
});

describe('createGroupConversation service', () => {
  it('creates group conversation with permissions initial system message and returns lean object', async () => {
    const creator = await createTestUser({
      firstName: 'Potato',
      lastName: 'Sculpture',
      email: 'french_fries_monument@ufl.edu',
    });
    const invited1 = await createTestUser({
      firstName: 'Reitz',
      lastName: 'Bowler',
      email: 'game.room@ufl.edu',
    });
    const invited2 = await createTestUser({
      firstName: 'Tim',
      lastName: 'Tebow',
      email: 'ttebow15@ufl.edu',
    });
    const title = 'Gator Lettuce Eating Club';

    const result = await createGroupConversation(creator._id, [invited1._id, invited2._id], title);

    expect(typeof result).toBe('object');
    expect(result).not.toBeNull();
    expect(result instanceof Conversation).toBe(false);
    expect(typeof (result as any).save).toBe('undefined');
    expect(result.type).toBe(ConversationType.GROUP);
    expect(result.title).toBe(title);

    const participants = await ConversationParticipant.find({
      conversationId: result._id,
    })
      .lean()
      .exec();

    expect(participants).toHaveLength(3);
    const creatorRecord = participants.find((p) => {
      return p.userId.toString() === creator._id.toString();
    });
    const invitedRecord1 = participants.find((p) => {
      return p.userId.toString() === invited1._id.toString();
    });
    const invitedRecord2 = participants.find((p) => {
      return p.userId.toString() === invited2._id.toString();
    });

    expect(creatorRecord?.permission).toBe('MODERATE');
    expect(invitedRecord1?.permission).toBe('WRITE');
    expect(invitedRecord2?.permission).toBe('WRITE');

    const systemMessages = await Message.find({
      conversationId: result._id,
    })
      .lean()
      .exec();

    expect(systemMessages).toHaveLength(1);
    expect(systemMessages[0].senderId.toString()).toBe(creator._id.toString());
    expect(systemMessages[0].text).toBe('Potato Sculpture created the group');
    expect(systemMessages[0].isSystem).toBe(true);
    expect(systemMessages[0].isAnnouncement).toBe(false);
  });

  it('handles group title trimming and default title fallbacks', async () => {
    const creator = await createTestUser({
      firstName: 'Potato',
      lastName: 'Sculpture',
      email: 'french_fries_monument@ufl.edu',
    });
    const member = await createTestUser({
      firstName: 'Reitz',
      lastName: 'Bowler',
      email: 'game.room@ufl.edu',
    });

    const trimmedResult = await createGroupConversation(
      creator._id,
      [member._id],
      '  Gator Lettuce Eating Club  '
    );
    expect(trimmedResult.title).toBe('Gator Lettuce Eating Club');
    const savedTrimmed = await Conversation.findById(trimmedResult._id).lean().exec();
    expect(savedTrimmed?.title).toBe('Gator Lettuce Eating Club');

    const omittedResult = await createGroupConversation(creator._id, [member._id]);
    expect(omittedResult.title).toBe(DEFAULT_GROUP_CONVERSATION_TITLE);

    const emptyResult = await createGroupConversation(creator._id, [member._id], '');
    expect(emptyResult.title).toBe(DEFAULT_GROUP_CONVERSATION_TITLE);

    const whitespaceResult = await createGroupConversation(creator._id, [member._id], '   ');
    expect(whitespaceResult.title).toBe(DEFAULT_GROUP_CONVERSATION_TITLE);
  });

  it('deduplicates duplicate IDs in participant list without throwing unique index collisions', async () => {
    const creator = await createTestUser({
      firstName: 'Potato',
      lastName: 'Sculpture',
      email: 'french_fries_monument@ufl.edu',
    });
    const user2 = await createTestUser({
      firstName: 'Reitz',
      lastName: 'Bowler',
      email: 'game.room@ufl.edu',
    });
    const user3 = await createTestUser({
      firstName: 'Tim',
      lastName: 'Tebow',
      email: 'ttebow15@ufl.edu',
    });

    const result = await createGroupConversation(
      creator._id,
      [user2._id, user2._id, user3._id, creator._id],
      'Turlington Preacher Debate Society'
    );

    const participants = await ConversationParticipant.find({
      conversationId: result._id,
    })
      .lean()
      .exec();

    expect(participants).toHaveLength(3);
    const participantUserIds = participants.map((p) => {
      return p.userId.toString();
    });
    expect(participantUserIds).toContain(creator._id.toString());
    expect(participantUserIds).toContain(user2._id.toString());
    expect(participantUserIds).toContain(user3._id.toString());
  });

  it('validates input parameters before creating group conversation', async () => {
    const creatorId = new Types.ObjectId();
    const otherId = new Types.ObjectId();

    await expect(
      createGroupConversation(null as unknown as Types.ObjectId, [otherId], 'Title')
    ).rejects.toThrow('Valid creatorId is required');

    await expect(
      createGroupConversation(undefined as unknown as Types.ObjectId, [otherId], 'Title')
    ).rejects.toThrow('Valid creatorId is required');

    await expect(
      createGroupConversation('invalid-id' as unknown as Types.ObjectId, [otherId], 'Title')
    ).rejects.toThrow('Valid creatorId is required');

    await expect(
      createGroupConversation(
        creatorId,
        null as unknown as Types.ObjectId[],
        'Title'
      )
    ).rejects.toThrow('participantIds must be an array');

    await expect(
      createGroupConversation(
        creatorId,
        'not-an-array' as unknown as Types.ObjectId[],
        'Title'
      )
    ).rejects.toThrow('participantIds must be an array');

    await expect(
      createGroupConversation(
        creatorId,
        [otherId, null as unknown as Types.ObjectId],
        'Title'
      )
    ).rejects.toThrow('Valid participantId is required');

    await expect(
      createGroupConversation(
        creatorId,
        [otherId, undefined as unknown as Types.ObjectId],
        'Title'
      )
    ).rejects.toThrow('Valid participantId is required');

    await expect(
      createGroupConversation(
        creatorId,
        [otherId, 'invalid-id' as unknown as Types.ObjectId],
        'Title'
      )
    ).rejects.toThrow('Valid participantId is required');

    await expect(
      createGroupConversation(creatorId, [], 'Title')
    ).rejects.toMatchObject({
      name: 'MessagingError',
      code: 'ERR_INSUFFICIENT_PARTICIPANTS',
      message: 'Group conversation requires at least two distinct participants',
    });

    await expect(
      createGroupConversation(creatorId, [creatorId], 'Title')
    ).rejects.toMatchObject({
      name: 'MessagingError',
      code: 'ERR_INSUFFICIENT_PARTICIPANTS',
      message: 'Group conversation requires at least two distinct participants',
    });
  });

  it('rolls back transaction cleanly without creating orphaned conversation if participant creation fails', async () => {
    const creator = await createTestUser({
      firstName: 'Potato',
      lastName: 'Sculpture',
      email: 'french_fries_monument@ufl.edu',
    });
    const user2 = await createTestUser({
      firstName: 'Reitz',
      lastName: 'Bowler',
      email: 'game.room@ufl.edu',
    });
    const title = 'Turlington Preacher Debate Society';

    jest
      .spyOn(ConversationParticipant, 'create')
      .mockRejectedValueOnce(new Error('Simulated participant creation failure'));

    await expect(
      createGroupConversation(creator._id, [user2._id], title)
    ).rejects.toThrow('Simulated participant creation failure');

    const orphanedConversation = await Conversation.findOne({ title }).lean().exec();
    expect(orphanedConversation).toBeNull();

    const participants = await ConversationParticipant.find({
      userId: { $in: [creator._id, user2._id] },
    })
      .lean()
      .exec();
    expect(participants).toHaveLength(0);
  });

  it('throws error when creator or invited participants do not exist in database', async () => {
    const existingUser = await createTestUser({
      firstName: 'Potato',
      lastName: 'Sculpture',
      email: 'french_fries_monument@ufl.edu',
    });
    const nonExistentUserA = new Types.ObjectId();
    const nonExistentUserB = new Types.ObjectId();

    await expect(
      createGroupConversation(nonExistentUserA, [existingUser._id], 'Turlington Preacher Debate Society')
    ).rejects.toThrow('One or more users do not exist');

    await expect(
      createGroupConversation(
        existingUser._id,
        [nonExistentUserA],
        'Turlington Preacher Debate Society'
      )
    ).rejects.toThrow('One or more users do not exist');

    await expect(
      createGroupConversation(
        nonExistentUserA,
        [nonExistentUserB],
        'Turlington Preacher Debate Society'
      )
    ).rejects.toThrow('One or more users do not exist');
  });
});

describe('createChannel service', () => {
  it('creates channel conversation with trimmed title and returns plain IConversation object', async () => {
    const user = await createTestUser({
      firstName: 'Potato',
      lastName: 'Sculpture',
      email: 'french_fries_monument@ufl.edu',
    });
    const club = await createTestClub(user._id, {
      name: 'Turlington Preacher Debate Society',
    });

    const result = await createChannel(club._id, '  general  ');

    expect(result).toBeDefined();
    expect(result._id).toBeDefined();
    expect(result.type).toBe(ConversationType.CHANNEL);
    expect(result.title).toBe('general');
    expect(result.clubId?.toString()).toBe(club._id.toString());
    expect((result as any).save).toBeUndefined();

    const inDb = await Conversation.findById(result._id).lean().exec();
    expect(inDb).not.toBeNull();
    expect(inDb?.title).toBe('general');
    expect(inDb?.type).toBe(ConversationType.CHANNEL);

    const participants = await ConversationParticipant.find({
      conversationId: result._id,
    }).lean().exec();
    expect(participants).toHaveLength(0);
  });

  it('creates channel with initial participants in a transaction', async () => {
    const creator = await createTestUser({
      firstName: 'Potato',
      lastName: 'Sculpture',
      email: 'french_fries_monument@ufl.edu',
    });
    const club = await createTestClub(creator._id, {
      name: 'Gator Lettuce Eating Club',
    });
    const user1 = await createTestUser({
      firstName: 'Reitz',
      lastName: 'Bowler',
      email: 'game.room@ufl.edu',
    });
    const user2 = await createTestUser({
      firstName: 'Tim',
      lastName: 'Tebow',
      email: 'ttebow15@ufl.edu',
    });

    const result = await createChannel(club._id, 'announcements', [user1._id, user2._id]);

    expect(result).toBeDefined();
    expect(result.type).toBe(ConversationType.CHANNEL);
    expect(result.title).toBe('announcements');
    expect(result.clubId?.toString()).toBe(club._id.toString());

    const participants = await ConversationParticipant.find({
      conversationId: result._id,
    }).lean().exec();
    expect(participants).toHaveLength(2);
    const participantUserIds = participants.map((p) => {
      return p.userId.toString();
    });
    expect(participantUserIds).toContain(user1._id.toString());
    expect(participantUserIds).toContain(user2._id.toString());
  });

  it('creates channel and initial participants within caller transaction when session is provided', async () => {
    const creator = await createTestUser({
      firstName: 'Potato',
      lastName: 'Sculpture',
      email: 'french_fries_monument@ufl.edu',
    });
    const club = await createTestClub(creator._id, {
      name: 'Newell Hall Late Night Debuggers',
    });
    const user = await createTestUser({
      firstName: 'Reitz',
      lastName: 'Bowler',
      email: 'game.room@ufl.edu',
    });

    const session = await mongoose.startSession();
    session.startTransaction();

    let result;
    try {
      result = await createChannel(club._id, 'caller-transaction-channel', [user._id], session);
      await session.commitTransaction();
    } finally {
      await session.endSession();
    }

    expect(result).toBeDefined();
    const inDb = await Conversation.findById(result._id).lean().exec();
    expect(inDb).not.toBeNull();
    expect(inDb?.title).toBe('caller-transaction-channel');

    const participants = await ConversationParticipant.find({
      conversationId: result._id,
    }).lean().exec();
    expect(participants).toHaveLength(1);
    expect(participants[0].userId.toString()).toBe(user._id.toString());
  });

  it('throws error when target club does not exist', async () => {
    const nonExistentClubId = new Types.ObjectId();

    await expect(
      createChannel(nonExistentClubId, 'general')
    ).rejects.toMatchObject({
      name: 'MessagingError',
      code: 'ERR_CLUB_NOT_FOUND',
      message: 'Club does not exist',
    });
  });

  it('throws error when channel title is duplicate within the same club case-insensitively', async () => {
    const creator = await createTestUser({
      firstName: 'Potato',
      lastName: 'Sculpture',
      email: 'french_fries_monument@ufl.edu',
    });
    const club = await createTestClub(creator._id, {
      name: 'Gator Lettuce Eating Club',
    });

    await createChannel(club._id, 'events');

    await expect(
      createChannel(club._id, 'Events')
    ).rejects.toMatchObject({
      name: 'MessagingError',
      code: 'ERR_CHANNEL_TITLE_EXISTS',
      message: 'A channel with this title already exists in the club',
    });
  });

  it('allows identical channel titles across different clubs', async () => {
    const creator = await createTestUser({
      firstName: 'Potato',
      lastName: 'Sculpture',
      email: 'french_fries_monument@ufl.edu',
    });
    const club1 = await createTestClub(creator._id, {
      name: 'Gator Lettuce Eating Club',
    });
    const club2 = await createTestClub(creator._id, {
      name: 'Turlington Preacher Debate Society',
    });

    const channel1 = await createChannel(club1._id, 'general');
    const channel2 = await createChannel(club2._id, 'general');

    expect(channel1).toBeDefined();
    expect(channel2).toBeDefined();
    expect(channel1._id.toString()).not.toBe(channel2._id.toString());
    expect(channel1.clubId?.toString()).toBe(club1._id.toString());
    expect(channel2.clubId?.toString()).toBe(club2._id.toString());
    expect(channel1.title).toBe('general');
    expect(channel2.title).toBe('general');
  });

  it('validates input parameters before creating channel', async () => {
    const dummyClubId = new Types.ObjectId();
    const dummyUserId = new Types.ObjectId();

    await expect(
      createChannel(null as unknown as Types.ObjectId, 'general')
    ).rejects.toMatchObject({
      name: 'MessagingError',
      code: 'ERR_INVALID_INPUT',
      message: 'Valid clubId is required',
    });

    await expect(
      createChannel(undefined as unknown as Types.ObjectId, 'general')
    ).rejects.toMatchObject({
      name: 'MessagingError',
      code: 'ERR_INVALID_INPUT',
      message: 'Valid clubId is required',
    });

    await expect(
      createChannel('invalid-id' as unknown as Types.ObjectId, 'general')
    ).rejects.toMatchObject({
      name: 'MessagingError',
      code: 'ERR_INVALID_INPUT',
      message: 'Valid clubId is required',
    });

    await expect(
      createChannel(dummyClubId, '')
    ).rejects.toMatchObject({
      name: 'MessagingError',
      code: 'ERR_TITLE_REQUIRED',
      message: 'Channel title is required',
    });

    await expect(
      createChannel(dummyClubId, '   ')
    ).rejects.toMatchObject({
      name: 'MessagingError',
      code: 'ERR_TITLE_REQUIRED',
      message: 'Channel title is required',
    });

    await expect(
      createChannel(dummyClubId, null as unknown as string)
    ).rejects.toMatchObject({
      name: 'MessagingError',
      code: 'ERR_TITLE_REQUIRED',
      message: 'Channel title is required',
    });

    await expect(
      createChannel(dummyClubId, 'general', null as any)
    ).rejects.toMatchObject({
      name: 'MessagingError',
      code: 'ERR_INVALID_INPUT',
      message: 'participantIds must be an array',
    });

    await expect(
      createChannel(dummyClubId, 'general', 'not-an-array' as any)
    ).rejects.toMatchObject({
      name: 'MessagingError',
      code: 'ERR_INVALID_INPUT',
      message: 'participantIds must be an array',
    });

    const creator = await createTestUser({
      firstName: 'Potato',
      lastName: 'Sculpture',
      email: 'french_fries_monument@ufl.edu',
    });
    const club = await createTestClub(creator._id, {
      name: 'Gator Lettuce Eating Club',
    });

    await expect(
      createChannel(club._id, 'general', [dummyUserId, 'invalid-id' as any])
    ).rejects.toThrow('Valid participantId is required');
  });

  it('throws error when one or more participant users do not exist', async () => {
    const creator = await createTestUser({
      firstName: 'Potato',
      lastName: 'Sculpture',
      email: 'french_fries_monument@ufl.edu',
    });
    const club = await createTestClub(creator._id, {
      name: 'Gator Lettuce Eating Club',
    });
    const nonExistentUserId = new Types.ObjectId();

    await expect(
      createChannel(club._id, 'general', [nonExistentUserId])
    ).rejects.toThrow('One or more users do not exist');
  });

  it('aborts transaction and rolls back channel if participant creation fails', async () => {
    const creator = await createTestUser({
      firstName: 'Potato',
      lastName: 'Sculpture',
      email: 'french_fries_monument@ufl.edu',
    });
    const club = await createTestClub(creator._id, {
      name: 'Gator Lettuce Eating Club',
    });
    const user = await createTestUser({
      firstName: 'Reitz',
      lastName: 'Bowler',
      email: 'game.room@ufl.edu',
    });

    jest
      .spyOn(ConversationParticipant, 'create')
      .mockRejectedValueOnce(new Error('Participant write failed'));

    await expect(
      createChannel(club._id, 'rollback-channel', [user._id])
    ).rejects.toThrow('Participant write failed');

    const conversation = await Conversation.findOne({
      clubId: club._id,
      title: 'rollback-channel',
    }).lean().exec();
    expect(conversation).toBeNull();
  });
});
