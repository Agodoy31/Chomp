import type {
  ConversationDetails,
  ConversationFeedItem,
  UserSummary,
} from '../types/Messaging/Conversation';
import type { IMessage } from '../types/Messaging/Message';

type ApiError = Error & { status?: number };

function createApiError(message: string, status: number): ApiError {
  if (status === 401) {
    window.dispatchEvent(new Event('auth:unauthorized'));
  }
  return Object.assign(new Error(message), { status });
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
    const errMessage = await parseApiErrorMessage(
      response,
      `Failed to fetch conversations: ${response.status}`
    );
    throw createApiError(errMessage, response.status);
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
    const errMessage = await parseApiErrorMessage(
      response,
      `Failed to fetch conversation details: ${response.status}`
    );
    throw createApiError(errMessage, response.status);
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
    const errMessage = await parseApiErrorMessage(
      response,
      `Failed to fetch messages: ${response.status}`
    );
    throw createApiError(errMessage, response.status);
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
  text: string,
  isAnnouncement = false,
  clientId?: string
): Promise<IMessage> {
  const response = await fetch(
    `/api/conversations/${conversationId}/messages`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify(
        clientId ? { text, isAnnouncement, clientId } : { text, isAnnouncement }
      ),
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
    const errMessage = await parseApiErrorMessage(
      response,
      `The server did not respond with users: ${response.status}`
    );
    throw createApiError(errMessage, response.status);
  }

  return response.json();
}

/**
 * Updates the title of a group conversation.
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
 * Fetches the signed-in user's approved clubs so channel rows can display club names.
 * Endpoint: GET /api/clubs/me
 */
export async function fetchMyClubNames(): Promise<Record<string, string>> {
  const response = await fetch('/api/clubs/me', {
    credentials: 'include',
  });

  if (!response.ok) {
    const errMessage = await parseApiErrorMessage(
      response,
      `Failed to fetch clubs: ${response.status}`
    );
    throw createApiError(errMessage, response.status);
  }

  const data: { clubs?: Array<{ _id: string; name: string }> } =
    await response.json();
  if (!Array.isArray(data?.clubs)) return {};
  return Object.fromEntries(data.clubs.map((club) => [club._id, club.name]));
}
