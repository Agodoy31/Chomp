export interface MessageSender {
  _id: string;
  firstName: string;
  lastName: string;
}

// Single message in a conversation (matches backend IMessageResponse interface)
export interface IMessage {
  _id: string;
  conversationId: string;
  sender: MessageSender;
  text: string;
  isAnnouncement: boolean;
  isSystem: boolean;
  clientId?: string;
  createdAt: string;
  updatedAt?: string;
  removedAt?: string; // If deleted text will be "This message was deleted"
}

// Data type that sends a new message
export interface SendMessagePayload {
  text: string;
  clientId?: string;
  isAnnouncement?: boolean;
}
