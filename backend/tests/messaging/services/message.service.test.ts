import { describe, it, expect, beforeAll, afterEach, afterAll } from '@jest/globals';
import { Types } from 'mongoose';
import { connectTestDb, clearTestDb, closeTestDb } from '../../helpers/db';
import { Message } from '../../../src/messaging/models/Message';
import { Conversation, ConversationType } from '../../../src/messaging/models/Conversation';
import { ConversationParticipant, ParticipantPermission } from '../../../src/messaging/models/ConversationParticipant';
import { sendMessage } from '../../../src/messaging/services/message.service';

describe('sendMessage service', () => {
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
