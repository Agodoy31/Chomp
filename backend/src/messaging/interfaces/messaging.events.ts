import type { IMessageResponse } from './message.responses';
import type { IConversationParticipantSummary } from './conversation.interfaces';

export interface JoinConversationRoomPayload {
  conversationId: string;
}

export type JoinConversationRoomErrorCode =
  | 'ERR_VALIDATION_FAILED'
  | 'ERR_CONVERSATION_NOT_FOUND'
  | 'ERR_AUTHENTICATION_REQUIRED'
  | 'ERR_INTERNAL';

export type JoinConversationRoomAck =
  | { ok: true; conversationId: string }
  | { ok: false; code: JoinConversationRoomErrorCode; message: string };

export interface LeaveConversationRoomPayload {
  conversationId: string;
}

export type LeaveConversationRoomAck =
  | { ok: true; conversationId: string }
  | { ok: false; code: 'ERR_VALIDATION_FAILED'; message: string };

export type NewMessageBroadcastPayload = IMessageResponse;
export type DeletedMessageBroadcastPayload = IMessageResponse;

export interface ConversationRenamedBroadcastPayload {
  conversationId: string;
  title: string;
}

export interface ParticipantAddedBroadcastPayload {
  conversationId: string;
  participants: IConversationParticipantSummary[];
}

export interface ParticipantRemovedBroadcastPayload {
  conversationId: string;
  userId: string;
}

export interface InboxConversationAddedPayload {
  conversationId: string;
}

export interface InboxConversationRemovedPayload {
  conversationId: string;
}

export interface ClientToServerEvents {
  'chat:join_room': (
    payload: JoinConversationRoomPayload,
    ack: (result: JoinConversationRoomAck) => void
  ) => void;
  'chat:leave_room': (
    payload: LeaveConversationRoomPayload,
    ack?: (result: LeaveConversationRoomAck) => void
  ) => void;
}

export interface ServerToClientEvents {
  'message:created': (payload: NewMessageBroadcastPayload) => void;
  'message:deleted': (payload: DeletedMessageBroadcastPayload) => void;
  'conversation:renamed': (payload: ConversationRenamedBroadcastPayload) => void;
  'participant:added': (payload: ParticipantAddedBroadcastPayload) => void;
  'participant:removed': (payload: ParticipantRemovedBroadcastPayload) => void;
  'inbox:conversation_added': (payload: InboxConversationAddedPayload) => void;
  'inbox:conversation_removed': (payload: InboxConversationRemovedPayload) => void;
}
