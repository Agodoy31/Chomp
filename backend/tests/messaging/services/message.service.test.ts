import { describe, it, expect, beforeAll, afterEach, afterAll } from '@jest/globals';
import { Types } from 'mongoose';
import { connectTestDb, clearTestDb, closeTestDb } from '../../helpers/db';
import { User } from '../../../src/user/models/User';
import { Message } from '../../../src/messaging/models/Message';
import { Conversation, ConversationType } from '../../../src/messaging/models/Conversation';
import { ConversationParticipant, ParticipantPermission } from '../../../src/messaging/models/ConversationParticipant';
import { sendMessage, getMessages, deleteMessage } from '../../../src/messaging/services/message.service';
import { createTestUser } from './conversationTestUtils';

const ufFixtures = {
  lakeAliceBasker: {
    name: 'LakeAlice Basker',
    email: 'turtle_watcher@ufl.edu',
  },
  timTebow: {
    name: 'Tim Tebow',
    email: 'ttebow15@ufl.edu',
  },
  albertGator: {
    name: 'Albert Gator',
    email: 'albert@ufl.edu',
  },
};

beforeAll(async () => {
  await connectTestDb();
  await User.init();
  await Conversation.init();
  await ConversationParticipant.init();
  await Message.init();
}, 60000);

afterEach(async () => {
  await clearTestDb();
});

afterAll(async () => {
  await closeTestDb();
});

