import type { Server } from 'socket.io';
import type { IMessage } from '../interfaces/message.interfaces';
import type {
  IConversationParticipantSummary,
  IConversationFeedResponse,
} from '../interfaces/conversation.interfaces';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
} from '../interfaces/messaging.events';
import { getIO, evictUserFromRoom } from '../../socket/socketServer';
import { getConversationRoom, getUserRoom } from '../../socket/rooms';
import { toMessageResponse } from '../serializers/messageResponse';

export const messagingPublisher = {
  messageCreated(message: IMessage): void {
    const io: Server<ClientToServerEvents, ServerToClientEvents> | null =
      getIO() as Server<ClientToServerEvents, ServerToClientEvents> | null;
    if (!io) {
      return;
    }
    const conversationRoom = getConversationRoom(message.conversationId.toString());
    io.to(conversationRoom).emit('message:created', toMessageResponse(message));
  },

  messageDeleted(message: IMessage): void {
    const io: Server<ClientToServerEvents, ServerToClientEvents> | null =
      getIO() as Server<ClientToServerEvents, ServerToClientEvents> | null;
    if (!io) {
      return;
    }
    const conversationRoom = getConversationRoom(message.conversationId.toString());
    io.to(conversationRoom).emit('message:deleted', toMessageResponse(message));
  },

  conversationRenamed(conversationId: string, title: string): void {
    const io: Server<ClientToServerEvents, ServerToClientEvents> | null =
      getIO() as Server<ClientToServerEvents, ServerToClientEvents> | null;
    if (!io) {
      return;
    }
    io.to(getConversationRoom(conversationId)).emit('conversation:renamed', {
      conversationId,
      title,
    });
  },

  conversationAdded(userId: string, conversation: IConversationFeedResponse): void {
    const io: Server<ClientToServerEvents, ServerToClientEvents> | null =
      getIO() as Server<ClientToServerEvents, ServerToClientEvents> | null;
    if (!io) {
      return;
    }
    const userRoom = getUserRoom(userId);
    io.to(userRoom).emit('inbox:conversation_added', {
      conversationId: conversation._id,
      conversation,
    });
  },

  participantAdded(
    conversationId: string,
    participants: IConversationParticipantSummary[]
  ): void {
    const io: Server<ClientToServerEvents, ServerToClientEvents> | null =
      getIO() as Server<ClientToServerEvents, ServerToClientEvents> | null;
    if (!io) {
      return;
    }
    io.to(getConversationRoom(conversationId)).emit('participant:added', {
      conversationId,
      participants,
    });
  },

  evictUserFromConversation(conversationId: string, userId: string): void {
    const conversationRoom = getConversationRoom(conversationId);
    evictUserFromRoom(userId, conversationRoom);
  },

  participantRemoved(conversationId: string, userId: string): void {
    const io: Server<ClientToServerEvents, ServerToClientEvents> | null =
      getIO() as Server<ClientToServerEvents, ServerToClientEvents> | null;
    if (!io) {
      return;
    }
    const conversationRoom = getConversationRoom(conversationId);
    evictUserFromRoom(userId, conversationRoom);
    io.to(conversationRoom).emit('participant:removed', {
      conversationId,
      userId,
    });
    io.to(getUserRoom(userId)).emit('inbox:conversation_removed', {
      conversationId,
    });
  },
};
