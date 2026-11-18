import type {
  ConversationDetails,
  ConversationFeedItem,
  ConversationParticipant,
  ParticipantPermission,
  UserSummary,
} from '../types/Messaging/Conversation';
import type { IMessage } from '../types/Messaging/Message';

type ApiError = Error & { status?: number };

function createApiError(message: string, status: number): ApiError {
  return Object.assign(new Error(message), { status });
}

export function isUnauthorizedError(err: unknown): boolean {
  return err instanceof Error && (err as ApiError).status === 401;
}

async function parseApiErrorMessage(
  response: Response,
  fallback: string
): Promise<string> {
  const errBody = await response.json().catch(() => null);
  return (
    (typeof errBody?.message === 'string' && errBody.message) ||
    (typeof errBody?.error === 'string' && errBody.error) ||
    fallback
  );
}

export type CreateConversationPayload =
  | {
      type: 'DIRECT';
      recipientId: string;
    }
  | {
      type: 'GROUP';
      title: string;
      participantIds: string[];
    };

/**
 * Fetches the user's active conversations feed.
 * Endpoint: GET /api/conversations
 */
export async function fetchConversations(): Promise<ConversationFeedItem[]> {
  const response = await fetch('/api/conversations', {
    credentials: 'include',
  });

  if (!response.ok) {
    throw createApiError(
      `Failed to fetch conversations: ${response.status}`,
      response.status
    );
  }

  const data: ConversationFeedItem[] = await response.json();
  return Array.isArray(data) ? data : [];
}

/**
 * Fetches the full details and participants for a conversation.
 * Endpoint: GET /api/conversations/:id
 */
export async function fetchConversationDetails(
  conversationId: string
): Promise<ConversationDetails> {
  const response = await fetch(`/api/conversations/${conversationId}`, {
    credentials: 'include',
  });

  if (!response.ok) {
    throw createApiError(
      `Failed to fetch conversation details: ${response.status}`,
      response.status
    );
  }

  return response.json();
}

/**
 * Fetches the message history for a conversation.
 * Endpoint: GET /api/conversations/:id/messages
 */
export async function fetchMessages(
  conversationId: string
): Promise<IMessage[]> {
  const response = await fetch(
    `/api/conversations/${conversationId}/messages`,
    {
      credentials: 'include',
    }
  );

  if (!response.ok) {
    throw createApiError(
      `Failed to fetch messages: ${response.status}`,
      response.status
    );
  }

  const data: IMessage[] = await response.json();
  // Backend returns newest first; reverse for chronological chat feed
  return [...data].reverse();
}

/**
 * Sends a message in a conversation.
 * Endpoint: POST /api/conversations/:id/messages
 */
export async function postMessage(
  conversationId: string,
  text: string
): Promise<IMessage> {
  const response = await fetch(
    `/api/conversations/${conversationId}/messages`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({ text }),
    }
  );

  if (!response.ok) {
    const errMessage = await parseApiErrorMessage(
      response,
      `Failed to send message: ${response.status}`
    );
    throw createApiError(errMessage, response.status);
  }

  return response.json();
}

/**
 * Creates a new direct or group conversation.
 * Endpoint: POST /api/conversations
 */
export async function createConversation(
  payload: CreateConversationPayload
): Promise<ConversationDetails> {
  const response = await fetch('/api/conversations', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include',
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errMessage = await parseApiErrorMessage(
      response,
      `Failed to create conversation: ${response.status}`
    );
    throw createApiError(errMessage, response.status);
  }

  return response.json();
}

/**
 * Searches users from the server.
 * Endpoint: GET /api/users/search?search=...
 */
export async function searchUsers(
  search: string,
  signal?: AbortSignal
): Promise<UserSummary[]> {
  const trimmed = search.trim();
  if (!trimmed) {
    return [];
  }

  const params = new URLSearchParams({ search: trimmed });
  const response = await fetch(`/api/users/search?${params.toString()}`, {
    credentials: 'include',
    signal,
  });

  if (!response.ok) {
    throw new Error(`The server did not respond with users: ${response.status}`);
  }

  return response.json();
}

/**
 * Adds participants to an existing conversation.
 * Endpoint: POST /api/conversations/:id/participants
 */
export async function addParticipantsToConversation(
  conversationId: string,
  userIds: string[]
): Promise<ConversationParticipant[]> {
  const response = await fetch(
    `/api/conversations/${conversationId}/participants`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({ userIds }),
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to add participants: ${response.status}`);
  }

  return response.json();
}

/**
 * Updates the title of a group or channel conversation.
 * Endpoint: PATCH /api/conversations/:id
 */
export async function updateConversationTitle(
  conversationId: string,
  title: string
): Promise<void> {
  const response = await fetch(`/api/conversations/${conversationId}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include',
    body: JSON.stringify({ title }),
  });

  if (!response.ok) {
    const errMessage = await parseApiErrorMessage(
      response,
      `Failed to update conversation title: ${response.status}`
    );
    throw createApiError(errMessage, response.status);
  }
}

/**
 * Updates a participant's permission in a conversation.
 * Endpoint: PATCH /api/conversations/:id/participants/:userId
 */
export async function updateParticipantPermission(
  conversationId: string,
  userId: string,
  permission: ParticipantPermission
): Promise<ConversationParticipant> {
  const response = await fetch(
    `/api/conversations/${conversationId}/participants/${userId}`,
    {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({ permission }),
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to update permission: ${response.status}`);
  }

  return response.json();
}

/**
 * Removes a participant from a conversation.
 * Endpoint: DELETE /api/conversations/:id/participants/:userId
 */
export async function removeParticipantFromConversation(
  conversationId: string,
  userId: string
): Promise<void> {
  const response = await fetch(
    `/api/conversations/${conversationId}/participants/${userId}`,
    {
      method: 'DELETE',
      credentials: 'include',
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to remove participant: ${response.status}`);
  }
}

/**
 * Soft deletes a message in a conversation.
 * Endpoint: DELETE /api/conversations/:id/messages/:messageId
 */
export async function deleteMessage(
  conversationId: string,
  messageId: string
): Promise<IMessage> {
  const response = await fetch(
    `/api/conversations/${conversationId}/messages/${messageId}`,
    {
      method: 'DELETE',
      credentials: 'include',
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to delete message: ${response.status}`);
  }

  return response.json();
}

/**
 * Fetches the signed-in user's approved clubs so channel rows can display club names.
 * Endpoint: GET /api/clubs/me
 */
export async function fetchMyClubNames(): Promise<Record<string, string>> {
  const response = await fetch('/api/clubs/me', {
    credentials: 'include',
  });

  if (!response.ok) {
    throw createApiError(
      `Failed to fetch clubs: ${response.status}`,
      response.status
    );
  }

  const data: { clubs?: Array<{ _id: string; name: string }> } =
    await response.json();
  if (!Array.isArray(data?.clubs)) return {};
  return Object.fromEntries(data.clubs.map((club) => [club._id, club.name]));
}
