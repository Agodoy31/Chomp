// See Issue #98: https://github.com/Agodoy31/Chomp/issues/98
// See Issue #100: https://github.com/Agodoy31/Chomp/issues/100
import { describe, it, expect, beforeAll, afterEach, afterAll, jest } from '@jest/globals';
import { Types } from 'mongoose';
import { connectTestDb, clearTestDb, closeTestDb } from '../../helpers/db';
import { Conversation } from '../../../src/messaging/models/Conversation';
import { ConversationParticipant } from '../../../src/messaging/models/ConversationParticipant';
import { ConversationType } from '../../../src/messaging/interfaces/conversation.interfaces';
import {
  DEFAULT_GROUP_CONVERSATION_TITLE,
  createDirectConversation,
  createGroupConversation,
  getConversationById,
  getConversationDocumentById,
} from '../../../src/messaging/services/conversation.service';

beforeAll(async () => {
  await connectTestDb();
  await Promise.all([Conversation.init(), ConversationParticipant.init()]);
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
    const user1 = new Types.ObjectId();
    const user2 = new Types.ObjectId();
    const expectedDmPairKey = [user1.toString(), user2.toString()].sort().join(':');

    const result = await createDirectConversation(user1, user2);

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
    expect(participantUserIds).toContain(user1.toString());
    expect(participantUserIds).toContain(user2.toString());
  });

  it('returns existing conversation with isNew set to false when called again', async () => {
    const user1 = new Types.ObjectId();
    const user2 = new Types.ObjectId();

    const firstResult = await createDirectConversation(user1, user2);
    expect(firstResult.isNew).toBe(true);

    const secondResult = await createDirectConversation(user1, user2);
    expect(secondResult.isNew).toBe(false);
    expect(secondResult.conversation._id.toString()).toBe(firstResult.conversation._id.toString());
    expect(secondResult.conversation.dmPairKey).toBe(firstResult.conversation.dmPairKey);

    const participants = await ConversationParticipant.find({
      conversationId: firstResult.conversation._id,
    }).lean().exec();
    expect(participants).toHaveLength(2);
  });

  it('returns identical conversation regardless of argument order userA userB vs userB userA', async () => {
    const userA = new Types.ObjectId();
    const userB = new Types.ObjectId();

    const firstResult = await createDirectConversation(userA, userB);
    expect(firstResult.isNew).toBe(true);

    const secondResult = await createDirectConversation(userB, userA);
    expect(secondResult.isNew).toBe(false);
    expect(secondResult.conversation._id.toString()).toBe(firstResult.conversation._id.toString());
    expect(secondResult.conversation.dmPairKey).toBe(firstResult.conversation.dmPairKey);
  });

  it('throws error when creatorId and recipientId are identical', async () => {
    const user = new Types.ObjectId();

    await expect(createDirectConversation(user, user)).rejects.toThrow(
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
    const user1 = new Types.ObjectId();
    const user2 = new Types.ObjectId();
    const dmPairKey = [user1.toString(), user2.toString()].sort().join(':');

    const winner = await Conversation.create({
      type: ConversationType.DIRECT,
      dmPairKey,
    });
    await ConversationParticipant.create([
      { conversationId: winner._id, userId: user1 },
      { conversationId: winner._id, userId: user2 },
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

    const result = await createDirectConversation(user1, user2);

    expect(result.isNew).toBe(false);
    expect(result.conversation._id.toString()).toBe(winner._id.toString());
    expect(result.conversation.dmPairKey).toBe(dmPairKey);
  });

  it('rolls back transaction cleanly without creating orphaned conversation if participant creation fails', async () => {
    const user1 = new Types.ObjectId();
    const user2 = new Types.ObjectId();
    const dmPairKey = [user1.toString(), user2.toString()].sort().join(':');

    jest
      .spyOn(ConversationParticipant, 'create')
      .mockRejectedValueOnce(new Error('Simulated participant creation failure'));

    await expect(createDirectConversation(user1, user2)).rejects.toThrow(
      'Simulated participant creation failure'
    );

    const orphanedConversation = await Conversation.findOne({ dmPairKey }).lean().exec();
    expect(orphanedConversation).toBeNull();

    const participants = await ConversationParticipant.find({
      userId: { $in: [user1, user2] },
    }).lean().exec();
    expect(participants).toHaveLength(0);
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
    const creatorId = new Types.ObjectId();
    const user2 = new Types.ObjectId();
    const user3 = new Types.ObjectId();
    const title = 'Study Group';

    const result = await createGroupConversation(creatorId, [user2, user3], title);

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
    expect(participantUserIds).toContain(creatorId.toString());
    expect(participantUserIds).toContain(user2.toString());
    expect(participantUserIds).toContain(user3.toString());
  });

  it('trims leading and trailing whitespace from group title', async () => {
    const creatorId = new Types.ObjectId();
    const user2 = new Types.ObjectId();
    const untrimmedTitle = '  Algorithms Study Group  ';

    const result = await createGroupConversation(creatorId, [user2], untrimmedTitle);

    expect(result.title).toBe('Algorithms Study Group');

    const savedInDb = await Conversation.findById(result._id).lean().exec();
    expect(savedInDb?.title).toBe('Algorithms Study Group');
  });

  it('falls back to default title when title is undefined or omitted', async () => {
    const creatorId = new Types.ObjectId();
    const user2 = new Types.ObjectId();

    const result = await createGroupConversation(creatorId, [user2]);

    expect(result.title).toBe(DEFAULT_GROUP_CONVERSATION_TITLE);

    const savedInDb = await Conversation.findById(result._id).lean().exec();
    expect(savedInDb?.title).toBe(DEFAULT_GROUP_CONVERSATION_TITLE);
  });

  it('falls back to default title when title is empty string or whitespace only', async () => {
    const creatorId = new Types.ObjectId();
    const user2 = new Types.ObjectId();

    const emptyResult = await createGroupConversation(creatorId, [user2], '');
    expect(emptyResult.title).toBe(DEFAULT_GROUP_CONVERSATION_TITLE);

    const whitespaceResult = await createGroupConversation(creatorId, [user2], '   ');
    expect(whitespaceResult.title).toBe(DEFAULT_GROUP_CONVERSATION_TITLE);
  });

  it('automatically includes creator as participant when omitted from participant list', async () => {
    const creatorId = new Types.ObjectId();
    const user2 = new Types.ObjectId();
    const user3 = new Types.ObjectId();

    const result = await createGroupConversation(
      creatorId,
      [user2, user3],
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
    expect(participantUserIds).toContain(creatorId.toString());
  });

  it('deduplicates duplicate IDs in participant list without throwing unique index collisions', async () => {
    const creatorId = new Types.ObjectId();
    const user2 = new Types.ObjectId();
    const user3 = new Types.ObjectId();

    const result = await createGroupConversation(
      creatorId,
      [user2, user2, user3, creatorId],
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
    expect(participantUserIds).toContain(creatorId.toString());
    expect(participantUserIds).toContain(user2.toString());
    expect(participantUserIds).toContain(user3.toString());
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
    const creatorId = new Types.ObjectId();

    await expect(
      createGroupConversation(creatorId, [], 'Title')
    ).rejects.toThrow('Group conversation requires at least two distinct participants');

    await expect(
      createGroupConversation(creatorId, [creatorId], 'Title')
    ).rejects.toThrow('Group conversation requires at least two distinct participants');
  });

  it('rolls back transaction cleanly without creating orphaned conversation if participant creation fails', async () => {
    const creatorId = new Types.ObjectId();
    const user2 = new Types.ObjectId();
    const title = 'Rollback Test Group';

    jest
      .spyOn(ConversationParticipant, 'create')
      .mockRejectedValueOnce(new Error('Simulated participant creation failure'));

    await expect(
      createGroupConversation(creatorId, [user2], title)
    ).rejects.toThrow('Simulated participant creation failure');

    const orphanedConversation = await Conversation.findOne({ title }).lean().exec();
    expect(orphanedConversation).toBeNull();

    const participants = await ConversationParticipant.find({
      userId: { $in: [creatorId, user2] },
    })
      .lean()
      .exec();
    expect(participants).toHaveLength(0);
  });

  it('returns lean plain object matching IConversation interface', async () => {
    const creatorId = new Types.ObjectId();
    const user2 = new Types.ObjectId();
    const title = 'Plain Object Group';

    const result = await createGroupConversation(creatorId, [user2], title);

    expect(typeof result).toBe('object');
    expect(result).not.toBeNull();
    expect(result instanceof Conversation).toBe(false);
    expect(typeof (result as any).save).toBe('undefined');
    expect(result.type).toBe(ConversationType.GROUP);
    expect(result.title).toBe(title);
  });
});

