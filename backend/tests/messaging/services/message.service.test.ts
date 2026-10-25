import { describe, it, expect, beforeAll, afterEach, afterAll } from '@jest/globals';
import { Types } from 'mongoose';
import { connectTestDb, clearTestDb, closeTestDb } from '../../helpers/db';
import { Message } from '../../../src/messaging/models/Message';
import { Conversation, ConversationType } from '../../../src/messaging/models/Conversation';
import { ConversationParticipant, ParticipantPermission } from '../../../src/messaging/models/ConversationParticipant';
import { sendMessage, getMessages, deleteMessage } from '../../../src/messaging/services/message.service';

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
      title: 'French Fries Monument Preservation Society',
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
      'Meeting at Century Tower'
    );

    expect(result.conversationId.toString()).toBe(conversation._id.toString());
    expect(result.senderId.toString()).toBe(senderId.toString());
    expect(result.text).toBe('Meeting at Century Tower');
    expect(result.isAnnouncement).toBe(false);
    expect(result.isSystem).toBe(false);
    expect((result as Record<string, unknown>).save).toBeUndefined();
    expect((result as Record<string, unknown>).$isDefault).toBeUndefined();
  });

  it('returns existing message without duplicate error when duplicate client id is sent', async () => {
    const conversation = await Conversation.create({
      type: ConversationType.GROUP,
      title: 'Chomp Streetwear Collective',
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
      'First submission text',
      clientId
    );
    const secondCall = await sendMessage(
      conversation._id,
      senderId,
      'Duplicate submission with altered text',
      clientId
    );

    expect(secondCall._id.toString()).toBe(firstCall._id.toString());
    expect(secondCall.text).toBe('First submission text');
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
      'General body meeting this Wednesday at Turlington',
      undefined,
      true
    );

    expect(message.isAnnouncement).toBe(true);
    expect(message.text).toBe('General body meeting this Wednesday at Turlington');

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
      title: 'Dennis Heckler Fan Club',
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
        'Announcement in group conversation',
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
        'Member announcement in channel',
        undefined,
        true
      )
    ).rejects.toThrow('Only moderators can post announcements');
  });

  it('rejects message sending when user is not participant or has read only permission', async () => {
    const conversation = await Conversation.create({
      type: ConversationType.GROUP,
      title: 'Albert Gator Discussion Circle',
    });
    const nonParticipantId = new Types.ObjectId();

    await expect(
      sendMessage(
        conversation._id,
        nonParticipantId,
        'Message from outsider'
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
        'Message from read only user'
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
  it('returns messages in chronological descending order matching index', async () => {
    const conversation = await Conversation.create({
      type: ConversationType.GROUP,
      title: 'Chicken Tender Thursday Enthusiasts',
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
      text: 'First tender update',
      createdAt: new Date('2026-01-01T10:00:00.000Z'),
    });
    const msg2 = await Message.create({
      conversationId: conversation._id,
      senderId: participantId,
      text: 'Second tender update',
      createdAt: new Date('2026-01-01T11:00:00.000Z'),
    });
    const msg3 = await Message.create({
      conversationId: conversation._id,
      senderId: participantId,
      text: 'Third tender update',
      createdAt: new Date('2026-01-01T12:00:00.000Z'),
    });

    const messages = await getMessages(conversation._id, participantId);

    expect(messages).toHaveLength(3);
    expect(messages[0]._id.toString()).toBe(msg3._id.toString());
    expect(messages[0].text).toBe('Third tender update');
    expect(messages[1]._id.toString()).toBe(msg2._id.toString());
    expect(messages[1].text).toBe('Second tender update');
    expect(messages[2]._id.toString()).toBe(msg1._id.toString());
    expect(messages[2].text).toBe('First tender update');
  });

  it('respects limit argument when limit is provided', async () => {
    const conversation = await Conversation.create({
      type: ConversationType.GROUP,
      title: 'Newell Hall Late Night Debuggers',
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
      text: 'Message one',
      createdAt: new Date('2026-02-01T01:00:00.000Z'),
    });
    await Message.create({
      conversationId: conversation._id,
      senderId: participantId,
      text: 'Message two',
      createdAt: new Date('2026-02-01T02:00:00.000Z'),
    });
    const msg3 = await Message.create({
      conversationId: conversation._id,
      senderId: participantId,
      text: 'Message three',
      createdAt: new Date('2026-02-01T03:00:00.000Z'),
    });
    const msg4 = await Message.create({
      conversationId: conversation._id,
      senderId: participantId,
      text: 'Message four',
      createdAt: new Date('2026-02-01T04:00:00.000Z'),
    });

    const messages = await getMessages(conversation._id, participantId, 2);

    expect(messages).toHaveLength(2);
    expect(messages[0]._id.toString()).toBe(msg4._id.toString());
    expect(messages[0].text).toBe('Message four');
    expect(messages[1]._id.toString()).toBe(msg3._id.toString());
    expect(messages[1].text).toBe('Message three');
  });

  it('returns entire conversation history when limit is omitted', async () => {
    const conversation = await Conversation.create({
      type: ConversationType.GROUP,
      title: 'Plaza of the Americas Hammock Sleepers',
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
      text: 'Finding trees near Library West',
      createdAt: new Date('2026-03-01T12:00:00.000Z'),
    });
    await Message.create({
      conversationId: conversation._id,
      senderId: participantId,
      text: 'Found a quiet spot',
      createdAt: new Date('2026-03-01T12:05:00.000Z'),
    });
    await Message.create({
      conversationId: conversation._id,
      senderId: participantId,
      text: 'Waking up for class',
      createdAt: new Date('2026-03-01T12:50:00.000Z'),
    });

    const messages = await getMessages(conversation._id, participantId, undefined);

    expect(messages).toHaveLength(3);
    expect(messages[0].text).toBe('Waking up for class');
    expect(messages[1].text).toBe('Found a quiet spot');
    expect(messages[2].text).toBe('Finding trees near Library West');
  });

  it('rejects message fetching when requesting user is not a participant', async () => {
    const conversation = await Conversation.create({
      type: ConversationType.GROUP,
      title: 'Swamp Launch Rocketry',
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

  it('returns plain message objects without mongoose document methods', async () => {
    const conversation = await Conversation.create({
      type: ConversationType.GROUP,
      title: 'French Fries Monument Preservation Society',
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
      text: 'Documenting the monument sculpture',
    });

    const messages = await getMessages(conversation._id, participantId);

    expect(messages).toHaveLength(1);
    const firstResult = messages[0] as Record<string, unknown>;
    expect(firstResult.save).toBeUndefined();
    expect(firstResult.$isDefault).toBeUndefined();
  });
});

describe('deleteMessage service', () => {
  it('allows message author to soft delete their own message', async () => {
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

    const message = await Message.create({
      conversationId: conversation._id,
      senderId: authorId,
      text: 'Ice cream machine is operational again',
      isSystem: false,
    });

    const result = await deleteMessage(message._id, authorId);

    expect(result._id.toString()).toBe(message._id.toString());
    expect(result.removedAt).toBeDefined();
    expect(result.removedBy?.toString()).toBe(authorId.toString());
    expect((result as Record<string, unknown>).save).toBeUndefined();

    const persisted = await Message.findById(message._id).lean().exec();
    expect(persisted?.removedAt).toBeDefined();
    expect(persisted?.removedBy?.toString()).toBe(authorId.toString());
  });

  it('preserves original removedAt timestamp on repeated deletion calls', async () => {
    const conversation = await Conversation.create({
      type: ConversationType.GROUP,
      title: 'Chicken Tender Thursday Enthusiasts',
    });
    const authorId = new Types.ObjectId();
    await ConversationParticipant.create({
      conversationId: conversation._id,
      userId: authorId,
      permission: ParticipantPermission.WRITE,
    });

    const message = await Message.create({
      conversationId: conversation._id,
      senderId: authorId,
      text: 'Original tender announcement',
      isSystem: false,
    });

    const firstResult = await deleteMessage(message._id, authorId);
    const initialTimestamp = firstResult.removedAt;

    const secondResult = await deleteMessage(message._id, authorId);
    expect(secondResult.removedAt).toEqual(initialTimestamp);
  });

  it('allows conversation moderator to soft delete another member message', async () => {
    const conversation = await Conversation.create({
      type: ConversationType.GROUP,
      title: 'Chicken Tender Thursday Enthusiasts',
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
      text: 'Out of stock at the food court',
      isSystem: false,
    });

    const result = await deleteMessage(message._id, moderatorId);

    expect(result._id.toString()).toBe(message._id.toString());
    expect(result.removedAt).toBeDefined();
    expect(result.removedBy?.toString()).toBe(moderatorId.toString());
  });

  it('rejects deletion when requesting user is a non moderator participant', async () => {
    const conversation = await Conversation.create({
      type: ConversationType.GROUP,
      title: 'Gator Corner Soft Serve Repair Crew',
    });
    const authorId = new Types.ObjectId();
    const standardMemberId = new Types.ObjectId();

    await ConversationParticipant.create({
      conversationId: conversation._id,
      userId: authorId,
      permission: ParticipantPermission.WRITE,
    });
    await ConversationParticipant.create({
      conversationId: conversation._id,
      userId: standardMemberId,
      permission: ParticipantPermission.WRITE,
    });

    const message = await Message.create({
      conversationId: conversation._id,
      senderId: authorId,
      text: 'Routine maintenance schedule update',
      isSystem: false,
    });

    await expect(
      deleteMessage(message._id, standardMemberId)
    ).rejects.toThrow('User is not authorized to delete this message');
  });

  it('rejects deletion when requesting user is not a conversation participant', async () => {
    const conversation = await Conversation.create({
      type: ConversationType.GROUP,
      title: 'Gator Corner Soft Serve Repair Crew',
    });
    const authorId = new Types.ObjectId();
    const outsiderId = new Types.ObjectId();

    await ConversationParticipant.create({
      conversationId: conversation._id,
      userId: authorId,
      permission: ParticipantPermission.WRITE,
    });

    const message = await Message.create({
      conversationId: conversation._id,
      senderId: authorId,
      text: 'Private crew chatter',
      isSystem: false,
    });

    await expect(
      deleteMessage(message._id, outsiderId)
    ).rejects.toThrow('User is not authorized to delete this message');
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
      text: 'User joined conversation',
      isSystem: true,
    });

    await expect(
      deleteMessage(systemMessage._id, authorId)
    ).rejects.toThrow('System messages cannot be deleted');

    await expect(
      deleteMessage(systemMessage._id, moderatorId)
    ).rejects.toThrow('System messages cannot be deleted');
  });

  it('rejects invalid input parameters or missing message', async () => {
    const validId = new Types.ObjectId();
    const nonExistentMessageId = new Types.ObjectId();

    await expect(
      deleteMessage('', validId)
    ).rejects.toThrow('Valid messageId is required');

    await expect(
      deleteMessage('invalid-id', validId)
    ).rejects.toThrow('Valid messageId is required');

    await expect(
      deleteMessage(validId, '')
    ).rejects.toThrow('Valid requestingUserId is required');

    await expect(
      deleteMessage(validId, 'invalid-id')
    ).rejects.toThrow('Valid requestingUserId is required');

    await expect(
      deleteMessage(nonExistentMessageId, validId)
    ).rejects.toThrow('Message not found');
  });

  it('allows message deletion when valid hex string identifiers are provided', async () => {
    const conversation = await Conversation.create({
      type: ConversationType.GROUP,
      title: 'Chomp Streetwear Collective',
    });
    const authorId = new Types.ObjectId();
    await ConversationParticipant.create({
      conversationId: conversation._id,
      userId: authorId,
      permission: ParticipantPermission.WRITE,
    });

    const message = await Message.create({
      conversationId: conversation._id,
      senderId: authorId,
      text: 'Vintage gator jacket dropped',
      isSystem: false,
    });

    const result = await deleteMessage(
      message._id.toHexString(),
      authorId.toHexString()
    );

    expect(result._id.toString()).toBe(message._id.toString());
    expect(result.removedAt).toBeDefined();
    expect(result.removedBy?.toString()).toBe(authorId.toString());
  });

  it('rejects cross conversation moderator deletion attempts', async () => {
    const clubOne = await Conversation.create({
      type: ConversationType.GROUP,
      title: 'Gator Lettuce Eating Club',
    });
    const clubTwo = await Conversation.create({
      type: ConversationType.GROUP,
      title: 'Chomp Streetwear Collective',
    });

    const authorId = new Types.ObjectId();
    const clubTwoModeratorId = new Types.ObjectId();

    await ConversationParticipant.create({
      conversationId: clubOne._id,
      userId: authorId,
      permission: ParticipantPermission.WRITE,
    });
    await ConversationParticipant.create({
      conversationId: clubTwo._id,
      userId: clubTwoModeratorId,
      permission: ParticipantPermission.MODERATE,
    });

    const message = await Message.create({
      conversationId: clubOne._id,
      senderId: authorId,
      text: 'Iceberg lettuce round completed',
      isSystem: false,
    });

    await expect(
      deleteMessage(message._id, clubTwoModeratorId)
    ).rejects.toThrow('User is not authorized to delete this message');
  });

  it('rejects unauthorized deletion attempts even when message is already deleted', async () => {
    const conversation = await Conversation.create({
      type: ConversationType.GROUP,
      title: 'Chomp Streetwear Collective',
    });
    const authorId = new Types.ObjectId();
    const outsiderId = new Types.ObjectId();

    await ConversationParticipant.create({
      conversationId: conversation._id,
      userId: authorId,
      permission: ParticipantPermission.WRITE,
    });

    const message = await Message.create({
      conversationId: conversation._id,
      senderId: authorId,
      text: 'Limited drop sold out',
      isSystem: false,
    });

    await deleteMessage(message._id, authorId);

    await expect(
      deleteMessage(message._id, outsiderId)
    ).rejects.toThrow('User is not authorized to delete this message');
  });
});


