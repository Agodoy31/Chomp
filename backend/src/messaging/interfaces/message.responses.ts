export interface IMessageResponse {
  _id: string;
  conversationId: string;
  senderId: string;
  text: string;
  clientId?: string;
  isAnnouncement: boolean;
  isSystem: boolean;
  createdAt: string;
  removedAt?: string;
}
