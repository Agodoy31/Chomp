import type { IMessage } from './Message';

export type ConversationType = 'DIRECT' | 'GROUP' | 'CHANNEL';

export type ParticipantPermission = 'READ' | 'WRITE' | 'MODERATE';

// Flattened participant details
export interface ConversationParticipant {
  _id: string;
  firstName: string;
  lastName: string;
  permission: ParticipantPermission;
}

export interface ChatUser {
  _id: string;
  firstName: string;
  lastName?: string;
  email?: string;
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
  title?: string; // Channel name or group title, in the case of a club its that name
  clubId?: string; // club channels name
  lastMessage?: ConversationLastMessage;

  // The above are fetched for all of the converstations a user is in
  // The below is only done so if the converstation is clicked on
  messages?: IMessage[];
  participants?: ConversationParticipant[];
}

export interface RawConversationParticipant {
  _id?: string;
  permission: ParticipantPermission;
  userId?: {
    _id: string;
    firstName: string;
    lastName: string;
  };
  firstName?: string;
  lastName?: string;
}

export interface RawConversationResponse {
  _id: string;
  type: ConversationType;
  displayName: string;
  title?: string;
  clubId?: string;
  lastActivityAt?: string;
  lastMessage?: ConversationLastMessage;
  participants?: RawConversationParticipant[];
}

export function flattenConversation(data: RawConversationResponse): Conversation {
  const conv: Conversation = {
    _id: String(data._id),
    type: data.type,
    displayName: data.displayName,
  };

  if (data.title !== undefined) {
    conv.title = data.title;
  }
  if (data.clubId !== undefined) {
    conv.clubId = String(data.clubId);
  }
  if (data.lastActivityAt !== undefined) {
    conv.lastActivityAt = data.lastActivityAt;
  }
  if (data.lastMessage !== undefined) {
    conv.lastMessage = data.lastMessage;
  }
  if (data.participants !== undefined) {
    conv.participants = data.participants.map((p) => ({
      _id: p.userId?._id ? String(p.userId._id) : String(p._id || ''),
      firstName: p.userId?.firstName ?? p.firstName ?? '',
      lastName: p.userId?.lastName ?? p.lastName ?? '',
      permission: p.permission,
    }));
  }

  return conv;
}
