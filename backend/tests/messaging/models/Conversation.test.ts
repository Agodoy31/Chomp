import { describe, it, expect, beforeAll, afterEach, afterAll } from '@jest/globals';
import { Types } from 'mongoose';
import { connectTestDb, clearTestDb, closeTestDb } from '../../helpers/db';
import {
  Conversation,
  ConversationType,
} from '../../../src/messaging/models/Conversation';

describe('Conversation Model', () => {
  beforeAll(async () => {
    await connectTestDb();
    await Conversation.init();
  }, 60000);

  afterEach(async () => {
    await clearTestDb();
  });

  afterAll(async () => {
    await closeTestDb();
  });

  describe('Happy path conversation creation', () => {
    it('creates a DIRECT conversation with dmPairKey', async () => {
      const conv = await Conversation.create({
        type: ConversationType.DIRECT,
        dmPairKey: 'user1:user2',
      });

      expect(conv.type).toBe(ConversationType.DIRECT);
      expect(conv.dmPairKey).toBe('user1:user2');
      expect(conv.title).toBeUndefined();
      expect(conv.clubId).toBeUndefined();
      expect(conv.createdAt).toBeInstanceOf(Date);
      expect(conv.updatedAt).toBeInstanceOf(Date);
    });


    it('creates a GROUP conversation with title', async () => {
      const conv = await Conversation.create({
        type: ConversationType.GROUP,
        title: 'Study Group',
      });

      expect(conv.type).toBe(ConversationType.GROUP);
      expect(conv.title).toBe('Study Group');
      expect(conv.dmPairKey).toBeUndefined();
      expect(conv.clubId).toBeUndefined();
    });

    it('creates a CHANNEL conversation with clubId and title', async () => {
      const clubId = new Types.ObjectId();
      const conv = await Conversation.create({
        type: ConversationType.CHANNEL,
        clubId,
        title: 'announcements',
      });

      expect(conv.type).toBe(ConversationType.CHANNEL);
      expect(conv.clubId?.toString()).toBe(clubId.toString());
      expect(conv.title).toBe('announcements');
      expect(conv.dmPairKey).toBeUndefined();
    });
  });

  describe('Validation error handling', () => {
    it('rejects conversation when type is missing', async () => {
      await expect(Conversation.create({} as any)).rejects.toThrow();
    });

    it('rejects conversation when type is an invalid string', async () => {
      await expect(
        Conversation.create({
          type: 'INVALID_TYPE',
        } as any)
      ).rejects.toThrow();
    });

    it('rejects DIRECT conversation when dmPairKey is missing', async () => {
      await expect(
        Conversation.create({
          type: ConversationType.DIRECT,
        })
      ).rejects.toThrow();
    });

    it('rejects DIRECT conversation when dmPairKey is empty string or only whitespace', async () => {
      await expect(
        Conversation.create({
          type: ConversationType.DIRECT,
          dmPairKey: '',
        })
      ).rejects.toThrow();

      await expect(
        Conversation.create({
          type: ConversationType.DIRECT,
          dmPairKey: '   ',
        })
      ).rejects.toThrow();
    });

    it('rejects DIRECT conversation when title is supplied', async () => {
      await expect(
        Conversation.create({
          type: ConversationType.DIRECT,
          dmPairKey: 'user1:user2',
          title: 'Direct Chat',
        })
      ).rejects.toThrow();
    });

    it('rejects DIRECT conversation when clubId is supplied', async () => {
      await expect(
        Conversation.create({
          type: ConversationType.DIRECT,
          dmPairKey: 'user1:user2',
          clubId: new Types.ObjectId(),
        })
      ).rejects.toThrow();
    });

    it('rejects GROUP conversation when title is missing or only whitespace', async () => {
      await expect(
        Conversation.create({
          type: ConversationType.GROUP,
        })
      ).rejects.toThrow();

      await expect(
        Conversation.create({
          type: ConversationType.GROUP,
          title: '',
        })
      ).rejects.toThrow();

      await expect(
        Conversation.create({
          type: ConversationType.GROUP,
          title: '   ',
        })
      ).rejects.toThrow();
    });

    it('rejects GROUP conversation when dmPairKey is supplied', async () => {
      await expect(
        Conversation.create({
          type: ConversationType.GROUP,
          title: 'Study Group',
          dmPairKey: 'user1:user2',
        })
      ).rejects.toThrow();
    });

    it('rejects GROUP conversation when clubId is supplied', async () => {
      await expect(
        Conversation.create({
          type: ConversationType.GROUP,
          title: 'Study Group',
          clubId: new Types.ObjectId(),
        })
      ).rejects.toThrow();
    });

    it('rejects CHANNEL conversation when title is missing or only whitespace', async () => {
      const clubId = new Types.ObjectId();
      await expect(
        Conversation.create({
          type: ConversationType.CHANNEL,
          clubId,
        })
      ).rejects.toThrow();

      await expect(
        Conversation.create({
          type: ConversationType.CHANNEL,
          clubId,
          title: '   ',
        })
      ).rejects.toThrow();
    });

    it('rejects CHANNEL conversation when clubId is missing', async () => {
      await expect(
        Conversation.create({
          type: ConversationType.CHANNEL,
          title: 'announcements',
        })
      ).rejects.toThrow();
    });

    it('rejects CHANNEL conversation when dmPairKey is supplied', async () => {
      await expect(
        Conversation.create({
          type: ConversationType.CHANNEL,
          clubId: new Types.ObjectId(),
          title: 'announcements',
          dmPairKey: 'user1:user2',
        })
      ).rejects.toThrow();
    });
  });

  describe('Database indexes and uniqueness constraints', () => {
    it('throws duplicate key error 11000 on duplicate dmPairKey for DIRECT conversations', async () => {
      await Conversation.create({
        type: ConversationType.DIRECT,
        dmPairKey: 'user1:user2',
      });

      let duplicateError: any;
      try {
        await Conversation.create({
          type: ConversationType.DIRECT,
          dmPairKey: 'user1:user2',
        });
      } catch (err) {
        duplicateError = err;
      }

      expect(duplicateError).toBeDefined();
      expect(duplicateError.code).toBe(11000);
    });

    it('throws duplicate key error 11000 on case-insensitive duplicate title for CHANNEL conversations in same club', async () => {
      const clubId = new Types.ObjectId();
      await Conversation.create({
        type: ConversationType.CHANNEL,
        clubId,
        title: 'general',
      });

      let duplicateError: any;
      try {
        await Conversation.create({
          type: ConversationType.CHANNEL,
          clubId,
          title: 'General',
        });
      } catch (err) {
        duplicateError = err;
      }

      expect(duplicateError).toBeDefined();
      expect(duplicateError.code).toBe(11000);
    });

    it('allows identical channel title across different clubs without conflict', async () => {
      const clubId1 = new Types.ObjectId();
      const clubId2 = new Types.ObjectId();

      const conv1 = await Conversation.create({
        type: ConversationType.CHANNEL,
        clubId: clubId1,
        title: 'general',
      });

      const conv2 = await Conversation.create({
        type: ConversationType.CHANNEL,
        clubId: clubId2,
        title: 'general',
      });

      expect(conv1._id).toBeDefined();
      expect(conv2._id).toBeDefined();
      expect(conv1._id.toString()).not.toBe(conv2._id.toString());
    });
  });
});
