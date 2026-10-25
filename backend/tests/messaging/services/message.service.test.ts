import { describe, it, expect, beforeAll, afterEach, afterAll } from '@jest/globals';
import { Types } from 'mongoose';
import { connectTestDb, clearTestDb, closeTestDb } from '../../helpers/db';
import { Message } from '../../../src/messaging/models/Message';
import { Conversation, ConversationType } from '../../../src/messaging/models/Conversation';
import { ConversationParticipant, ParticipantPermission } from '../../../src/messaging/models/ConversationParticipant';
import { sendMessage, getMessages, deleteMessage } from '../../../src/messaging/services/message.service';

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
    const senderId = new Types.ObjectId();
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

    expect(result.conversationId.toString()).toBe(conversation._id.toString());
    expect(result.senderId.toString()).toBe(senderId.toString());
    expect(result.text).toBe(
      `Meeting at Century Tower with ${ufFixtures.lakeAliceBasker.name} at ${ufFixtures.lakeAliceBasker.email}`
    );
    expect(result.isAnnouncement).toBe(false);
    expect(result.isSystem).toBe(false);
    expect((result as Record<string, unknown>).save).toBeUndefined();
    expect((result as Record<string, unknown>).$isDefault).toBeUndefined();
  });

  it('returns existing message without duplicate error when duplicate client id is sent', async () => {
    const conversation = await Conversation.create({
      type: ConversationType.GROUP,
      title: 'Gator Corner Soft Serve Repair Crew',
    });
    const senderId = new Types.ObjectId();
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

    expect(secondCall._id.toString()).toBe(firstCall._id.toString());
    expect(secondCall.text).toBe(
      `First submission from ${ufFixtures.timTebow.name} at ${ufFixtures.timTebow.email}`
    );
    expect((firstCall as Record<string, unknown>).save).toBeUndefined();
    expect((firstCall as Record<string, unknown>).$isDefault).toBeUndefined();
    expect((secondCall as Record<string, unknown>).save).toBeUndefined();
    expect((secondCall as Record<string, unknown>).$isDefault).toBeUndefined();
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
    const moderatorId = new Types.ObjectId();
    await ConversationParticipant.create({
      conversationId: conversation._id,
      userId: moderatorId,
      permission: ParticipantPermission.MODERATE,
    });

    const message = await sendMessage(
      conversation._id,
      moderatorId,
      `General body meeting announced by ${ufFixtures.albertGator.name} at ${ufFixtures.albertGator.email}`,
      undefined,
      true
    );

    expect(message.isAnnouncement).toBe(true);
    expect(message.text).toBe(
      `General body meeting announced by ${ufFixtures.albertGator.name} at ${ufFixtures.albertGator.email}`
    );
    expect((message as Record<string, unknown>).save).toBeUndefined();
    expect((message as Record<string, unknown>).$isDefault).toBeUndefined();

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
    ).rejects.toThrow('Announcements are only allowed in club channels');

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
    ).rejects.toThrow('Only moderators can post announcements');
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
    ).rejects.toThrow('Sender is not a participant in this conversation');

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
    ).rejects.toThrow('Sender has read-only permission in this conversation');
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
    const participantId = new Types.ObjectId();
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
    expect(messages[1]._id.toString()).toBe(msg2._id.toString());
    expect(messages[1].text).toBe(`Second frisbee throw by ${ufFixtures.timTebow.name}`);
    expect(messages[2]._id.toString()).toBe(msg1._id.toString());
    expect(messages[2].text).toBe(`First frisbee throw by ${ufFixtures.lakeAliceBasker.name}`);

    for (const message of messages) {
      const plain = message as Record<string, unknown>;
      expect(plain.save).toBeUndefined();
      expect(plain.$isDefault).toBeUndefined();
    }
  });

  it('respects limit argument when limit is provided', async () => {
    const conversation = await Conversation.create({
      type: ConversationType.GROUP,
      title: 'Gator Corner Soft Serve Repair Crew',
    });
    const participantId = new Types.ObjectId();
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
    expect(messages[1]._id.toString()).toBe(msg3._id.toString());
    expect(messages[1].text).toBe(`${ufFixtures.albertGator.name} frisbee throw three`);

    for (const message of messages) {
      const plain = message as Record<string, unknown>;
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
    ).rejects.toThrow('User is not a participant in this conversation');
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
    const senderId = new Types.ObjectId();
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
    expect(retrievedDeleted?.removedAt).toBeDefined();
    expect(retrievedDeleted?.removedBy?.toString()).toBe(senderId.toString());

    expect(retrievedActive).toBeDefined();
    expect(retrievedActive?.text).toBe('Broward Freshman at broward.dining@ufl.edu spotted bats emerging');
    expect(retrievedActive?.removedAt).toBeUndefined();

    const rawDoc = await Message.findById(deletedMessage._id).lean().exec();
    expect(rawDoc).toBeDefined();
    expect(rawDoc?.text).toBe(rawDeletedText);
  });
});