describe('sendMessage service', () => {
  it('creates and returns plain message object when sender has write permission', async () => {
    const conversation = await Conversation.create({
      type: ConversationType.GROUP,
      title: 'Turlington Plaza Frisbee',
    });
    const senderUser = await createTestUser({
      firstName: 'LakeAlice',
      lastName: 'Basker',
      email: ufFixtures.lakeAliceBasker.email,
    });
    const senderId = senderUser._id;
    await ConversationParticipant.create({
      conversationId: conversation._id,
      userId: senderId,
      permission: ParticipantPermission.WRITE,
    });

    const result = await sendMessage(
      conversation._id,
      senderId,
      `Meeting at Century Tower with ${ufFixtures.lakeAliceBasker.name} at ${ufFixtures.lakeAliceBasker.email}`
    );

    expect(result.isNew).toBe(true);
    expect(result.message.conversationId.toString()).toBe(conversation._id.toString());
    expect(result.message.sender._id.toString()).toBe(senderId.toString());
    expect(result.message.sender.firstName).toBe('LakeAlice');
    expect(result.message.sender.lastName).toBe('Basker');
    expect((result.message as unknown as Record<string, unknown>).senderId).toBeUndefined();
    expect(result.message.text).toBe(
      `Meeting at Century Tower with ${ufFixtures.lakeAliceBasker.name} at ${ufFixtures.lakeAliceBasker.email}`
    );
    expect(result.message.isAnnouncement).toBe(false);
    expect(result.message.isSystem).toBe(false);
    expect((result.message as unknown as Record<string, unknown>).save).toBeUndefined();
    expect((result.message as unknown as Record<string, unknown>).$isDefault).toBeUndefined();
  });

  it('returns existing message without duplicate error when duplicate client id is sent', async () => {
    const conversation = await Conversation.create({
      type: ConversationType.GROUP,
      title: 'Gator Corner Soft Serve Repair Crew',
    });
    const senderUser = await createTestUser({
      firstName: 'Tim',
      lastName: 'Tebow',
      email: ufFixtures.timTebow.email,
    });
    const senderId = senderUser._id;
    await ConversationParticipant.create({
      conversationId: conversation._id,
      userId: senderId,
      permission: ParticipantPermission.WRITE,
    });

    const clientId = '0192d193-4a6c-7def-8123-0123456789ab';
    const firstCall = await sendMessage(
      conversation._id,
      senderId,
      `First submission from ${ufFixtures.timTebow.name} at ${ufFixtures.timTebow.email}`,
      clientId
    );
    const secondCall = await sendMessage(
      conversation._id,
      senderId,
      'Duplicate submission with altered text',
      clientId
    );

    expect(firstCall.isNew).toBe(true);
    expect(secondCall.isNew).toBe(false);
    expect(secondCall.message._id.toString()).toBe(firstCall.message._id.toString());
    expect(firstCall.message.sender._id.toString()).toBe(senderId.toString());
    expect(firstCall.message.sender.firstName).toBe('Tim');
    expect(firstCall.message.sender.lastName).toBe('Tebow');
    expect(secondCall.message.sender._id.toString()).toBe(senderId.toString());
    expect(secondCall.message.sender.firstName).toBe('Tim');
    expect(secondCall.message.sender.lastName).toBe('Tebow');
    expect((secondCall.message as unknown as Record<string, unknown>).senderId).toBeUndefined();
    expect(secondCall.message.text).toBe(
      `First submission from ${ufFixtures.timTebow.name} at ${ufFixtures.timTebow.email}`
    );
    expect((firstCall.message as unknown as Record<string, unknown>).save).toBeUndefined();
    expect((firstCall.message as unknown as Record<string, unknown>).$isDefault).toBeUndefined();
    expect((secondCall.message as unknown as Record<string, unknown>).save).toBeUndefined();
    expect((secondCall.message as unknown as Record<string, unknown>).$isDefault).toBeUndefined();
    const messageCount = await Message.countDocuments({
      conversationId: conversation._id,
    });
    expect(messageCount).toBe(1);
  });

  it('creates announcement message when sender is moderator in a channel', async () => {
    const clubId = new Types.ObjectId();
    const conversation = await Conversation.create({
      type: ConversationType.CHANNEL,
      title: 'announcements',
      clubId,
    });
    const moderatorUser = await createTestUser({
      firstName: 'Albert',
      lastName: 'Gator',
      email: ufFixtures.albertGator.email,
    });
    const moderatorId = moderatorUser._id;
    await ConversationParticipant.create({
      conversationId: conversation._id,
      userId: moderatorId,
      permission: ParticipantPermission.MODERATE,
    });

    const result = await sendMessage(
      conversation._id,
      moderatorId,
      `General body meeting announced by ${ufFixtures.albertGator.name} at ${ufFixtures.albertGator.email}`,
      undefined,
      true
    );
    const { message } = result;

    expect(result.isNew).toBe(true);
    expect(message.isAnnouncement).toBe(true);
    expect(message.sender._id.toString()).toBe(moderatorId.toString());
    expect(message.sender.firstName).toBe('Albert');
    expect(message.sender.lastName).toBe('Gator');
    expect(message.text).toBe(
      `General body meeting announced by ${ufFixtures.albertGator.name} at ${ufFixtures.albertGator.email}`
    );
    expect((message as unknown as Record<string, unknown>).save).toBeUndefined();
    expect((message as unknown as Record<string, unknown>).$isDefault).toBeUndefined();

    const persisted = await Message.findById(message._id).lean().exec();
    expect(persisted).not.toBeNull();
    if (!persisted) {
      throw new Error('Persisted message not found');
    }
    expect(persisted.isAnnouncement).toBe(true);
  });

  it('rejects announcements in non channel conversations or from non moderators', async () => {
    const groupConversation = await Conversation.create({
      type: ConversationType.GROUP,
      title: 'Turlington Plaza Frisbee',
    });
    const groupModeratorId = new Types.ObjectId();
    await ConversationParticipant.create({
      conversationId: groupConversation._id,
      userId: groupModeratorId,
      permission: ParticipantPermission.MODERATE,
    });

    await expect(
      sendMessage(
        groupConversation._id,
        groupModeratorId,
        `Announcement in group conversation by ${ufFixtures.albertGator.name}`,
        undefined,
        true
      )
    ).rejects.toMatchObject({
      name: 'MessagingError',
      code: 'ERR_INVALID_INPUT',
      message: 'Announcements are only allowed in club channels',
    });

    const channelConversation = await Conversation.create({
      type: ConversationType.CHANNEL,
      title: 'general',
      clubId: new Types.ObjectId(),
    });
    const standardMemberId = new Types.ObjectId();
    await ConversationParticipant.create({
      conversationId: channelConversation._id,
      userId: standardMemberId,
      permission: ParticipantPermission.WRITE,
    });

    await expect(
      sendMessage(
        channelConversation._id,
        standardMemberId,
        `Member announcement in channel by ${ufFixtures.timTebow.name}`,
        undefined,
        true
      )
    ).rejects.toMatchObject({
      name: 'MessagingError',
      code: 'ERR_OFFICER_PERMISSION_REQUIRED',
      message: 'Only moderators can post announcements',
    });
  });

  it('rejects message sending when user is not participant or has read only permission', async () => {
    const conversation = await Conversation.create({
      type: ConversationType.GROUP,
      title: 'Turlington Plaza Frisbee',
    });
    const nonParticipantId = new Types.ObjectId();

    await expect(
      sendMessage(
        conversation._id,
        nonParticipantId,
        `Message from outsider by ${ufFixtures.timTebow.name}`
      )
    ).rejects.toMatchObject({
      name: 'MessagingError',
      code: 'ERR_NOT_PARTICIPANT',
      message: 'Sender is not a participant in this conversation',
    });

    const readOnlyUserId = new Types.ObjectId();
    await ConversationParticipant.create({
      conversationId: conversation._id,
      userId: readOnlyUserId,
      permission: ParticipantPermission.READ,
    });

    await expect(
      sendMessage(
        conversation._id,
        readOnlyUserId,
        `Message from read only user by ${ufFixtures.lakeAliceBasker.name}`
      )
    ).rejects.toMatchObject({
      name: 'MessagingError',
      code: 'ERR_PERMISSION_DENIED',
      message: 'Sender has read-only permission in this conversation',
    });
  });

  it('rejects invalid conversationId senderId text or clientId inputs', async () => {
    const validConversationId = new Types.ObjectId();
    const validSenderId = new Types.ObjectId();

    await expect(
      sendMessage('', validSenderId, 'Test message')
    ).rejects.toThrow('Valid conversationId is required');

    await expect(
      sendMessage('invalid-id', validSenderId, 'Test message')
    ).rejects.toThrow('Valid conversationId is required');

    await expect(
      sendMessage(validConversationId, '', 'Test message')
    ).rejects.toThrow('Valid senderId is required');

    await expect(
      sendMessage(validConversationId, 'invalid-id', 'Test message')
    ).rejects.toThrow('Valid senderId is required');

    await expect(
      sendMessage(validConversationId, validSenderId, '')
    ).rejects.toThrow('text cannot be empty');

    await expect(
      sendMessage(validConversationId, validSenderId, '   ')
    ).rejects.toThrow('text cannot be empty');

    await expect(
      sendMessage(
        validConversationId,
        validSenderId,
        'Valid text',
        'invalid-client-uuid'
      )
    ).rejects.toThrow('Invalid clientId');
  });
});

