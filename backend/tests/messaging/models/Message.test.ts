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
    it('creates a valid message with default values', async () => {
      const conversationId = new Types.ObjectId();
      const senderId = new Types.ObjectId();
      const text = 'Hello UF Gators';

      const message = await Message.create({
        conversationId,
        senderId,
        text,
      });

      expect(message.conversationId.toString()).toBe(conversationId.toString());
      expect(message.senderId.toString()).toBe(senderId.toString());
      expect(message.text).toBe(text);
      expect(message.isAnnouncement).toBe(false);
      expect(message.removedAt).toBeUndefined();
      expect(message.removedBy).toBeUndefined();
      expect(message.createdAt).toBeInstanceOf(Date);
      expect(message.updatedAt).toBeInstanceOf(Date);
    });

    it('creates an announcement message when isAnnouncement is true', async () => {
      const conversationId = new Types.ObjectId();
      const senderId = new Types.ObjectId();

      const message = await Message.create({
        conversationId,
        senderId,
        text: 'Important general body meeting tomorrow',
        isAnnouncement: true,
      });

      expect(message.isAnnouncement).toBe(true);
    });

    it('creates a message with soft delete metadata', async () => {
      const conversationId = new Types.ObjectId();
      const senderId = new Types.ObjectId();
      const removedBy = new Types.ObjectId();
      const removedAt = new Date();

      const message = await Message.create({
        conversationId,
        senderId,
        text: 'Content marked for removal',
        removedAt,
        removedBy,
      });

      expect(message.removedAt).toEqual(removedAt);
      expect(message.removedBy?.toString()).toBe(removedBy.toString());
    });

    it('trims leading and trailing whitespace upon persistence', async () => {
      const conversationId = new Types.ObjectId();
      const senderId = new Types.ObjectId();

      const message = await Message.create({
        conversationId,
        senderId,
        text: '   Padded message body text   ',
      });

      expect(message.text).toBe('Padded message body text');
    });
  });

  describe('Validation error handling', () => {
    it('rejects creation when conversationId is missing', async () => {
      const senderId = new Types.ObjectId();

      await expect(
        Message.create({
          senderId,
          text: 'Message without conversation',
        } as any)
      ).rejects.toThrow();
    });

    it('rejects creation when senderId is missing', async () => {
      const conversationId = new Types.ObjectId();

      await expect(
        Message.create({
          conversationId,
          text: 'Message without sender',
        } as any)
      ).rejects.toThrow();
    });

    it('rejects creation when text is missing', async () => {
      const conversationId = new Types.ObjectId();
      const senderId = new Types.ObjectId();

      await expect(
        Message.create({
          conversationId,
          senderId,
        } as any)
      ).rejects.toThrow();
    });

    it('rejects creation when text is empty string', async () => {
      const conversationId = new Types.ObjectId();
      const senderId = new Types.ObjectId();

      await expect(
        Message.create({
          conversationId,
          senderId,
          text: '',
        })
      ).rejects.toThrow();
    });

    it('rejects creation when text contains only whitespace', async () => {
      const conversationId = new Types.ObjectId();
      const senderId = new Types.ObjectId();

      await expect(
        Message.create({
          conversationId,
          senderId,
          text: '     ',
        })
      ).rejects.toThrow();
    });
  });

  describe('Database index and query tests', () => {
    it('retrieves messages ordered by createdAt descending', async () => {
      const conversationId = new Types.ObjectId();
      const senderId = new Types.ObjectId();

      const firstMessage = await Message.create({
        conversationId,
        senderId,
        text: 'First message',
        createdAt: new Date('2026-01-01T10:00:00.000Z'),
      });

      const secondMessage = await Message.create({
        conversationId,
        senderId,
        text: 'Second message',
        createdAt: new Date('2026-01-01T11:00:00.000Z'),
      });

      const messages = await Message.find({ conversationId })
        .sort({ createdAt: -1 })
        .lean();

      expect(messages).toHaveLength(2);
      expect(messages[0]._id.toString()).toBe(secondMessage._id.toString());
      expect(messages[1]._id.toString()).toBe(firstMessage._id.toString());
    });

    it('isolates messages by conversationId without leaking across conversations', async () => {
      const conversationId1 = new Types.ObjectId();
      const conversationId2 = new Types.ObjectId();
      const senderId = new Types.ObjectId();

      await Message.create({
        conversationId: conversationId1,
        senderId,
        text: 'Message in room 1',
      });

      await Message.create({
        conversationId: conversationId2,
        senderId,
        text: 'Message in room 2',
      });

      const results = await Message.find({ conversationId: conversationId1 }).lean();

      expect(results).toHaveLength(1);
      expect(results[0].conversationId.toString()).toBe(conversationId1.toString());
      expect(results[0].text).toBe('Message in room 1');
    });

    it('uses id as secondary tiebreaker for messages with identical timestamps', async () => {
      const conversationId = new Types.ObjectId();
      const senderId = new Types.ObjectId();
      const identicalTime = new Date('2026-01-01T10:00:00.000Z');

      const olderId = new Types.ObjectId('650000000000000000000001');
      const newerId = new Types.ObjectId('650000000000000000000002');

      await Message.create({
        _id: olderId,
        conversationId,
        senderId,
        text: 'Older tie message',
        createdAt: identicalTime,
      });

      await Message.create({
        _id: newerId,
        conversationId,
        senderId,
        text: 'Newer tie message',
        createdAt: identicalTime,
      });

      const messages = await Message.find({ conversationId })
        .sort({ createdAt: -1, _id: -1 })
        .lean();

      expect(messages).toHaveLength(2);
      expect(messages[0]._id.toString()).toBe(newerId.toString());
      expect(messages[1]._id.toString()).toBe(olderId.toString());
    });
  });
});
