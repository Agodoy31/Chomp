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
    it('creates DIRECT GROUP and CHANNEL conversations with type-specific attributes', async () => {
      const direct = await Conversation.create({
        type: ConversationType.DIRECT,
        dmPairKey: 'user1:user2',
      });
      expect(direct.type).toBe(ConversationType.DIRECT);
      expect(direct.dmPairKey).toBe('user1:user2');
      expect(direct.createdAt).toBeInstanceOf(Date);

      const group = await Conversation.create({
        type: ConversationType.GROUP,
        title: 'Chicken Tender Thursday Enthusiasts',
      });
      expect(group.type).toBe(ConversationType.GROUP);
      expect(group.title).toBe('Chicken Tender Thursday Enthusiasts');

      const clubId = new Types.ObjectId();
      const channel = await Conversation.create({
        type: ConversationType.CHANNEL,
        clubId,
        title: 'announcements',
      });
      expect(channel.type).toBe(ConversationType.CHANNEL);
      expect(channel.clubId?.toString()).toBe(clubId.toString());
      expect(channel.title).toBe('announcements');
    });
  });

  describe('Validation error handling', () => {
    it('rejects conversation when type is missing or invalid', async () => {
      await expect(Conversation.create({} as any)).rejects.toThrow();
      await expect(Conversation.create({ type: 'INVALID_TYPE' } as any)).rejects.toThrow();
    });

    it('enforces DIRECT conversation invariants on dmPairKey title and clubId', async () => {
      await expect(
        Conversation.create({ type: ConversationType.DIRECT })
      ).rejects.toThrow();

      await expect(
        Conversation.create({ type: ConversationType.DIRECT, dmPairKey: '   ' })
      ).rejects.toThrow();

      await expect(
        Conversation.create({
          type: ConversationType.DIRECT,
          dmPairKey: 'user1:user2',
          title: 'Direct Chat',
        })
      ).rejects.toThrow();

      await expect(
        Conversation.create({
          type: ConversationType.DIRECT,
          dmPairKey: 'user1:user2',
          clubId: new Types.ObjectId(),
        })
      ).rejects.toThrow();
    });

    it('enforces GROUP conversation invariants on title dmPairKey and clubId', async () => {
      await expect(
        Conversation.create({ type: ConversationType.GROUP })
      ).rejects.toThrow();

      await expect(
        Conversation.create({ type: ConversationType.GROUP, title: '   ' })
      ).rejects.toThrow();

      await expect(
        Conversation.create({
          type: ConversationType.GROUP,
          title: 'Study Group',
          dmPairKey: 'user1:user2',
        })
      ).rejects.toThrow();

      await expect(
        Conversation.create({
          type: ConversationType.GROUP,
          title: 'Study Group',
          clubId: new Types.ObjectId(),
        })
      ).rejects.toThrow();
    });

    it('enforces CHANNEL conversation invariants on clubId title and dmPairKey', async () => {
      const clubId = new Types.ObjectId();

      await expect(
        Conversation.create({ type: ConversationType.CHANNEL, clubId })
      ).rejects.toThrow();

      await expect(
        Conversation.create({ type: ConversationType.CHANNEL, title: 'announcements' })
      ).rejects.toThrow();

      await expect(
        Conversation.create({
          type: ConversationType.CHANNEL,
          clubId,
          title: 'announcements',
          dmPairKey: 'user1:user2',
        })
      ).rejects.toThrow();
    });
  });

  describe('Database indexes and uniqueness constraints', () => {
    it('enforces uniqueness for DIRECT dmPairKey and case-insensitive CHANNEL titles in clubs', async () => {
      await Conversation.create({
        type: ConversationType.DIRECT,
        dmPairKey: 'user1:user2',
      });
      await expect(
        Conversation.create({
          type: ConversationType.DIRECT,
          dmPairKey: 'user1:user2',
        })
      ).rejects.toThrow();

      const clubId1 = new Types.ObjectId();
      const clubId2 = new Types.ObjectId();

      await Conversation.create({
        type: ConversationType.CHANNEL,
        clubId: clubId1,
        title: 'general',
      });
      await expect(
        Conversation.create({
          type: ConversationType.CHANNEL,
          clubId: clubId1,
          title: 'General',
        })
      ).rejects.toThrow();

      const convInOtherClub = await Conversation.create({
        type: ConversationType.CHANNEL,
        clubId: clubId2,
        title: 'general',
      });
      expect(convInOtherClub._id).toBeDefined();
    });
  });
});
