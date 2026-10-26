import { IMessage } from '../interfaces/message.interfaces';
import { IMessageResponse } from '../interfaces/message.responses';

export function toMessageResponse(message: IMessage): IMessageResponse {
  const response: IMessageResponse = {
    _id: message._id.toString(),
    conversationId: message.conversationId.toString(),
    senderId: message.senderId.toString(),
    text: message.removedAt ? 'This message was deleted' : message.text,
    isAnnouncement: message.isAnnouncement,
    isSystem: message.isSystem,
    createdAt: message.createdAt.toISOString(),
  };

  if (message.clientId) {
    response.clientId = message.clientId;
  }

  if (message.removedAt) {
    response.removedAt = message.removedAt.toISOString();
  }

  return response;
}
