// Single message in a conversation (matches backend IMessage interface)
export interface IMessage {
  _id: string;
  conversationId: string;
  senderId: string;
  text: string;
  isAnnouncement: boolean;
  isSystem: boolean;
  clientId?: string;
  createdAt: string;
  updatedAt?: string;
  removedAt?: string; // If deleted text will be "This message was deleted"
}

// Aliases for compatibility
export type MessageI = IMessage;
export type Message = IMessage;

// Data type that sends a new message
export interface SendMessagePayload {
  text: string;
  clientId?: string;
  isAnnouncement?: boolean;
}
