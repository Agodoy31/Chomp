import mongoose from 'mongoose';
import type { Socket } from 'socket.io';
import { ConversationParticipant } from '../models/ConversationParticipant';
import { getConversationRoom } from '../../socket/rooms';

function isValidPayload(payload: unknown): payload is { conversationId: string } {
  return (
    typeof payload === 'object' &&
    payload !== null &&
    !Array.isArray(payload) &&
    'conversationId' in payload &&
    typeof payload.conversationId === 'string' &&
    mongoose.isObjectIdOrHexString(payload.conversationId)
  );
}

export function registerConversationSocketHandlers(socket: Socket): void {
  socket.on('chat:join_room', async (payload: unknown, ack?: unknown) => {
    if (typeof ack !== 'function') {
      return;
    }

    if (!isValidPayload(payload)) {
      ack({
        ok: false,
        code: 'ERR_VALIDATION_FAILED',
        message: 'Valid conversationId is required',
      });
      return;
    }

    const userId = socket.request.session?.userId;
    if (typeof userId !== 'string' || !mongoose.isObjectIdOrHexString(userId)) {
      ack({
        ok: false,
        code: 'ERR_AUTHENTICATION_REQUIRED',
        message: 'Authentication required',
      });
      return;
    }

    let participantExists: unknown;
    try {
      participantExists = await ConversationParticipant.exists({
        conversationId: payload.conversationId,
        userId,
      });
    } catch {
      ack({
        ok: false,
        code: 'ERR_INTERNAL',
        message: 'An unexpected error occurred',
      });
      return;
    }

    if (!participantExists) {
      ack({
        ok: false,
        code: 'ERR_CONVERSATION_NOT_FOUND',
        message: 'Conversation not found',
      });
      return;
    }

    try {
      await socket.join(getConversationRoom(payload.conversationId));
    } catch {
      ack({
        ok: false,
        code: 'ERR_INTERNAL',
        message: 'An unexpected error occurred',
      });
      return;
    }

    ack({
      ok: true,
      conversationId: payload.conversationId,
    });
  });

  socket.on('chat:leave_room', async (payload: unknown, ack?: unknown) => {
    if (!isValidPayload(payload)) {
      if (typeof ack === 'function') {
        ack({
          ok: false,
          code: 'ERR_VALIDATION_FAILED',
          message: 'Valid conversationId is required',
        });
      }
      return;
    }

    try {
      await socket.leave(getConversationRoom(payload.conversationId));
    } catch (error) {
      console.error('Failed to leave conversation room:', error);
      return;
    }

    if (typeof ack === 'function') {
      ack({
        ok: true,
        conversationId: payload.conversationId,
      });
    }
  });
}
