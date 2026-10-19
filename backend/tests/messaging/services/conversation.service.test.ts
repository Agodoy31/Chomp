// See Issue #98: https://github.com/Agodoy31/Chomp/issues/98
// See Issue #100: https://github.com/Agodoy31/Chomp/issues/100
import { describe, it, expect, beforeAll, afterEach, afterAll, jest } from '@jest/globals';
import mongoose, { Types } from 'mongoose';
import { connectTestDb, clearTestDb, closeTestDb } from '../../helpers/db';
import { Conversation } from '../../../src/messaging/models/Conversation';
import { ConversationParticipant } from '../../../src/messaging/models/ConversationParticipant';
import { ConversationType } from '../../../src/messaging/interfaces/conversation.interfaces';
import { User, IUserDocument } from '../../../src/user/models/User';
import { Club } from '../../../src/clubs/model/clubModel';
import {
  DEFAULT_GROUP_CONVERSATION_TITLE,
  addParticipantsToConversation,
  createChannel,
  createDirectConversation,
  createGroupConversation,
  getConversationById,
  getConversationDetails,
  getConversationDocumentById,
  getConversationParticipants,
  isUserParticipant,
  leaveConversation,
  removeParticipantFromConversation,
  updateConversationTitle,
  validateUsersExist,
} from '../../../src/messaging/services/conversation.service';

beforeAll(async () => {
  await connectTestDb();
  await Promise.all([
    Club.init(),
    Conversation.init(),
    ConversationParticipant.init(),
    User.init(),
  ]);
}, 60000);

async function createTestUser(
  overrides: Partial<IUserDocument> = {}
): Promise<IUserDocument> {
  const userId = overrides._id ?? new Types.ObjectId();
  return User.create({
    _id: userId,
    email: `student_${userId.toString()}@ufl.edu`,
    hashedPassword: 'hashedPassword123',
    firstName: 'Albert',
    lastName: 'Gator',
    ...overrides,
  });
}

async function createTestClub(
  proposerId: Types.ObjectId,
  overrides: Partial<any> = {}
): Promise<any> {
  const clubId = overrides._id ?? new Types.ObjectId();
  return Club.create({
    _id: clubId,
    name: `Test Club ${clubId.toString()}`,
    description: 'A test club description',
    category: 'ACADEMIC',
    proposerId,
    status: 'APPROVED',
    ...overrides,
  });
}

afterEach(async () => {
  jest.restoreAllMocks();
  await clearTestDb();
});

afterAll(async () => {
  await closeTestDb();
});

