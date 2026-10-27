// Single message in a converstation
export interface Message {
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

// Data type that sends a new message
export interface SendMessagePayload {
  text: string;
  clientId?: string;
  isAnnouncement?: boolean;
}