describe('deleteMessage service', () => {
  it('allows author soft deletion and supports hex string identifiers', async () => {
    const conversation = await Conversation.create({
      type: ConversationType.GROUP,
      title: 'Gator Corner Soft Serve Repair Crew',
    });
    const authorId = new Types.ObjectId();
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

    const objectIdResult = await deleteMessage(objectIdMessage._id, authorId);

    expect(objectIdResult._id.toString()).toBe(objectIdMessage._id.toString());
    expect(objectIdResult.removedAt).toBeDefined();
    expect(objectIdResult.removedBy?.toString()).toBe(authorId.toString());
    expect((objectIdResult as Record<string, unknown>).save).toBeUndefined();
    expect((objectIdResult as Record<string, unknown>).$isDefault).toBeUndefined();

    const objectIdPersisted = await Message.findById(objectIdMessage._id).lean().exec();
    expect(objectIdPersisted?.removedAt).toBeDefined();
    expect(objectIdPersisted?.removedBy?.toString()).toBe(authorId.toString());

    const hexMessage = await Message.create({
      conversationId: conversation._id,
      senderId: authorId,
      text: `Secondary soft serve check logged by ${ufFixtures.lakeAliceBasker.name}`,
      isSystem: false,
    });

    const hexResult = await deleteMessage(
      hexMessage._id.toHexString(),
      authorId.toHexString()
    );

    expect(hexResult._id.toString()).toBe(hexMessage._id.toString());
    expect(hexResult.removedAt).toBeDefined();
    expect(hexResult.removedBy?.toString()).toBe(authorId.toString());
    expect((hexResult as Record<string, unknown>).save).toBeUndefined();
    expect((hexResult as Record<string, unknown>).$isDefault).toBeUndefined();

    const hexPersisted = await Message.findById(hexMessage._id).lean().exec();
    expect(hexPersisted?.removedAt).toBeDefined();
    expect(hexPersisted?.removedBy?.toString()).toBe(authorId.toString());
  });

  it('preserves original removedAt timestamp on repeated deletion calls', async () => {
    const conversation = await Conversation.create({
      type: ConversationType.GROUP,
      title: 'Turlington Plaza Frisbee',
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

    const message = await Message.create({
      conversationId: conversation._id,
      senderId: authorId,
      text: `Original frisbee schedule posted by ${ufFixtures.lakeAliceBasker.name}`,
      isSystem: false,
    });

    const firstResult = await deleteMessage(message._id, authorId);
    const initialTimestamp = firstResult.removedAt;
    expect(initialTimestamp).toBeDefined();

    const secondResult = await deleteMessage(message._id, authorId);
    expect(secondResult.removedAt).toEqual(initialTimestamp);
    expect(secondResult.removedBy?.toString()).toBe(authorId.toString());

    const moderatorResult = await deleteMessage(message._id, moderatorId);
    expect(moderatorResult.removedAt).toEqual(initialTimestamp);
    expect(moderatorResult.removedBy?.toString()).toBe(authorId.toString());

    expect((firstResult as Record<string, unknown>).save).toBeUndefined();
    expect((firstResult as Record<string, unknown>).$isDefault).toBeUndefined();
    expect((secondResult as Record<string, unknown>).save).toBeUndefined();
    expect((secondResult as Record<string, unknown>).$isDefault).toBeUndefined();
    expect((moderatorResult as Record<string, unknown>).save).toBeUndefined();
    expect((moderatorResult as Record<string, unknown>).$isDefault).toBeUndefined();

    const persisted = await Message.findById(message._id).lean().exec();
    expect(persisted?.removedAt).toEqual(initialTimestamp);
    expect(persisted?.removedBy?.toString()).toBe(authorId.toString());
  });

  it('allows channel or group moderator to soft delete another member message', async () => {
    const groupConversation = await Conversation.create({
      type: ConversationType.GROUP,
      title: 'Turlington Plaza Frisbee',
    });
    const groupAuthorId = new Types.ObjectId();
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

    const groupResult = await deleteMessage(groupMessage._id, groupModeratorId);
    expect(groupResult._id.toString()).toBe(groupMessage._id.toString());
    expect(groupResult.removedAt).toBeDefined();
    expect(groupResult.removedBy?.toString()).toBe(groupModeratorId.toString());
    expect((groupResult as Record<string, unknown>).save).toBeUndefined();
    expect((groupResult as Record<string, unknown>).$isDefault).toBeUndefined();

    const groupPersisted = await Message.findById(groupMessage._id).lean().exec();
    expect(groupPersisted?.removedAt).toBeDefined();
    expect(groupPersisted?.removedBy?.toString()).toBe(groupModeratorId.toString());

    const channelConversation = await Conversation.create({
      type: ConversationType.CHANNEL,
      title: 'announcements',
      clubId: new Types.ObjectId(),
    });
    const channelAuthorId = new Types.ObjectId();
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

    const channelResult = await deleteMessage(channelMessage._id, channelModeratorId);
    expect(channelResult._id.toString()).toBe(channelMessage._id.toString());
    expect(channelResult.removedAt).toBeDefined();
    expect(channelResult.removedBy?.toString()).toBe(channelModeratorId.toString());
    expect((channelResult as Record<string, unknown>).save).toBeUndefined();
    expect((channelResult as Record<string, unknown>).$isDefault).toBeUndefined();

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
      deleteMessage(systemMessage._id, authorId)
    ).rejects.toThrow('System messages cannot be deleted');

    await expect(
      deleteMessage(systemMessage._id, moderatorId)
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

    const authorId = new Types.ObjectId();
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
      deleteMessage(message._id, nonModeratorId)
    ).rejects.toThrow('User is not authorized to delete this message');

    await expect(
      deleteMessage(message._id, readOnlyId)
    ).rejects.toThrow('User is not authorized to delete this message');

    await expect(
      deleteMessage(message._id, outsiderId)
    ).rejects.toThrow('User is not authorized to delete this message');

    await expect(
      deleteMessage(message._id, crossModeratorId)
    ).rejects.toThrow('User is not authorized to delete this message');

    await deleteMessage(message._id, authorId);

    await expect(
      deleteMessage(message._id, outsiderId)
    ).rejects.toThrow('User is not authorized to delete this message');

    await expect(
      deleteMessage(message._id, nonModeratorId)
    ).rejects.toThrow('User is not authorized to delete this message');

    await expect(
      deleteMessage(message._id, readOnlyId)
    ).rejects.toThrow('User is not authorized to delete this message');

    await expect(
      deleteMessage(message._id, crossModeratorId)
    ).rejects.toThrow('User is not authorized to delete this message');

    const persisted = await Message.findById(message._id).lean().exec();
    expect(persisted?.removedBy?.toString()).toBe(authorId.toString());
  });

  it('rejects invalid input parameters or missing message identifiers', async () => {
    const validId = new Types.ObjectId();
    const nonExistentMessageId = new Types.ObjectId();

    await expect(
      deleteMessage('', validId)
    ).rejects.toThrow('Valid messageId is required');

    await expect(
      deleteMessage('   ', validId)
    ).rejects.toThrow('Valid messageId is required');

    await expect(
      deleteMessage('invalid-id', validId)
    ).rejects.toThrow('Valid messageId is required');

    await expect(
      deleteMessage(validId, '')
    ).rejects.toThrow('Valid requestingUserId is required');

    await expect(
      deleteMessage(validId, '   ')
    ).rejects.toThrow('Valid requestingUserId is required');

    await expect(
      deleteMessage(validId, 'invalid-id')
    ).rejects.toThrow('Valid requestingUserId is required');

    await expect(
      deleteMessage(nonExistentMessageId, validId)
    ).rejects.toThrow('Message not found');
  });
});