describe('getMessages service', () => {
  it('returns messages in chronological descending order matching index as lean plain objects', async () => {
    const conversation = await Conversation.create({
      type: ConversationType.GROUP,
      title: 'Turlington Plaza Frisbee',
    });
    const participantUser = await createTestUser({
      firstName: 'Albert',
      lastName: 'Gator',
      email: ufFixtures.albertGator.email,
    });
    const participantId = participantUser._id;
    await ConversationParticipant.create({
      conversationId: conversation._id,
      userId: participantId,
      permission: ParticipantPermission.WRITE,
    });

    const msg1 = await Message.create({
      conversationId: conversation._id,
      senderId: participantId,
      text: `First frisbee throw by ${ufFixtures.lakeAliceBasker.name}`,
      createdAt: new Date('2026-01-01T10:00:00.000Z'),
    });
    const msg2 = await Message.create({
      conversationId: conversation._id,
      senderId: participantId,
      text: `Second frisbee throw by ${ufFixtures.timTebow.name}`,
      createdAt: new Date('2026-01-01T11:00:00.000Z'),
    });
    const msg3 = await Message.create({
      conversationId: conversation._id,
      senderId: participantId,
      text: `Third frisbee throw by ${ufFixtures.albertGator.name}`,
      createdAt: new Date('2026-01-01T12:00:00.000Z'),
    });

    const messages = await getMessages(conversation._id, participantId);

    expect(messages).toHaveLength(3);
    expect(messages[0]._id.toString()).toBe(msg3._id.toString());
    expect(messages[0].text).toBe(`Third frisbee throw by ${ufFixtures.albertGator.name}`);
    expect(messages[0].sender).toEqual({
      _id: participantId,
      firstName: 'Albert',
      lastName: 'Gator',
    });
    expect((messages[0] as unknown as Record<string, unknown>).senderId).toBeUndefined();
    expect(messages[1]._id.toString()).toBe(msg2._id.toString());
    expect(messages[1].text).toBe(`Second frisbee throw by ${ufFixtures.timTebow.name}`);
    expect(messages[2]._id.toString()).toBe(msg1._id.toString());
    expect(messages[2].text).toBe(`First frisbee throw by ${ufFixtures.lakeAliceBasker.name}`);

    for (const message of messages) {
      const plain = message as unknown as Record<string, unknown>;
      expect(plain.save).toBeUndefined();
      expect(plain.$isDefault).toBeUndefined();
    }
  });

  it('respects limit argument when limit is provided', async () => {
    const conversation = await Conversation.create({
      type: ConversationType.GROUP,
      title: 'Gator Corner Soft Serve Repair Crew',
    });
    const participantUser = await createTestUser({
      firstName: 'LakeAlice',
      lastName: 'Basker',
      email: ufFixtures.lakeAliceBasker.email,
    });
    const participantId = participantUser._id;
    await ConversationParticipant.create({
      conversationId: conversation._id,
      userId: participantId,
      permission: ParticipantPermission.WRITE,
    });

    await Message.create({
      conversationId: conversation._id,
      senderId: participantId,
      text: `${ufFixtures.lakeAliceBasker.name} frisbee throw one`,
      createdAt: new Date('2026-02-01T01:00:00.000Z'),
    });
    await Message.create({
      conversationId: conversation._id,
      senderId: participantId,
      text: `${ufFixtures.timTebow.name} frisbee throw two`,
      createdAt: new Date('2026-02-01T02:00:00.000Z'),
    });
    const msg3 = await Message.create({
      conversationId: conversation._id,
      senderId: participantId,
      text: `${ufFixtures.albertGator.name} frisbee throw three`,
      createdAt: new Date('2026-02-01T03:00:00.000Z'),
    });
    const msg4 = await Message.create({
      conversationId: conversation._id,
      senderId: participantId,
      text: `${ufFixtures.lakeAliceBasker.name} frisbee throw four`,
      createdAt: new Date('2026-02-01T04:00:00.000Z'),
    });

    const messages = await getMessages(conversation._id, participantId, 2);

    expect(messages).toHaveLength(2);
    expect(messages[0]._id.toString()).toBe(msg4._id.toString());
    expect(messages[0].text).toBe(`${ufFixtures.lakeAliceBasker.name} frisbee throw four`);
    expect(messages[0].sender).toEqual({
      _id: participantId,
      firstName: 'LakeAlice',
      lastName: 'Basker',
    });
    expect(messages[1]._id.toString()).toBe(msg3._id.toString());
    expect(messages[1].text).toBe(`${ufFixtures.albertGator.name} frisbee throw three`);

    for (const message of messages) {
      const plain = message as unknown as Record<string, unknown>;
      expect(plain.save).toBeUndefined();
      expect(plain.$isDefault).toBeUndefined();
    }
  });

  it('rejects message fetching when requesting user is not a participant', async () => {
    const conversation = await Conversation.create({
      type: ConversationType.GROUP,
      title: 'Turlington Plaza Frisbee',
    });
    const memberId = new Types.ObjectId();
    await ConversationParticipant.create({
      conversationId: conversation._id,
      userId: memberId,
      permission: ParticipantPermission.WRITE,
    });

    const outsiderId = new Types.ObjectId();

    await expect(
      getMessages(conversation._id, outsiderId)
    ).rejects.toMatchObject({
      name: 'MessagingError',
      code: 'ERR_NOT_PARTICIPANT',
      message: 'User is not a participant in this conversation',
    });
  });

  it('rejects invalid conversationId or requestingUserId with validation errors', async () => {
    const validId = new Types.ObjectId();

    await expect(
      getMessages('', validId)
    ).rejects.toThrow('Valid conversationId is required');

    await expect(
      getMessages('not-a-valid-id', validId)
    ).rejects.toThrow('Valid conversationId is required');

    await expect(
      getMessages(validId, '')
    ).rejects.toThrow('Valid requestingUserId is required');

    await expect(
      getMessages(validId, 'not-a-valid-id')
    ).rejects.toThrow('Valid requestingUserId is required');
  });

  it('masks removed message text in history while keeping database text intact', async () => {
    const conversation = await Conversation.create({
      type: ConversationType.GROUP,
      title: 'Bat Houses Sunset Flight Club',
    });
    const senderUser = await createTestUser({
      firstName: 'Broward',
      lastName: 'Freshman',
      email: 'broward.dining@ufl.edu',
    });
    const senderId = senderUser._id;
    const readerId = new Types.ObjectId();
    await ConversationParticipant.create({
      conversationId: conversation._id,
      userId: senderId,
      permission: ParticipantPermission.WRITE,
    });
    await ConversationParticipant.create({
      conversationId: conversation._id,
      userId: readerId,
      permission: ParticipantPermission.WRITE,
    });

    const activeMessage = await Message.create({
      conversationId: conversation._id,
      senderId,
      text: 'Broward Freshman at broward.dining@ufl.edu spotted bats emerging',
    });

    const rawDeletedText = 'Dennis Heckler at turlington_screamer@ufl.edu shouted across the lawn';
    const deletedMessage = await Message.create({
      conversationId: conversation._id,
      senderId,
      text: rawDeletedText,
      removedAt: new Date(),
      removedBy: senderId,
    });

    const messages = await getMessages(conversation._id, readerId);

    expect(messages).toHaveLength(2);

    const retrievedDeleted = messages.find(
      (msg) => msg._id.toString() === deletedMessage._id.toString()
    );
    const retrievedActive = messages.find(
      (msg) => msg._id.toString() === activeMessage._id.toString()
    );

    expect(retrievedDeleted).toBeDefined();
    expect(retrievedDeleted?.text).toBe('This message was deleted');
    expect(retrievedDeleted?.sender).toEqual({
      _id: senderId,
      firstName: 'Broward',
      lastName: 'Freshman',
    });
    expect((retrievedDeleted as unknown as Record<string, unknown>).senderId).toBeUndefined();
    expect(retrievedDeleted?.removedAt).toBeDefined();
    expect(retrievedDeleted?.removedBy?.toString()).toBe(senderId.toString());

    expect(retrievedActive).toBeDefined();
    expect(retrievedActive?.text).toBe('Broward Freshman at broward.dining@ufl.edu spotted bats emerging');
    expect(retrievedActive?.sender).toEqual({
      _id: senderId,
      firstName: 'Broward',
      lastName: 'Freshman',
    });
    expect(retrievedActive?.removedAt).toBeUndefined();

    const rawDoc = await Message.findById(deletedMessage._id).lean().exec();
    expect(rawDoc).toBeDefined();
    expect(rawDoc?.text).toBe(rawDeletedText);
  });

  it('rejects with USER_NOT_FOUND when a message sender document is missing', async () => {
    const conversation = await Conversation.create({
      type: ConversationType.GROUP,
      title: 'Reitz Union Food Court Nap Society',
    });
    const missingSenderId = new Types.ObjectId();
    const readerId = new Types.ObjectId();
    await ConversationParticipant.create({
      conversationId: conversation._id,
      userId: readerId,
      permission: ParticipantPermission.WRITE,
    });
    await Message.create({
      conversationId: conversation._id,
      senderId: missingSenderId,
      text: 'Orphaned message without user document',
    });

    await expect(
      getMessages(conversation._id, readerId)
    ).rejects.toMatchObject({
      name: 'MessagingError',
      code: 'ERR_USER_NOT_FOUND',
      message: 'Message sender not found',
    });
  });
});