describe('createDirectConversation service', () => {

  it('creates new direct conversation and persists two participants in a transaction with isNew set to true', async () => {
    const user1 = await createTestUser();
    const user2 = await createTestUser();
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

  it('returns existing conversation with isNew set to false when called again', async () => {
    const user1 = await createTestUser();
    const user2 = await createTestUser();

    const firstResult = await createDirectConversation(user1._id, user2._id);
    expect(firstResult.isNew).toBe(true);

    const secondResult = await createDirectConversation(user1._id, user2._id);
    expect(secondResult.isNew).toBe(false);
    expect(secondResult.conversation._id.toString()).toBe(firstResult.conversation._id.toString());
    expect(secondResult.conversation.dmPairKey).toBe(firstResult.conversation.dmPairKey);

    const participants = await ConversationParticipant.find({
      conversationId: firstResult.conversation._id,
    }).lean().exec();
    expect(participants).toHaveLength(2);
  });

  it('returns identical conversation regardless of argument order userA userB vs userB userA', async () => {
    const userA = await createTestUser();
    const userB = await createTestUser();

    const firstResult = await createDirectConversation(userA._id, userB._id);
    expect(firstResult.isNew).toBe(true);

    const secondResult = await createDirectConversation(userB._id, userA._id);
    expect(secondResult.isNew).toBe(false);
    expect(secondResult.conversation._id.toString()).toBe(firstResult.conversation._id.toString());
    expect(secondResult.conversation.dmPairKey).toBe(firstResult.conversation.dmPairKey);
  });

  it('throws error when creatorId and recipientId are identical', async () => {
    const user = await createTestUser();

    await expect(createDirectConversation(user._id, user._id)).rejects.toThrow(
      'Cannot start a direct message conversation with yourself'
    );

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
    const user1 = await createTestUser();
    const user2 = await createTestUser();
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
    const user1 = await createTestUser();
    const user2 = await createTestUser();
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

  it('throws error when creator does not exist in database', async () => {
    const nonExistentCreatorId = new Types.ObjectId();
    const recipient = await createTestUser();

    await expect(
      createDirectConversation(nonExistentCreatorId, recipient._id)
    ).rejects.toThrow('One or more users do not exist');
  });

  it('throws error when recipient does not exist in database', async () => {
    const creator = await createTestUser();
    const nonExistentRecipientId = new Types.ObjectId();

    await expect(
      createDirectConversation(creator._id, nonExistentRecipientId)
    ).rejects.toThrow('One or more users do not exist');
  });

  it('throws error when neither user exists in database', async () => {
    const nonExistentUser1 = new Types.ObjectId();
    const nonExistentUser2 = new Types.ObjectId();

    await expect(
      createDirectConversation(nonExistentUser1, nonExistentUser2)
    ).rejects.toThrow('One or more users do not exist');
  });
});

describe('getConversationById service', () => {
  it('returns conversation plain object when valid conversation exists', async () => {
    const user1 = new Types.ObjectId();
    const user2 = new Types.ObjectId();
    const dmPairKey = [user1.toString(), user2.toString()].sort().join(':');

    const created = await Conversation.create({
      type: ConversationType.DIRECT,
      dmPairKey,
    });

    const result = await getConversationById(created._id);

    expect(result).not.toBeNull();
    expect(result?._id.toString()).toBe(created._id.toString());
    expect(result?.type).toBe(ConversationType.DIRECT);
    expect(result?.dmPairKey).toBe(dmPairKey);
    expect(result instanceof Conversation).toBe(false);
    expect((result as any).save).toBeUndefined();
  });

  it('returns null when valid ObjectId is not in database', async () => {
    const nonExistentId = new Types.ObjectId();
    const result = await getConversationById(nonExistentId);
    expect(result).toBeNull();
  });

  it('throws error when conversationId is missing or invalid', async () => {
    await expect(
      getConversationById(null as unknown as Types.ObjectId)
    ).rejects.toThrow('Valid conversationId is required');

    await expect(
      getConversationById(undefined as unknown as Types.ObjectId)
    ).rejects.toThrow('Valid conversationId is required');

    await expect(
      getConversationById('invalid-id' as unknown as Types.ObjectId)
    ).rejects.toThrow('Valid conversationId is required');
  });
});

describe('getConversationDocumentById service', () => {
  it('returns full Mongoose document when valid conversation exists', async () => {
    const user1 = new Types.ObjectId();
    const user2 = new Types.ObjectId();
    const dmPairKey = [user1.toString(), user2.toString()].sort().join(':');

    const created = await Conversation.create({
      type: ConversationType.DIRECT,
      dmPairKey,
    });

    const result = await getConversationDocumentById(created._id);

    expect(result).not.toBeNull();
    expect(result?._id.toString()).toBe(created._id.toString());
    expect(result?.type).toBe(ConversationType.DIRECT);
    expect(result?.dmPairKey).toBe(dmPairKey);
    expect(result instanceof Conversation).toBe(true);
    expect(typeof (result as any).save).toBe('function');
  });

  it('returns null when valid ObjectId is not in database', async () => {
    const nonExistentId = new Types.ObjectId();
    const result = await getConversationDocumentById(nonExistentId);
    expect(result).toBeNull();
  });

  it('throws error when conversationId is missing or invalid', async () => {
    await expect(
      getConversationDocumentById(null as unknown as Types.ObjectId)
    ).rejects.toThrow('Valid conversationId is required');

    await expect(
      getConversationDocumentById(undefined as unknown as Types.ObjectId)
    ).rejects.toThrow('Valid conversationId is required');

    await expect(
      getConversationDocumentById('invalid-id' as unknown as Types.ObjectId)
    ).rejects.toThrow('Valid conversationId is required');
  });
});

describe('createGroupConversation service', () => {
  it('creates group conversation with title and saves all participants in a transaction', async () => {
    const creator = await createTestUser();
    const user2 = await createTestUser();
    const user3 = await createTestUser();
    const title = 'Study Group';

    const result = await createGroupConversation(creator._id, [user2._id, user3._id], title);

    expect(result).toBeDefined();
    expect(result._id).toBeDefined();
    expect(result.type).toBe(ConversationType.GROUP);
    expect(result.title).toBe(title);

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

  it('trims leading and trailing whitespace from group title', async () => {
    const creator = await createTestUser();
    const user2 = await createTestUser();
    const untrimmedTitle = '  Algorithms Study Group  ';

    const result = await createGroupConversation(creator._id, [user2._id], untrimmedTitle);

    expect(result.title).toBe('Algorithms Study Group');

    const savedInDb = await Conversation.findById(result._id).lean().exec();
    expect(savedInDb?.title).toBe('Algorithms Study Group');
  });

  it('falls back to default title when title is undefined or omitted', async () => {
    const creator = await createTestUser();
    const user2 = await createTestUser();

    const result = await createGroupConversation(creator._id, [user2._id]);

    expect(result.title).toBe(DEFAULT_GROUP_CONVERSATION_TITLE);

    const savedInDb = await Conversation.findById(result._id).lean().exec();
    expect(savedInDb?.title).toBe(DEFAULT_GROUP_CONVERSATION_TITLE);
  });

  it('falls back to default title when title is empty string or whitespace only', async () => {
    const creator = await createTestUser();
    const user2 = await createTestUser();

    const emptyResult = await createGroupConversation(creator._id, [user2._id], '');
    expect(emptyResult.title).toBe(DEFAULT_GROUP_CONVERSATION_TITLE);

    const whitespaceResult = await createGroupConversation(creator._id, [user2._id], '   ');
    expect(whitespaceResult.title).toBe(DEFAULT_GROUP_CONVERSATION_TITLE);
  });

  it('automatically includes creator as participant when omitted from participant list', async () => {
    const creator = await createTestUser();
    const user2 = await createTestUser();
    const user3 = await createTestUser();

    const result = await createGroupConversation(
      creator._id,
      [user2._id, user3._id],
      'Project Team'
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
  });

  it('deduplicates duplicate IDs in participant list without throwing unique index collisions', async () => {
    const creator = await createTestUser();
    const user2 = await createTestUser();
    const user3 = await createTestUser();

    const result = await createGroupConversation(
      creator._id,
      [user2._id, user2._id, user3._id, creator._id],
      'Deduplication Test'
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

  it('throws error when creatorId is missing or invalid', async () => {
    const user2 = new Types.ObjectId();

    await expect(
      createGroupConversation(null as unknown as Types.ObjectId, [user2], 'Title')
    ).rejects.toThrow('Valid creatorId is required');

    await expect(
      createGroupConversation(undefined as unknown as Types.ObjectId, [user2], 'Title')
    ).rejects.toThrow('Valid creatorId is required');

    await expect(
      createGroupConversation('invalid-id' as unknown as Types.ObjectId, [user2], 'Title')
    ).rejects.toThrow('Valid creatorId is required');
  });

  it('throws error when participantIds is not an array', async () => {
    const creatorId = new Types.ObjectId();

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
  });

  it('throws error when participantIds contains missing or invalid IDs', async () => {
    const creatorId = new Types.ObjectId();
    const user2 = new Types.ObjectId();

    await expect(
      createGroupConversation(
        creatorId,
        [user2, null as unknown as Types.ObjectId],
        'Title'
      )
    ).rejects.toThrow('Valid participantId is required');

    await expect(
      createGroupConversation(
        creatorId,
        [user2, undefined as unknown as Types.ObjectId],
        'Title'
      )
    ).rejects.toThrow('Valid participantId is required');

    await expect(
      createGroupConversation(
        creatorId,
        [user2, 'invalid-id' as unknown as Types.ObjectId],
        'Title'
      )
    ).rejects.toThrow('Valid participantId is required');
  });

  it('throws error when group has fewer than two distinct participants', async () => {
    const creator = await createTestUser();

    await expect(
      createGroupConversation(creator._id, [], 'Title')
    ).rejects.toThrow('Group conversation requires at least two distinct participants');

    await expect(
      createGroupConversation(creator._id, [creator._id], 'Title')
    ).rejects.toThrow('Group conversation requires at least two distinct participants');
  });

  it('rolls back transaction cleanly without creating orphaned conversation if participant creation fails', async () => {
    const creator = await createTestUser();
    const user2 = await createTestUser();
    const title = 'Rollback Test Group';

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

  it('returns lean plain object matching IConversation interface', async () => {
    const creator = await createTestUser();
    const user2 = await createTestUser();
    const title = 'Plain Object Group';

    const result = await createGroupConversation(creator._id, [user2._id], title);

    expect(typeof result).toBe('object');
    expect(result).not.toBeNull();
    expect(result instanceof Conversation).toBe(false);
    expect(typeof (result as any).save).toBe('undefined');
    expect(result.type).toBe(ConversationType.GROUP);
    expect(result.title).toBe(title);
  });

  it('throws error when creator does not exist in database', async () => {
    const nonExistentCreatorId = new Types.ObjectId();
    const user2 = await createTestUser();

    await expect(
      createGroupConversation(nonExistentCreatorId, [user2._id], 'Study Group')
    ).rejects.toThrow('One or more users do not exist');
  });

  it('throws error when one or more participants do not exist in database', async () => {
    const creator = await createTestUser();
    const existingUser = await createTestUser();
    const nonExistentUser = new Types.ObjectId();

    await expect(
      createGroupConversation(
        creator._id,
        [existingUser._id, nonExistentUser],
        'Study Group'
      )
    ).rejects.toThrow('One or more users do not exist');
  });

  it('throws error when none of the participants exist in database', async () => {
    const nonExistentCreatorId = new Types.ObjectId();
    const nonExistentUser2 = new Types.ObjectId();

    await expect(
      createGroupConversation(
        nonExistentCreatorId,
        [nonExistentUser2],
        'Study Group'
      )
    ).rejects.toThrow('One or more users do not exist');
  });
});

describe('validateUsersExist service', () => {
  it('returns true when a single user exists', async () => {
    const user = await createTestUser();
    const result = await validateUsersExist([user._id]);
    expect(result).toBe(true);
  });

  it('returns true when single user object id is passed directly as scalar', async () => {
    const user = await createTestUser();
    const result = await validateUsersExist(user._id);
    expect(result).toBe(true);
  });

  it('returns true when all multiple users exist', async () => {
    const user1 = await createTestUser();
    const user2 = await createTestUser();
    const user3 = await createTestUser();

    const result = await validateUsersExist([user1._id, user2._id, user3._id]);
    expect(result).toBe(true);
  });

  it('returns false when a single user does not exist', async () => {
    const missingUserId = new Types.ObjectId();
    const result = await validateUsersExist([missingUserId]);
    expect(result).toBe(false);
  });

  it('returns false when single missing user object id is passed directly as scalar', async () => {
    const missingUserId = new Types.ObjectId();
    const result = await validateUsersExist(missingUserId);
    expect(result).toBe(false);
  });

  it('returns false when one user exists and another does not', async () => {
    const existingUser = await createTestUser();
    const missingUserId = new Types.ObjectId();

    const result = await validateUsersExist([existingUser._id, missingUserId]);
    expect(result).toBe(false);
  });

  it('returns false when input is an empty array', async () => {
    const result = await validateUsersExist([]);
    expect(result).toBe(false);
  });

  it('does not query database and returns false when input is an empty array', async () => {
    const countDocumentsSpy = jest.spyOn(User, 'countDocuments');
    const result = await validateUsersExist([]);
    expect(result).toBe(false);
    expect(countDocumentsSpy).not.toHaveBeenCalled();
  });
});

describe('createChannel service', () => {
  it('creates channel conversation with trimmed title and returns plain IConversation object', async () => {
    const user = await createTestUser();
    const club = await createTestClub(user._id);

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
    const creator = await createTestUser();
    const club = await createTestClub(creator._id);
    const user1 = await createTestUser();
    const user2 = await createTestUser();

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
    const creator = await createTestUser();
    const club = await createTestClub(creator._id);
    const user = await createTestUser();

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
    ).rejects.toThrow('Club does not exist');
  });

  it('throws error when channel title is duplicate within the same club case-insensitively', async () => {
    const creator = await createTestUser();
    const club = await createTestClub(creator._id);

    await createChannel(club._id, 'events');

    await expect(
      createChannel(club._id, 'Events')
    ).rejects.toThrow('A channel with this title already exists in the club');
  });

  it('allows identical channel titles across different clubs', async () => {
    const creator = await createTestUser();
    const club1 = await createTestClub(creator._id);
    const club2 = await createTestClub(creator._id);

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

  it('throws error when clubId is missing or invalid', async () => {
    await expect(
      createChannel(null as unknown as Types.ObjectId, 'general')
    ).rejects.toThrow('Valid clubId is required');

    await expect(
      createChannel(undefined as unknown as Types.ObjectId, 'general')
    ).rejects.toThrow('Valid clubId is required');

    await expect(
      createChannel('invalid-id' as unknown as Types.ObjectId, 'general')
    ).rejects.toThrow('Valid clubId is required');
  });

  it('throws error when title is missing or whitespace only', async () => {
    const creator = await createTestUser();
    const club = await createTestClub(creator._id);

    await expect(
      createChannel(club._id, '')
    ).rejects.toThrow('Channel title is required');

    await expect(
      createChannel(club._id, '   ')
    ).rejects.toThrow('Channel title is required');

    await expect(
      createChannel(club._id, null as unknown as string)
    ).rejects.toThrow('Channel title is required');
  });

  it('throws error when participantIds is not an array', async () => {
    const creator = await createTestUser();
    const club = await createTestClub(creator._id);

    await expect(
      createChannel(club._id, 'general', null as any)
    ).rejects.toThrow('participantIds must be an array');

    await expect(
      createChannel(club._id, 'general', 'not-an-array' as any)
    ).rejects.toThrow('participantIds must be an array');
  });

  it('throws error when any participant ID is invalid', async () => {
    const creator = await createTestUser();
    const club = await createTestClub(creator._id);
    const validUser = await createTestUser();

    await expect(
      createChannel(club._id, 'general', [validUser._id, 'invalid-id' as any])
    ).rejects.toThrow('Valid participantId is required');
  });

  it('throws error when one or more participant users do not exist', async () => {
    const creator = await createTestUser();
    const club = await createTestClub(creator._id);
    const nonExistentUserId = new Types.ObjectId();

    await expect(
      createChannel(club._id, 'general', [nonExistentUserId])
    ).rejects.toThrow('One or more users do not exist');
  });

  it('aborts transaction and rolls back channel if participant creation fails', async () => {
    const creator = await createTestUser();
    const club = await createTestClub(creator._id);
    const user = await createTestUser();

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

describe('isUserParticipant service', () => {
  it('returns true when user is participant in conversation', async () => {
    const user1 = await createTestUser();
    const user2 = await createTestUser();
    const group = await createGroupConversation(user1._id, [user2._id], 'Participant Check Group');

    const isUser1Participant = await isUserParticipant(group._id, user1._id);
    const isUser2Participant = await isUserParticipant(group._id, user2._id);

    expect(isUser1Participant).toBe(true);
    expect(isUser2Participant).toBe(true);
  });

  it('returns false when user is not participant in conversation', async () => {
    const user1 = await createTestUser();
    const user2 = await createTestUser();
    const outsider = await createTestUser();
    const group = await createGroupConversation(user1._id, [user2._id], 'Participant Check Group');

    const isOutsiderParticipant = await isUserParticipant(group._id, outsider._id);

    expect(isOutsiderParticipant).toBe(false);
  });

  it('throws error when conversationId is missing or invalid', async () => {
    const user = await createTestUser();

    await expect(
      isUserParticipant(null as unknown as Types.ObjectId, user._id)
    ).rejects.toThrow('Valid conversationId is required');

    await expect(
      isUserParticipant(undefined as unknown as Types.ObjectId, user._id)
    ).rejects.toThrow('Valid conversationId is required');

    await expect(
      isUserParticipant('invalid-id' as unknown as Types.ObjectId, user._id)
    ).rejects.toThrow('Valid conversationId is required');
  });

  it('throws error when userId is missing or invalid', async () => {
    const user1 = await createTestUser();
    const user2 = await createTestUser();
    const group = await createGroupConversation(user1._id, [user2._id], 'Participant Check Group');

    await expect(
      isUserParticipant(group._id, null as unknown as Types.ObjectId)
    ).rejects.toThrow('Valid userId is required');

    await expect(
      isUserParticipant(group._id, undefined as unknown as Types.ObjectId)
    ).rejects.toThrow('Valid userId is required');

    await expect(
      isUserParticipant(group._id, 'invalid-id' as unknown as Types.ObjectId)
    ).rejects.toThrow('Valid userId is required');
  });
});

describe('getConversationParticipants service', () => {
  it('returns all participant records for conversation as plain objects', async () => {
    const user1 = await createTestUser();
    const user2 = await createTestUser();
    const group = await createGroupConversation(user1._id, [user2._id], 'Participants Query Group');

    const participants = await getConversationParticipants(group._id);

    expect(participants).toHaveLength(2);
    expect(participants[0] instanceof ConversationParticipant).toBe(false);
    expect((participants[0] as any).save).toBeUndefined();

    const participantUserIds = participants.map((p) => {
      return p.userId.toString();
    });
    expect(participantUserIds).toContain(user1._id.toString());
    expect(participantUserIds).toContain(user2._id.toString());
  });

  it('returns empty array when conversation has no participants', async () => {
    const creator = await createTestUser();
    const club = await createTestClub(creator._id);
    const channel = await createChannel(club._id, 'empty-participants-channel');

    const participants = await getConversationParticipants(channel._id);

    expect(participants).toEqual([]);
  });

  it('throws error when conversationId is missing or invalid', async () => {
    await expect(
      getConversationParticipants(null as unknown as Types.ObjectId)
    ).rejects.toThrow('Valid conversationId is required');

    await expect(
      getConversationParticipants(undefined as unknown as Types.ObjectId)
    ).rejects.toThrow('Valid conversationId is required');

    await expect(
      getConversationParticipants('invalid-id' as unknown as Types.ObjectId)
    ).rejects.toThrow('Valid conversationId is required');
  });
});

describe('addParticipantsToConversation service', () => {
  it('adds participants to group conversation and returns plain objects', async () => {
    const user1 = await createTestUser();
    const user2 = await createTestUser();
    const group = await createGroupConversation(user1._id, [user2._id], 'Add Participants Group');

    const user3 = await createTestUser();
    const user4 = await createTestUser();

    const added = await addParticipantsToConversation(group._id, [user3._id, user4._id]);

    expect(added).toHaveLength(2);
    expect(added[0] instanceof ConversationParticipant).toBe(false);
    expect((added[0] as any).save).toBeUndefined();

    const addedIds = added.map((p) => {
      return p.userId.toString();
    });
    expect(addedIds).toContain(user3._id.toString());
    expect(addedIds).toContain(user4._id.toString());

    const allInDb = await ConversationParticipant.find({
      conversationId: group._id,
    }).lean().exec();
    expect(allInDb).toHaveLength(4);
  });

  it('ignores users who are already participants without throwing duplicate key errors', async () => {
    const user1 = await createTestUser();
    const user2 = await createTestUser();
    const group = await createGroupConversation(user1._id, [user2._id], 'Duplicate Ignore Group');

    const user3 = await createTestUser();

    const firstAdd = await addParticipantsToConversation(group._id, [
      user1._id,
      user2._id,
      user3._id,
    ]);
    expect(firstAdd).toHaveLength(1);
    expect(firstAdd[0].userId.toString()).toBe(user3._id.toString());

    const secondAdd = await addParticipantsToConversation(group._id, [
      user1._id,
      user3._id,
    ]);
    expect(secondAdd).toHaveLength(0);

    const allInDb = await ConversationParticipant.find({
      conversationId: group._id,
    }).lean().exec();
    expect(allInDb).toHaveLength(3);
  });

  it('throws error when attempting to add participants to a direct conversation', async () => {
    const user1 = await createTestUser();
    const user2 = await createTestUser();
    const directResult = await createDirectConversation(user1._id, user2._id);
    const user3 = await createTestUser();

    await expect(
      addParticipantsToConversation(directResult.conversation._id, [user3._id])
    ).rejects.toThrow('Cannot add participants to a direct conversation');
  });

  it('throws error when conversation does not exist', async () => {
    const nonExistentConversationId = new Types.ObjectId();
    const user = await createTestUser();

    await expect(
      addParticipantsToConversation(nonExistentConversationId, [user._id])
    ).rejects.toThrow('Conversation does not exist');
  });

  it('throws error when conversationId is missing or invalid', async () => {
    const user = await createTestUser();

    await expect(
      addParticipantsToConversation(null as unknown as Types.ObjectId, [user._id])
    ).rejects.toThrow('Valid conversationId is required');

    await expect(
      addParticipantsToConversation(undefined as unknown as Types.ObjectId, [user._id])
    ).rejects.toThrow('Valid conversationId is required');

    await expect(
      addParticipantsToConversation('invalid-id' as unknown as Types.ObjectId, [user._id])
    ).rejects.toThrow('Valid conversationId is required');
  });

  it('throws error when userIds is not an array', async () => {
    const user1 = await createTestUser();
    const user2 = await createTestUser();
    const group = await createGroupConversation(user1._id, [user2._id], 'Array Check Group');

    await expect(
      addParticipantsToConversation(group._id, null as unknown as Types.ObjectId[])
    ).rejects.toThrow('userIds must be an array');

    await expect(
      addParticipantsToConversation(group._id, undefined as unknown as Types.ObjectId[])
    ).rejects.toThrow('userIds must be an array');

    await expect(
      addParticipantsToConversation(group._id, 'not-an-array' as unknown as Types.ObjectId[])
    ).rejects.toThrow('userIds must be an array');
  });

  it('throws error when any userId is invalid', async () => {
    const user1 = await createTestUser();
    const user2 = await createTestUser();
    const group = await createGroupConversation(user1._id, [user2._id], 'Valid User ID Check Group');
    const validUser = await createTestUser();

    await expect(
      addParticipantsToConversation(group._id, [validUser._id, null as unknown as Types.ObjectId])
    ).rejects.toThrow('Valid participantId is required');

    await expect(
      addParticipantsToConversation(group._id, [validUser._id, undefined as unknown as Types.ObjectId])
    ).rejects.toThrow('Valid participantId is required');

    await expect(
      addParticipantsToConversation(group._id, [validUser._id, 'invalid-id' as unknown as Types.ObjectId])
    ).rejects.toThrow('Valid participantId is required');
  });

  it('throws error when one or more users do not exist', async () => {
    const user1 = await createTestUser();
    const user2 = await createTestUser();
    const group = await createGroupConversation(user1._id, [user2._id], 'Existence Check Group');
    const existingUser = await createTestUser();
    const nonExistentUserId = new Types.ObjectId();

    await expect(
      addParticipantsToConversation(group._id, [existingUser._id, nonExistentUserId])
    ).rejects.toThrow('One or more users do not exist');
  });

  it('returns empty array when userIds array is empty', async () => {
    const user1 = await createTestUser();
    const user2 = await createTestUser();
    const group = await createGroupConversation(user1._id, [user2._id], 'Empty Array Check Group');

    const added = await addParticipantsToConversation(group._id, []);

    expect(added).toEqual([]);
  });
});

describe('getConversationDetails service', () => {
  it('returns direct conversation details with other participant full name as display name and sorted participants', async () => {
    const user1 = await createTestUser({ firstName: 'Bob', lastName: 'Builder' });
    const user2 = await createTestUser({ firstName: 'Alice', lastName: 'Smith' });

    const directResult = await createDirectConversation(user1._id, user2._id);
    const conversationId = directResult.conversation._id;

    const detailsForUser1 = await getConversationDetails(conversationId, user1._id);
    expect(detailsForUser1).not.toBeNull();
    expect(detailsForUser1?._id.toString()).toBe(conversationId.toString());
    expect(detailsForUser1?.type).toBe(ConversationType.DIRECT);
    expect(detailsForUser1?.displayName).toBe('Alice Smith');

    const detailsForUser2 = await getConversationDetails(conversationId, user2._id);
    expect(detailsForUser2).not.toBeNull();
    expect(detailsForUser2?._id.toString()).toBe(conversationId.toString());
    expect(detailsForUser2?.type).toBe(ConversationType.DIRECT);
    expect(detailsForUser2?.displayName).toBe('Bob Builder');

    expect(detailsForUser1?.participants).toHaveLength(2);
    expect(detailsForUser1?.participants[0]._id.toString()).toBe(user2._id.toString());
    expect(detailsForUser1?.participants[0].firstName).toBe('Alice');
    expect(detailsForUser1?.participants[0].lastName).toBe('Smith');
    expect(detailsForUser1?.participants[1]._id.toString()).toBe(user1._id.toString());
    expect(detailsForUser1?.participants[1].firstName).toBe('Bob');
    expect(detailsForUser1?.participants[1].lastName).toBe('Builder');
  });

  it('returns group conversation details with group title as display name and sorted participants', async () => {
    const user1 = await createTestUser({ firstName: 'Charlie', lastName: 'Delta' });
    const user2 = await createTestUser({ firstName: 'Alice', lastName: 'Zeta' });
    const user3 = await createTestUser({ firstName: 'Bob', lastName: 'Alpha' });
    const groupTitle = 'Algorithms Study Group';

    const group = await createGroupConversation(user1._id, [user2._id, user3._id], groupTitle);

    const details = await getConversationDetails(group._id, user1._id);
    expect(details).not.toBeNull();
    expect(details?._id.toString()).toBe(group._id.toString());
    expect(details?.type).toBe(ConversationType.GROUP);
    expect(details?.title).toBe(groupTitle);
    expect(details?.displayName).toBe(groupTitle);

    expect(details?.participants).toHaveLength(3);
    expect(details?.participants[0].firstName).toBe('Alice');
    expect(details?.participants[0].lastName).toBe('Zeta');
    expect(details?.participants[1].firstName).toBe('Bob');
    expect(details?.participants[1].lastName).toBe('Alpha');
    expect(details?.participants[2].firstName).toBe('Charlie');
    expect(details?.participants[2].lastName).toBe('Delta');
  });

  it('returns channel conversation details with channel title as display name and sorted participants', async () => {
    const proposer = await createTestUser({ firstName: 'Peter', lastName: 'Proposer' });
    const user1 = await createTestUser({ firstName: 'Brenda', lastName: 'Beta' });
    const user2 = await createTestUser({ firstName: 'Arthur', lastName: 'Archer' });
    const club = await createTestClub(proposer._id);
    const channelTitle = 'announcements';

    const channel = await createChannel(club._id, channelTitle, [user1._id, user2._id]);

    const details = await getConversationDetails(channel._id, user1._id);
    expect(details).not.toBeNull();
    expect(details?._id.toString()).toBe(channel._id.toString());
    expect(details?.type).toBe(ConversationType.CHANNEL);
    expect(details?.title).toBe(channelTitle);
    expect(details?.displayName).toBe(channelTitle);
    expect(details?.clubId?.toString()).toBe(club._id.toString());

    expect(details?.participants).toHaveLength(2);
    expect(details?.participants[0].firstName).toBe('Arthur');
    expect(details?.participants[0].lastName).toBe('Archer');
    expect(details?.participants[1].firstName).toBe('Brenda');
    expect(details?.participants[1].lastName).toBe('Beta');
  });

  it('returns null when requesting user is not a participant in the conversation', async () => {
    const user1 = await createTestUser();
    const user2 = await createTestUser();
    const nonParticipant = await createTestUser();

    const group = await createGroupConversation(user1._id, [user2._id], 'Private Study');

    const result = await getConversationDetails(group._id, nonParticipant._id);
    expect(result).toBeNull();
  });

  it('returns null when conversation does not exist', async () => {
    const user1 = await createTestUser();
    const nonExistentId = new Types.ObjectId();

    const result = await getConversationDetails(nonExistentId, user1._id);
    expect(result).toBeNull();
  });

  it('throws validation error when conversationId is invalid or missing', async () => {
    const user1 = await createTestUser();

    await expect(
      getConversationDetails(null as unknown as Types.ObjectId, user1._id)
    ).rejects.toThrow('Valid conversationId is required');

    await expect(
      getConversationDetails(undefined as unknown as Types.ObjectId, user1._id)
    ).rejects.toThrow('Valid conversationId is required');

    await expect(
      getConversationDetails('invalid-id' as unknown as Types.ObjectId, user1._id)
    ).rejects.toThrow('Valid conversationId is required');
  });

  it('throws validation error when requestingUserId is invalid or missing', async () => {
    const user1 = await createTestUser();
    const user2 = await createTestUser();
    const direct = await createDirectConversation(user1._id, user2._id);
    const conversationId = direct.conversation._id;

    await expect(
      getConversationDetails(conversationId, null as unknown as Types.ObjectId)
    ).rejects.toThrow('Valid requestingUserId is required');

    await expect(
      getConversationDetails(conversationId, undefined as unknown as Types.ObjectId)
    ).rejects.toThrow('Valid requestingUserId is required');

    await expect(
      getConversationDetails(conversationId, 'invalid-id' as unknown as Types.ObjectId)
    ).rejects.toThrow('Valid requestingUserId is required');
  });

  it('returns plain objects without timestamps or Mongoose document methods', async () => {
    const user1 = await createTestUser({ firstName: 'First', lastName: 'User' });
    const user2 = await createTestUser({ firstName: 'Second', lastName: 'User' });

    const direct = await createDirectConversation(user1._id, user2._id);
    const conversationId = direct.conversation._id;

    const details = await getConversationDetails(conversationId, user1._id);
    expect(details).not.toBeNull();

    expect((details as any).save).toBeUndefined();
    expect((details as any).toObject).toBeUndefined();
    expect((details as any).createdAt).toBeUndefined();
    expect((details as any).updatedAt).toBeUndefined();

    expect(details?.participants).toHaveLength(2);
    for (const participant of details!.participants) {
      expect(participant._id).toBeDefined();
      expect(participant.firstName).toBeDefined();
      expect(participant.lastName).toBeDefined();
      expect((participant as any).save).toBeUndefined();
      expect((participant as any).toObject).toBeUndefined();
      expect((participant as any).createdAt).toBeUndefined();
      expect((participant as any).updatedAt).toBeUndefined();
      expect((participant as any).joinedAt).toBeUndefined();
      const keys = Object.keys(participant).sort();
      expect(keys).toEqual(['_id', 'firstName', 'lastName']);
    }
  });
});

describe('updateConversationTitle service', () => {
  it('updates group conversation title when requested by a participant', async () => {
    const user1 = await createTestUser({
      firstName: 'Marston',
      lastName: 'Dweller',
      email: 'basement.coder@ufl.edu',
    });
    const user2 = await createTestUser({
      firstName: 'Newell',
      lastName: 'Nightowl',
      email: 'newell3am@ufl.edu',
    });

    const group = await createGroupConversation(user1._id, [user2._id], 'Marston Basement Study Group');
    const updated = await updateConversationTitle(group._id, user1._id, 'Turlington Plaza Frisbee');

    expect(updated.title).toBe('Turlington Plaza Frisbee');
    const fromDb = await Conversation.findById(group._id).lean();
    expect(fromDb?.title).toBe('Turlington Plaza Frisbee');
  });

  it('trims whitespace from new conversation title', async () => {
    const user1 = await createTestUser();
    const user2 = await createTestUser();

    const group = await createGroupConversation(user1._id, [user2._id], 'Marston Basement Study Group');
    const updated = await updateConversationTitle(group._id, user1._id, '   Trimmed Title   ');

    expect(updated.title).toBe('Trimmed Title');
  });

  it('updates channel title when requested by a channel participant', async () => {
    const proposer = await createTestUser();
    const user1 = await createTestUser();
    const club = await createTestClub(proposer._id);
    const channel = await createChannel(club._id, 'announcements', [user1._id]);

    const updated = await updateConversationTitle(channel._id, user1._id, 'general');

    expect(updated.title).toBe('general');
    const fromDb = await Conversation.findById(channel._id).lean();
    expect(fromDb?.title).toBe('general');
  });

  it('rejects updating title of a direct conversation', async () => {
    const user1 = await createTestUser();
    const user2 = await createTestUser();
    const direct = await createDirectConversation(user1._id, user2._id);

    await expect(
      updateConversationTitle(direct.conversation._id, user1._id, 'New Title')
    ).rejects.toThrow('Cannot update title of a direct conversation');
  });

  it('rejects when requesting user is not a participant in the conversation', async () => {
    const user1 = await createTestUser();
    const user2 = await createTestUser();
    const nonParticipant = await createTestUser({
      firstName: 'Potato',
      lastName: 'Sculpture',
      email: 'french_fries_monument@ufl.edu',
    });

    const group = await createGroupConversation(user1._id, [user2._id], 'Marston Basement Study Group');

    await expect(
      updateConversationTitle(group._id, nonParticipant._id, 'Hacked Title')
    ).rejects.toThrow('User is not a participant in this conversation');
  });

  it('throws validation error on invalid parameters or duplicate channel title', async () => {
    const user1 = await createTestUser();
    const proposer = await createTestUser();
    const club = await createTestClub(proposer._id);
    const channel1 = await createChannel(club._id, 'announcements', [user1._id]);
    await createChannel(club._id, 'general', [user1._id]);

    await expect(
      updateConversationTitle(null as unknown as Types.ObjectId, user1._id, 'New Title')
    ).rejects.toThrow('Valid conversationId is required');

    await expect(
      updateConversationTitle(channel1._id, null as unknown as Types.ObjectId, 'New Title')
    ).rejects.toThrow('Valid requestingUserId is required');

    await expect(
      updateConversationTitle(channel1._id, user1._id, '   ')
    ).rejects.toThrow('Valid conversation title is required');

    await expect(
      updateConversationTitle(channel1._id, user1._id, 'general')
    ).rejects.toThrow('A channel with this title already exists in the club');
  });
});

describe('removeParticipantFromConversation and leaveConversation services', () => {
  it('removes target participant from group conversation when requested by a member', async () => {
    const user1 = await createTestUser({
      firstName: 'Dennis',
      lastName: 'Heckler',
      email: 'turlington_screamer@ufl.edu',
    });
    const user2 = await createTestUser({
      firstName: 'Midtown',
      lastName: 'Survivor',
      email: 'gator_beverage@ufl.edu',
    });
    const user3 = await createTestUser({
      firstName: 'Reitz',
      lastName: 'FoodCourter',
      email: 'subway_line_eternal@ufl.edu',
    });

    const group = await createGroupConversation(
      user1._id,
      [user2._id, user3._id],
      'French Fries Monument Preservation Society'
    );
    const result = await removeParticipantFromConversation(group._id, user1._id, user2._id);

    expect(result).toBe(true);

    const isUser2StillParticipant = await isUserParticipant(group._id, user2._id);
    expect(isUser2StillParticipant).toBe(false);

    const isUser1StillParticipant = await isUserParticipant(group._id, user1._id);
    expect(isUser1StillParticipant).toBe(true);

    const isUser3StillParticipant = await isUserParticipant(group._id, user3._id);
    expect(isUser3StillParticipant).toBe(true);
  });

  it('removes requesting user when calling leaveConversation', async () => {
    const user1 = await createTestUser({
      firstName: 'Dennis',
      lastName: 'Heckler',
      email: 'turlington_screamer@ufl.edu',
    });
    const user2 = await createTestUser({
      firstName: 'Midtown',
      lastName: 'Survivor',
      email: 'gator_beverage@ufl.edu',
    });

    const group = await createGroupConversation(
      user1._id,
      [user2._id],
      'Marston Basement Study Group'
    );
    const result = await leaveConversation(group._id, user1._id);

    expect(result).toBe(true);

    const isUser1StillParticipant = await isUserParticipant(group._id, user1._id);
    expect(isUser1StillParticipant).toBe(false);

    const isUser2StillParticipant = await isUserParticipant(group._id, user2._id);
    expect(isUser2StillParticipant).toBe(true);
  });

  it('retains conversation document when the last participant leaves', async () => {
    const user1 = await createTestUser();
    const user2 = await createTestUser();

    const group = await createGroupConversation(
      user1._id,
      [user2._id],
      'Marston Basement Study Group'
    );
    await leaveConversation(group._id, user1._id);
    await leaveConversation(group._id, user2._id);

    const remainingParticipants = await getConversationParticipants(group._id);
    expect(remainingParticipants).toHaveLength(0);

    const conversationInDb = await Conversation.findById(group._id).lean();
    expect(conversationInDb).not.toBeNull();
    expect(conversationInDb?._id.toString()).toBe(group._id.toString());
  });

  it('rejects removing participant from a direct conversation', async () => {
    const user1 = await createTestUser();
    const user2 = await createTestUser();
    const direct = await createDirectConversation(user1._id, user2._id);

    await expect(
      removeParticipantFromConversation(direct.conversation._id, user1._id, user2._id)
    ).rejects.toThrow('Cannot remove participants from a direct conversation');
  });

  it('rejects when requesting user is not a participant in the conversation', async () => {
    const user1 = await createTestUser();
    const user2 = await createTestUser();
    const nonMember = await createTestUser();

    const group = await createGroupConversation(
      user1._id,
      [user2._id],
      'Marston Basement Study Group'
    );

    await expect(
      removeParticipantFromConversation(group._id, nonMember._id, user2._id)
    ).rejects.toThrow('User is not a participant in this conversation');
  });

  it('rejects when target user is not a participant in the conversation', async () => {
    const user1 = await createTestUser();
    const user2 = await createTestUser();
    const outsider = await createTestUser();

    const group = await createGroupConversation(
      user1._id,
      [user2._id],
      'Marston Basement Study Group'
    );

    await expect(
      removeParticipantFromConversation(group._id, user1._id, outsider._id)
    ).rejects.toThrow('Target user is not a participant in this conversation');
  });

  it('throws validation error on missing or invalid parameters', async () => {
    const user1 = await createTestUser();
    const user2 = await createTestUser();
    const group = await createGroupConversation(
      user1._id,
      [user2._id],
      'Marston Basement Study Group'
    );
    const fakeId = new Types.ObjectId();

    await expect(
      removeParticipantFromConversation(null as unknown as Types.ObjectId, user1._id, user2._id)
    ).rejects.toThrow('Valid conversationId is required');

    await expect(
      removeParticipantFromConversation(group._id, null as unknown as Types.ObjectId, user2._id)
    ).rejects.toThrow('Valid requestingUserId is required');

    await expect(
      removeParticipantFromConversation(group._id, user1._id, null as unknown as Types.ObjectId)
    ).rejects.toThrow('Valid targetUserId is required');

    await expect(
      removeParticipantFromConversation(fakeId, user1._id, user2._id)
    ).rejects.toThrow('Conversation not found');

    await expect(
      leaveConversation(null as unknown as Types.ObjectId, user1._id)
    ).rejects.toThrow('Valid conversationId is required');

    await expect(
      leaveConversation(group._id, null as unknown as Types.ObjectId)
    ).rejects.toThrow('Valid userId is required');
  });
});


