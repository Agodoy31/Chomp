import {
  IConversationFeedItem,
  IConversationFeedResponse,
} from '../interfaces/conversation.interfaces';

export function toConversationFeedResponse(
  item: IConversationFeedItem
): IConversationFeedResponse {
  const response: IConversationFeedResponse = {
    _id: item._id.toString(),
    type: item.type,
    displayName: item.displayName,
    lastActivityAt: new Date(item.lastActivityAt).toISOString(),
  };

  if (item.clubId) {
    response.clubId = item.clubId.toString();
  }

  if (item.lastMessage) {
    const lastMessage: { text: string; senderName: string; createdAt?: string } = {
      text: item.lastMessage.text,
      senderName: item.lastMessage.senderName,
    };
    if (item.lastMessage.createdAt) {
      lastMessage.createdAt = new Date(item.lastMessage.createdAt).toISOString();
    }
    response.lastMessage = lastMessage;
  }

  return response;
}
