import { Types } from 'mongoose';
import type { IMessage } from '../../src/messaging/interfaces/message.interfaces';
import { getConversationRoom, getUserRoom } from '../../src/socket/rooms';
import { toMessageResponse } from '../../src/messaging/serializers/messageResponse';

test('uses stable personal and canonical conversation rooms', () => {
  expect(getUserRoom('507f1f77bcf86cd799439011'))
    .toBe('user:507f1f77bcf86cd799439011');
  expect(getConversationRoom('507f1f77bcf86cd799439012'))
    .toBe('conversation:507f1f77bcf86cd799439012');
});

test('preserves message fields and redacts deleted text', () => {
  const date = new Date('2026-11-05T12:00:00.000Z');
  const message: IMessage = {
    _id: new Types.ObjectId('507f1f77bcf86cd799439013'),
    conversationId: new Types.ObjectId('507f1f77bcf86cd799439012'),
    senderId: new Types.ObjectId('507f1f77bcf86cd799439011'),
    text: 'Danny reserved a room in Marston',
    isAnnouncement: false, isSystem: false, createdAt: date, updatedAt: date,
  };
  const expected = {
    _id: '507f1f77bcf86cd799439013',
    conversationId: '507f1f77bcf86cd799439012',
    senderId: '507f1f77bcf86cd799439011',
    text: message.text, isAnnouncement: false, isSystem: false,
    createdAt: date.toISOString(),
  };
  expect(toMessageResponse(message)).toEqual(expected);
  const deleted = {
    ...message, clientId: '019a52ca-0000-7000-8000-000000000001',
    removedAt: date, removedBy: message.senderId,
  };
  expect(toMessageResponse(deleted)).toEqual({
    ...expected, text: 'This message was deleted',
    clientId: deleted.clientId, removedAt: date.toISOString(),
  });
  expect(deleted.text).toBe('Danny reserved a room in Marston');
  expect(toMessageResponse({ ...message, isAnnouncement: true, isSystem: true }))
    .toEqual({ ...expected, isAnnouncement: true, isSystem: true });
});
