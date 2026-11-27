import { io, type Socket } from 'socket.io-client';
import type {
  ConversationDetails,
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

const socket: MessagingSocket = io({
  withCredentials: true,
  autoConnect: false,
});
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
  if (!socket.connected) {
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

      if (ack.ok) {
        if (desiredRooms.has(conversationId)) {
          joinedRooms.add(conversationId);
        } else if (socket.connected) {
          socket.emit('chat:leave_room', { conversationId });
        }
      } else if (ack.code === 'ERR_AUTHENTICATION_REQUIRED') {
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

export function getMessagingSocket(): MessagingSocket {
  return socket;
}

export function connectMessagingSocket(): MessagingSocket {
  if (!socket.connected) {
    socket.connect();
  } else {
    pumpJoinQueue();
  }
  return socket;
}

export function disconnectMessagingSocket(): void {
  desiredRooms.clear();
  priorityRoom = null;
  resetConnectionRoomState();
  socket.disconnect();
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
      if (joinedRooms.delete(id) && socket.connected) {
        socket.emit('chat:leave_room', { conversationId: id });
      }
    }
  }

  for (const id of nextDesired) {
    desiredRooms.add(id);
  }

  pumpJoinQueue();
}

export interface MessagingEventHandlers {
  onMessageCreated?: (payload: IMessage) => void;
  onMessageDeleted?: (payload: IMessage) => void;
  onConversationRenamed?: (payload: ConversationRenamedPayload) => void;
  onParticipantAdded?: (payload: ParticipantAddedPayload) => void;
  onParticipantRemoved?: (payload: ParticipantRemovedPayload) => void;
  onConversationAdded?: (payload: InboxConversationAddedPayload) => void;
  onConversationRemoved?: (payload: InboxConversationRemovedPayload) => void;
  onReconnect?: () => void;
}

export function subscribeMessagingEvents(
  handlers: MessagingEventHandlers
): () => void {
  if (handlers.onMessageCreated) {
    socket.on('message:created', handlers.onMessageCreated);
  }
  if (handlers.onMessageDeleted) {
    socket.on('message:deleted', handlers.onMessageDeleted);
  }
  if (handlers.onConversationRenamed) {
    socket.on('conversation:renamed', handlers.onConversationRenamed);
  }
  if (handlers.onParticipantAdded) {
    socket.on('participant:added', handlers.onParticipantAdded);
  }
  if (handlers.onParticipantRemoved) {
    socket.on('participant:removed', handlers.onParticipantRemoved);
  }
  if (handlers.onConversationAdded) {
    socket.on('inbox:conversation_added', handlers.onConversationAdded);
  }
  if (handlers.onConversationRemoved) {
    socket.on('inbox:conversation_removed', handlers.onConversationRemoved);
  }
  if (handlers.onReconnect) {
    socket.io.on('reconnect', handlers.onReconnect);
  }

  return () => {
    if (handlers.onMessageCreated) {
      socket.off('message:created', handlers.onMessageCreated);
    }
    if (handlers.onMessageDeleted) {
      socket.off('message:deleted', handlers.onMessageDeleted);
    }
    if (handlers.onConversationRenamed) {
      socket.off('conversation:renamed', handlers.onConversationRenamed);
    }
    if (handlers.onParticipantAdded) {
      socket.off('participant:added', handlers.onParticipantAdded);
    }
    if (handlers.onParticipantRemoved) {
      socket.off('participant:removed', handlers.onParticipantRemoved);
    }
    if (handlers.onConversationAdded) {
      socket.off('inbox:conversation_added', handlers.onConversationAdded);
    }
    if (handlers.onConversationRemoved) {
      socket.off('inbox:conversation_removed', handlers.onConversationRemoved);
    }
    if (handlers.onReconnect) {
      socket.io.off('reconnect', handlers.onReconnect);
    }
  };
}

export function subscribeConversationMessages(
  conversationId: string,
  handlers: {
    onMessage: (message: IMessage) => void;
    onReconnect?: () => void;
  }
): () => void {
  const handleMessage = (msg: IMessage) => {
    if (msg.conversationId === conversationId) {
      handlers.onMessage(msg);
    }
  };

  return subscribeMessagingEvents({
    onMessageCreated: handleMessage,
    onMessageDeleted: handleMessage,
    onReconnect: handlers.onReconnect,
  });
}

const getActivityTimestamp = (c: ConversationFeedItem) =>
  c.lastActivityAt ? Date.parse(c.lastActivityAt) : 0;

// Insert or update a feed row, keeping whichever preview is newer; newer rows move to the top
export function upsertConversationFeed(
  list: ConversationFeedItem[],
  incoming: ConversationFeedItem
): ConversationFeedItem[] {
  const existing = list.find((c) => c._id === incoming._id);
  if (
    existing &&
    getActivityTimestamp(existing) > getActivityTimestamp(incoming)
  ) {
    return list.map((c) =>
      c._id === incoming._id ? { ...incoming, ...existing } : c
    );
  }
  return [
    { ...existing, ...incoming },
    ...list.filter((c) => c._id !== incoming._id),
  ];
}

export function applyCreatedMessageToFeed(
  list: ConversationFeedItem[],
  msg: IMessage
): ConversationFeedItem[] {
  const existing = list.find((c) => c._id === msg.conversationId);
  if (!existing) return list;
  const senderName = msg.sender
    ? `${msg.sender.firstName} ${msg.sender.lastName}`.trim()
    : '';
  return upsertConversationFeed(list, {
    ...existing,
    lastActivityAt: msg.createdAt,
    lastMessage: {
      text: msg.text,
      senderName: senderName || 'Unknown',
      createdAt: msg.createdAt,
    },
  });
}

export function applyDeletedMessageToFeed(
  list: ConversationFeedItem[],
  msg: IMessage
): ConversationFeedItem[] {
  return list.map((c) =>
    c._id === msg.conversationId && c.lastMessage?.createdAt === msg.createdAt
      ? {
          ...c,
          lastMessage: {
            ...c.lastMessage,
            text: msg.text,
          },
        }
      : c
  );
}

export function applyConversationRenamedToFeed(
  list: ConversationFeedItem[],
  conversationId: string,
  title: string
): ConversationFeedItem[] {
  return list.map((c) =>
    c._id === conversationId ? { ...c, displayName: title } : c
  );
}

export function applyConversationRenamedToDetails(
  details: ConversationDetails | null,
  conversationId: string,
  title: string
): ConversationDetails | null {
  return details?._id === conversationId
    ? { ...details, displayName: title, title }
    : details;
}

export function applyParticipantAddedToDetails(
  details: ConversationDetails | null,
  { conversationId, participants }: ParticipantAddedPayload
): ConversationDetails | null {
  if (details?._id !== conversationId) return details;
  const byId = new Map(
    [...details.participants, ...participants].map((p) => [p.userId._id, p])
  );
  const merged = [...byId.values()].sort(
    (a, b) =>
      a.userId.firstName.localeCompare(b.userId.firstName) ||
      a.userId.lastName.localeCompare(b.userId.lastName)
  );
  return { ...details, participants: merged };
}

export function applyParticipantRemovedToDetails(
  details: ConversationDetails | null,
  { conversationId, userId }: ParticipantRemovedPayload
): ConversationDetails | null {
  if (details?._id !== conversationId) return details;
  return {
    ...details,
    participants: details.participants.filter((p) => p.userId._id !== userId),
  };
}