describe('deleteMessage service', () => {
  it('allows author soft deletion', async () => {
    const conversation = await Conversation.create({
      type: ConversationType.GROUP,
      title: 'Gator Corner Soft Serve Repair Crew',
    });
    const authorUser = await createTestUser({
      firstName: 'Tim',
      lastName: 'Tebow',
      email: ufFixtures.timTebow.email,
    });
    const authorId = authorUser._id;
    await ConversationParticipant.create({
      conversationId: conversation._id,
      userId: authorId,
      permission: ParticipantPermission.WRITE,
    });

    const objectIdMessage = await Message.create({
      conversationId: conversation._id,
      senderId: authorId,
      text: `Soft serve machine is operational again reported by ${ufFixtures.timTebow.name}`,
      isSystem: false,
    });

    const objectIdResult = await deleteMessage(conversation._id, objectIdMessage._id, authorId);

    expect(objectIdResult._id.toString()).toBe(objectIdMessage._id.toString());
    expect(objectIdResult.sender._id.toString()).toBe(authorId.toString());
    expect(objectIdResult.sender.firstName).toBe('Tim');
    expect(objectIdResult.sender.lastName).toBe('Tebow');
    expect((objectIdResult as unknown as Record<string, unknown>).senderId).toBeUndefined();
    expect(objectIdResult.removedAt).toBeDefined();
    expect(objectIdResult.removedBy?.toString()).toBe(authorId.toString());
    expect((objectIdResult as unknown as Record<string, unknown>).save).toBeUndefined();
    expect((objectIdResult as unknown as Record<string, unknown>).$isDefault).toBeUndefined();

    const objectIdPersisted = await Message.findById(objectIdMessage._id).lean().exec();
    expect(objectIdPersisted?.removedAt).toBeDefined();
    expect(objectIdPersisted?.removedBy?.toString()).toBe(authorId.toString());
  });

  it('preserves original removedAt timestamp on repeated deletion calls', async () => {
    const conversation = await Conversation.create({
      type: ConversationType.GROUP,
      title: 'Turlington Plaza Frisbee',
    });
    const authorUser = await createTestUser({
      firstName: 'LakeAlice',
      lastName: 'Basker',
      email: ufFixtures.lakeAliceBasker.email,
    });
    const authorId = authorUser._id;
    const moderatorId = new Types.ObjectId();
    await ConversationParticipant.create({
      conversationId: conversation._id,
      userId: authorId,
      permission: ParticipantPermission.WRITE,
    });
    await ConversationParticipant.create({
      conversationId: conversation._id,
      userId: moderatorId,
      permission: ParticipantPermission.MODERATE,
    });

    const message = await Message.create({
      conversationId: conversation._id,
      senderId: authorId,
      text: `Original frisbee schedule posted by ${ufFixtures.lakeAliceBasker.name}`,
      isSystem: false,
    });

    const firstResult = await deleteMessage(conversation._id, message._id, authorId);
    const initialTimestamp = firstResult.removedAt;
    expect(initialTimestamp).toBeDefined();
    expect(firstResult.text).toBe('This message was deleted');
    expect(firstResult.sender).toEqual({
      _id: authorId,
      firstName: 'LakeAlice',
      lastName: 'Basker',
    });

    const secondResult = await deleteMessage(conversation._id, message._id, authorId);
    expect(secondResult.removedAt).toEqual(initialTimestamp);
    expect(secondResult.removedBy?.toString()).toBe(authorId.toString());
    expect(secondResult.text).toBe('This message was deleted');
    expect(secondResult.sender).toEqual({
      _id: authorId,
      firstName: 'LakeAlice',
      lastName: 'Basker',
    });

    const moderatorResult = await deleteMessage(conversation._id, message._id, moderatorId);
    expect(moderatorResult.removedAt).toEqual(initialTimestamp);
    expect(moderatorResult.removedBy?.toString()).toBe(authorId.toString());
    expect(moderatorResult.sender).toEqual({
      _id: authorId,
      firstName: 'LakeAlice',
      lastName: 'Basker',
    });

    expect((firstResult as unknown as Record<string, unknown>).save).toBeUndefined();
    expect((firstResult as unknown as Record<string, unknown>).$isDefault).toBeUndefined();
    expect((secondResult as unknown as Record<string, unknown>).save).toBeUndefined();
    expect((secondResult as unknown as Record<string, unknown>).$isDefault).toBeUndefined();
    expect((moderatorResult as unknown as Record<string, unknown>).save).toBeUndefined();
    expect((moderatorResult as unknown as Record<string, unknown>).$isDefault).toBeUndefined();

    const persisted = await Message.findById(message._id).lean().exec();
    expect(persisted?.removedAt).toEqual(initialTimestamp);
    expect(persisted?.removedBy?.toString()).toBe(authorId.toString());
  });

  it('allows channel or group moderator to soft delete another member message', async () => {
    const groupConversation = await Conversation.create({
      type: ConversationType.GROUP,
      title: 'Turlington Plaza Frisbee',
    });
    const groupAuthorUser = await createTestUser({
      firstName: 'Albert',
      lastName: 'Gator',
      email: ufFixtures.albertGator.email,
    });
    const groupAuthorId = groupAuthorUser._id;
    const groupModeratorId = new Types.ObjectId();

    await ConversationParticipant.create({
      conversationId: groupConversation._id,
      userId: groupAuthorId,
      permission: ParticipantPermission.WRITE,
    });
    await ConversationParticipant.create({
      conversationId: groupConversation._id,
      userId: groupModeratorId,
      permission: ParticipantPermission.MODERATE,
    });

    const groupMessage = await Message.create({
      conversationId: groupConversation._id,
      senderId: groupAuthorId,
      text: `Out of discs at the field observed by ${ufFixtures.albertGator.name}`,
      isSystem: false,
    });

    const groupResult = await deleteMessage(groupConversation._id, groupMessage._id, groupModeratorId);
    expect(groupResult._id.toString()).toBe(groupMessage._id.toString());
    expect(groupResult.sender).toEqual({
      _id: groupAuthorId,
      firstName: 'Albert',
      lastName: 'Gator',
    });
    expect(groupResult.removedAt).toBeDefined();
    expect(groupResult.removedBy?.toString()).toBe(groupModeratorId.toString());
    expect((groupResult as unknown as Record<string, unknown>).save).toBeUndefined();
    expect((groupResult as unknown as Record<string, unknown>).$isDefault).toBeUndefined();

    const groupPersisted = await Message.findById(groupMessage._id).lean().exec();
    expect(groupPersisted?.removedAt).toBeDefined();
    expect(groupPersisted?.removedBy?.toString()).toBe(groupModeratorId.toString());

    const channelConversation = await Conversation.create({
      type: ConversationType.CHANNEL,
      title: 'announcements',
      clubId: new Types.ObjectId(),
    });
    const channelAuthorUser = await createTestUser({
      firstName: 'Tim',
      lastName: 'Tebow',
      email: ufFixtures.timTebow.email,
    });
    const channelAuthorId = channelAuthorUser._id;
    const channelModeratorId = new Types.ObjectId();

    await ConversationParticipant.create({
      conversationId: channelConversation._id,
      userId: channelAuthorId,
      permission: ParticipantPermission.WRITE,
    });
    await ConversationParticipant.create({
      conversationId: channelConversation._id,
      userId: channelModeratorId,
      permission: ParticipantPermission.MODERATE,
    });

    const channelMessage = await Message.create({
      conversationId: channelConversation._id,
      senderId: channelAuthorId,
      text: `Channel discussion posted by ${ufFixtures.timTebow.name}`,
      isSystem: false,
    });

    const channelResult = await deleteMessage(channelConversation._id, channelMessage._id, channelModeratorId);
    expect(channelResult._id.toString()).toBe(channelMessage._id.toString());
    expect(channelResult.sender).toEqual({
      _id: channelAuthorId,
      firstName: 'Tim',
      lastName: 'Tebow',
    });
    expect(channelResult.removedAt).toBeDefined();
    expect(channelResult.removedBy?.toString()).toBe(channelModeratorId.toString());
    expect((channelResult as unknown as Record<string, unknown>).save).toBeUndefined();
    expect((channelResult as unknown as Record<string, unknown>).$isDefault).toBeUndefined();

    const channelPersisted = await Message.findById(channelMessage._id).lean().exec();
    expect(channelPersisted?.removedAt).toBeDefined();
    expect(channelPersisted?.removedBy?.toString()).toBe(channelModeratorId.toString());
  });

  it('rejects deletion of system messages', async () => {
    const conversation = await Conversation.create({
      type: ConversationType.GROUP,
      title: 'Gator Corner Soft Serve Repair Crew',
    });
    const authorId = new Types.ObjectId();
    const moderatorId = new Types.ObjectId();

    await ConversationParticipant.create({
      conversationId: conversation._id,
      userId: authorId,
      permission: ParticipantPermission.WRITE,
    });
    await ConversationParticipant.create({
      conversationId: conversation._id,
      userId: moderatorId,
      permission: ParticipantPermission.MODERATE,
    });

    const systemMessage = await Message.create({
      conversationId: conversation._id,
      senderId: authorId,
      text: `${ufFixtures.albertGator.name} joined conversation`,
      isSystem: true,
    });

    await expect(
      deleteMessage(conversation._id, systemMessage._id, authorId)
    ).rejects.toThrow('System messages cannot be deleted');

    await expect(
      deleteMessage(conversation._id, systemMessage._id, moderatorId)
    ).rejects.toThrow('System messages cannot be deleted');

    const persisted = await Message.findById(systemMessage._id).lean().exec();
    expect(persisted?.removedAt).toBeUndefined();
    expect(persisted?.removedBy).toBeUndefined();
  });

  it('rejects unauthorized caller deletion attempts across multiple participant roles and deleted states', async () => {
    const conversationOne = await Conversation.create({
      type: ConversationType.GROUP,
      title: 'Turlington Plaza Frisbee',
    });
    const conversationTwo = await Conversation.create({
      type: ConversationType.GROUP,
      title: 'Gator Corner Soft Serve Repair Crew',
    });

    const authorUser = await createTestUser({
      firstName: 'LakeAlice',
      lastName: 'Basker',
      email: ufFixtures.lakeAliceBasker.email,
    });
    const authorId = authorUser._id;
    const nonModeratorId = new Types.ObjectId();
    const readOnlyId = new Types.ObjectId();
    const outsiderId = new Types.ObjectId();
    const crossModeratorId = new Types.ObjectId();

    await ConversationParticipant.create({
      conversationId: conversationOne._id,
      userId: authorId,
      permission: ParticipantPermission.WRITE,
    });
    await ConversationParticipant.create({
      conversationId: conversationOne._id,
      userId: nonModeratorId,
      permission: ParticipantPermission.WRITE,
    });
    await ConversationParticipant.create({
      conversationId: conversationOne._id,
      userId: readOnlyId,
      permission: ParticipantPermission.READ,
    });
    await ConversationParticipant.create({
      conversationId: conversationTwo._id,
      userId: crossModeratorId,
      permission: ParticipantPermission.MODERATE,
    });

    const message = await Message.create({
      conversationId: conversationOne._id,
      senderId: authorId,
      text: `Frisbee practice canceled by ${ufFixtures.lakeAliceBasker.name}`,
      isSystem: false,
    });

    await expect(
      deleteMessage(conversationOne._id, message._id, nonModeratorId)
    ).rejects.toThrow('User is not authorized to delete this message');

    await expect(
      deleteMessage(conversationOne._id, message._id, readOnlyId)
    ).rejects.toThrow('User is not authorized to delete this message');

    await expect(
      deleteMessage(conversationOne._id, message._id, outsiderId)
    ).rejects.toThrow('User is not authorized to delete this message');

    await expect(
      deleteMessage(conversationOne._id, message._id, crossModeratorId)
    ).rejects.toThrow('User is not authorized to delete this message');

    await deleteMessage(conversationOne._id, message._id, authorId);

    await expect(
      deleteMessage(conversationOne._id, message._id, outsiderId)
    ).rejects.toThrow('User is not authorized to delete this message');

    await expect(
      deleteMessage(conversationOne._id, message._id, nonModeratorId)
    ).rejects.toThrow('User is not authorized to delete this message');

    await expect(
      deleteMessage(conversationOne._id, message._id, readOnlyId)
    ).rejects.toThrow('User is not authorized to delete this message');

    await expect(
      deleteMessage(conversationOne._id, message._id, crossModeratorId)
    ).rejects.toThrow('User is not authorized to delete this message');

    const persisted = await Message.findById(message._id).lean().exec();
    expect(persisted?.removedBy?.toString()).toBe(authorId.toString());
  });

  it('rejects deletion when author is no longer an active participant', async () => {
    const conversation = await Conversation.create({
      type: ConversationType.GROUP,
      title: 'Newell Hall Late Night Debuggers',
    });
    const authorId = new Types.ObjectId();
    const otherMemberId = new Types.ObjectId();

    await ConversationParticipant.create({
      conversationId: conversation._id,
      userId: authorId,
      permission: ParticipantPermission.WRITE,
    });
    await ConversationParticipant.create({
      conversationId: conversation._id,
      userId: otherMemberId,
      permission: ParticipantPermission.MODERATE,
    });

    const message = await Message.create({
      conversationId: conversation._id,
      senderId: authorId,
      text: 'Original debug notes',
      isSystem: false,
    });

    await ConversationParticipant.deleteOne({
      conversationId: conversation._id,
      userId: authorId,
    });

    await expect(
      deleteMessage(conversation._id, message._id, authorId)
    ).rejects.toThrow('User is not authorized to delete this message');
  });

  it('rejects invalid input parameters or missing message identifiers', async () => {
    const validId = new Types.ObjectId();
    const nonExistentMessageId = new Types.ObjectId();

    await expect(
      deleteMessage('', validId, validId)
    ).rejects.toThrow('Valid conversationId is required');

    await expect(
      deleteMessage('   ', validId, validId)
    ).rejects.toThrow('Valid conversationId is required');

    await expect(
      deleteMessage('invalid-id', validId, validId)
    ).rejects.toThrow('Valid conversationId is required');

    await expect(
      deleteMessage(validId, '', validId)
    ).rejects.toThrow('Valid messageId is required');

    await expect(
      deleteMessage(validId, '   ', validId)
    ).rejects.toThrow('Valid messageId is required');

    await expect(
      deleteMessage(validId, 'invalid-id', validId)
    ).rejects.toThrow('Valid messageId is required');

    await expect(
      deleteMessage(validId, validId, '')
    ).rejects.toThrow('Valid requestingUserId is required');

    await expect(
      deleteMessage(validId, validId, '   ')
    ).rejects.toThrow('Valid requestingUserId is required');

    await expect(
      deleteMessage(validId, validId, 'invalid-id')
    ).rejects.toThrow('Valid requestingUserId is required');

    await expect(
      deleteMessage(validId, nonExistentMessageId, validId)
    ).rejects.toThrow('Message not found');
  });
});
