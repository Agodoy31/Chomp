import { io, type Socket } from 'socket.io-client';
import type {
  ConversationFeedItem,
  ConversationParticipant,
} from '../types/Messaging/Conversation';
import type { IMessage } from '../types/Messaging/Message';

export type JoinConversationRoomErrorCode =
  | 'ERR_VALIDATION_FAILED'
  | 'ERR_CONVERSATION_NOT_FOUND'
  | 'ERR_AUTHENTICATION_REQUIRED'
  | 'ERR_INTERNAL';

export type JoinConversationRoomAck =
  | { ok: true; conversationId: string }
  | { ok: false; code: JoinConversationRoomErrorCode; message: string };

export type LeaveConversationRoomAck =
  | { ok: true; conversationId: string }
  | { ok: false; code: 'ERR_VALIDATION_FAILED'; message: string };

export interface ConversationRenamedPayload {
  conversationId: string;
  title: string;
}

export interface ParticipantAddedPayload {
  conversationId: string;
  participants: ConversationParticipant[];
}

export interface ParticipantRemovedPayload {
  conversationId: string;
  userId: string;
}

export interface InboxConversationAddedPayload {
  conversationId: string;
  conversation: ConversationFeedItem;
}

export interface InboxConversationRemovedPayload {
  conversationId: string;
}

export interface ClientToServerEvents {
  'chat:join_room': (
    payload: { conversationId: string },
    ack: (result: JoinConversationRoomAck) => void
  ) => void;
  'chat:leave_room': (
    payload: { conversationId: string },
    ack?: (result: LeaveConversationRoomAck) => void
  ) => void;
}

export interface ServerToClientEvents {
  'message:created': (payload: IMessage) => void;
  'message:deleted': (payload: IMessage) => void;
  'conversation:renamed': (payload: ConversationRenamedPayload) => void;
  'participant:added': (payload: ParticipantAddedPayload) => void;
  'participant:removed': (payload: ParticipantRemovedPayload) => void;
  'inbox:conversation_added': (payload: InboxConversationAddedPayload) => void;
  'inbox:conversation_removed': (
    payload: InboxConversationRemovedPayload
  ) => void;
}

export type MessagingSocket = Socket<
  ServerToClientEvents,
  ClientToServerEvents
>;

// Max simultaneous chat:join_room requests so large conversation lists don't flood the server
const JOIN_CONCURRENCY = 10;

let socket: MessagingSocket | null = null;
const desiredRooms = new Set<string>();
const joinedRooms = new Set<string>();
const inFlightJoins = new Set<string>();
const failedRooms = new Set<string>();
let priorityRoom: string | null = null;
let connectionEpoch = 0;

function resetConnectionRoomState() {
  connectionEpoch += 1;
  joinedRooms.clear();
  inFlightJoins.clear();
  failedRooms.clear();
}

function nextRoomToJoin(): string | null {
  if (
    priorityRoom &&
    desiredRooms.has(priorityRoom) &&
    !joinedRooms.has(priorityRoom) &&
    !inFlightJoins.has(priorityRoom) &&
    !failedRooms.has(priorityRoom)
  ) {
    return priorityRoom;
  }

  for (const id of desiredRooms) {
    if (
      !joinedRooms.has(id) &&
      !inFlightJoins.has(id) &&
      !failedRooms.has(id)
    ) {
      return id;
    }
  }

  return null;
}

function pumpJoinQueue() {
  if (!socket?.connected) {
    return;
  }

  while (inFlightJoins.size < JOIN_CONCURRENCY) {
    const conversationId = nextRoomToJoin();
    if (!conversationId) {
      return;
    }

    inFlightJoins.add(conversationId);
    const epoch = connectionEpoch;

    socket.emit('chat:join_room', { conversationId }, (ack) => {
      inFlightJoins.delete(conversationId);

      if (epoch !== connectionEpoch) {
        pumpJoinQueue();
        return;
      }

      if (ack?.ok) {
        if (desiredRooms.has(conversationId)) {
          joinedRooms.add(conversationId);
        } else if (socket?.connected) {
          socket.emit('chat:leave_room', { conversationId });
        }
      } else if (ack?.code === 'ERR_AUTHENTICATION_REQUIRED') {
        disconnectMessagingSocket();
        window.dispatchEvent(new Event('auth:unauthorized'));
        return;
      } else {
        failedRooms.add(conversationId);
      }

      pumpJoinQueue();
    });
  }
}

export function getMessagingSocket(): MessagingSocket {
  if (!socket) {
    socket = io({
      withCredentials: true,
      autoConnect: false,
    });

    socket.on('connect', () => {
      resetConnectionRoomState();
      pumpJoinQueue();
    });

    socket.on('disconnect', () => {
      resetConnectionRoomState();
    });

    socket.on('connect_error', (err) => {
      if (err.message === 'ERR_AUTHENTICATION_REQUIRED') {
        disconnectMessagingSocket();
        window.dispatchEvent(new Event('auth:unauthorized'));
      }
    });
  }

  return socket;
}

export function connectMessagingSocket(): MessagingSocket {
  const client = getMessagingSocket();
  if (!client.connected) {
    client.connect();
  } else {
    pumpJoinQueue();
  }
  return client;
}

export function disconnectMessagingSocket(): void {
  desiredRooms.clear();
  priorityRoom = null;
  resetConnectionRoomState();
  socket?.disconnect();
}

/**
 * Syncs Socket.IO room memberships with the user's current conversation list.
 * Joins the active conversation first and queues remaining rooms with bounded concurrency.
 */
export function syncConversationRooms(
  conversationIds: string[],
  activeConversationId: string | null
): void {
  const nextDesired = new Set(conversationIds);
  if (activeConversationId) {
    nextDesired.add(activeConversationId);
  }
  priorityRoom = activeConversationId;

  for (const id of [...desiredRooms]) {
    if (!nextDesired.has(id)) {
      desiredRooms.delete(id);
      failedRooms.delete(id);
      if (joinedRooms.delete(id) && socket?.connected) {
        socket.emit('chat:leave_room', { conversationId: id });
      }
    }
  }

  for (const id of nextDesired) {
    desiredRooms.add(id);
  }

  pumpJoinQueue();
}
