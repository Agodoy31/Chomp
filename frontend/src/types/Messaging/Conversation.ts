export type ConversationType = 'DIRECT' | 'GROUP' | 'CHANNEL';

export type ParticipantPermission = 'READ' | 'WRITE' | 'MODERATE';

export interface UserSummary {
  _id: string;
  firstName: string;
  lastName: string;
  email?: string;
}

export interface ConversationParticipant {
  userId: UserSummary;
  permission: ParticipantPermission;
}

// The most recent message displayed in the sidebar
export interface ConversationLastMessage {
  text: string;
  senderName: string;
  createdAt?: string;
}

// Returned by GET /api/conversations
export interface ConversationFeedItem {
  _id: string;
  type: ConversationType;
  displayName: string;
  lastActivityAt: string;
  clubId?: string;
  clubName?: string;
  lastMessage?: ConversationLastMessage;
}

// Returned by GET /api/conversations/:id and POST /api/conversations
export interface ConversationDetails {
  _id: string;
  type: ConversationType;
  displayName: string;
  title?: string;
  clubId?: string;
  clubName?: string;
  participants: ConversationParticipant[];
}
