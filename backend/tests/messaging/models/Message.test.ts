import { describe, it, expect, beforeAll, afterEach, afterAll } from '@jest/globals';
import { Types } from 'mongoose';
import { connectTestDb, clearTestDb, closeTestDb } from '../../helpers/db';
import { Message } from '../../../src/messaging/models/Message';

describe('Message Model', () => {
  beforeAll(async () => {
    await connectTestDb();
    await Message.init();
  }, 60000);

  afterEach(async () => {
    await clearTestDb();
  });

  afterAll(async () => {
    await closeTestDb();
  });

  describe('Happy path message creation', () => {
    it('creates message with trimmed text announcement flag and soft delete metadata', async () => {
      const conversationId = new Types.ObjectId();
      const senderId = new Types.ObjectId();
      const removedBy = new Types.ObjectId();
      const removedAt = new Date();

      const message = await Message.create({
        conversationId,
        senderId,
        text: '   Important general body meeting tomorrow   ',
        isAnnouncement: true,
        removedAt,
        removedBy,
      });

      expect(message.conversationId.toString()).toBe(conversationId.toString());
      expect(message.senderId.toString()).toBe(senderId.toString());
      expect(message.text).toBe('Important general body meeting tomorrow');
      expect(message.isAnnouncement).toBe(true);
      expect(message.removedAt).toEqual(removedAt);
      expect(message.removedBy?.toString()).toBe(removedBy.toString());
      expect(message.createdAt).toBeInstanceOf(Date);
      expect(message.updatedAt).toBeInstanceOf(Date);
    });
  });

  describe('Validation error handling', () => {
    it('rejects creation when required fields are missing or text is empty', async () => {
      const validId = new Types.ObjectId();

      await expect(
        Message.create({ senderId: validId, text: 'Hello' } as any)
      ).rejects.toThrow();

      await expect(
        Message.create({ conversationId: validId, text: 'Hello' } as any)
      ).rejects.toThrow();

      await expect(
        Message.create({ conversationId: validId, senderId: validId } as any)
      ).rejects.toThrow();

      await expect(
        Message.create({ conversationId: validId, senderId: validId, text: '   ' })
      ).rejects.toThrow();
    });
  });

  describe('Client ID and deduplication index', () => {
    it('enforces scoped uniqueness on clientId per conversation and allows null duplicates', async () => {
      const conv1 = new Types.ObjectId();
      const conv2 = new Types.ObjectId();
      const senderId = new Types.ObjectId();
      const handle = 'client-uuid-12345';

      const first = await Message.create({
        conversationId: conv1,
        senderId,
        text: 'Initial delivery',
        clientId: handle,
      });
      expect(first.clientId).toBe(handle);

      await expect(
        Message.create({
          conversationId: conv1,
          senderId,
          text: 'Duplicate delivery attempt',
          clientId: handle,
        })
      ).rejects.toThrow();

      const inOtherConv = await Message.create({
        conversationId: conv2,
        senderId,
        text: 'Different conversation',
        clientId: handle,
      });
      expect(inOtherConv.clientId).toBe(handle);

      const msgWithoutClient1 = await Message.create({
        conversationId: conv1,
        senderId,
        text: 'First without handle',
      });
      const msgWithoutClient2 = await Message.create({
        conversationId: conv1,
        senderId,
        text: 'Second without handle',
      });

      expect(msgWithoutClient1._id).toBeDefined();
      expect(msgWithoutClient2._id).toBeDefined();
    });
  });
});
