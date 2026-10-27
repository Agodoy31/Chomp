import { Message } from './Message';

export type ConversationType = 'DIRECT' | 'GROUP' | 'CHANNEL';

export type ParticipantPermission = 'READ' | 'WRITE' | 'MODERATE';

// Flattened participant details
export interface ConversationParticipant {
  _id: string; // User's ID
  firstName: string;
  lastName: string;
  permission: ParticipantPermission;
}

// The most recent message displayed in the sidebar
export interface ConversationLastMessage {
  text: string;
  senderName: string;
  createdAt?: string;
}

export interface Conversation {
  _id: string;
  type: ConversationType;
  displayName: string;
  lastActivityAt?: string;
  title?: string; // Channel name or group title
  clubId?: string; // Present for club channels
  lastMessage?: ConversationLastMessage;

  // The above are fetched for all of the converstations a user is in
  // The below is only done so if the converstation is clicked on
  messages?: Message[];
  participants?: ConversationParticipant[];
}
