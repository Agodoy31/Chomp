export interface Channel {
  _id: string;
  clubId: string;
  name: string;
}

export interface CreateChannelPayload {
  name: string;
}

export interface RenameChannelPayload {
  name: string;
}

type ApiError = Error & { status?: number; code?: string };

function createApiError(message: string, status: number, code?: string): ApiError {
  return Object.assign(new Error(message), { status, code });
}

export function isUnauthorizedError(err: unknown): boolean {
  return err instanceof Error && (err as ApiError).status === 401;
}

async function readJson(response: Response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

/**
 * Creates a new channel for a club
 * Endpoint: POST /api/clubs/:clubId/channels
 */
export async function createChannel(
  clubId: string,
  payload: CreateChannelPayload
): Promise<Channel> {
  const response = await fetch(`/api/clubs/${encodeURIComponent(clubId)}/channels`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(payload),
  });

  const data = await readJson(response);
  if (!response.ok) {
    if (data?.code === 'ERR_REQUIRE_AUTH') {
      throw createApiError(
        data?.message || 'Your session has expired. Please log in again.',
        response.status,
        'ERR_REQUIRE_AUTH',
      );
    }
  
    const message = data?.message || data?.error || 'Failed to create channel.';
  throw createApiError(message, response.status, data?.code);
  }
  if (!data?.channel) {
    throw createApiError(
      data?.message || 'Could not create channel. Please try again.',
      response.status,
      data?.code,
    );
  }

  return data.channel;

}

/**
 * Renames an existing channel in a club
 * Endpoint: PATCH /api/clubs/:clubId/channels/:channelId
 */
export async function renameChannel(
  clubId: string,
  channelId: string,
  payload: RenameChannelPayload
): Promise<Channel> {
  const response = await fetch(
    `/api/clubs/${encodeURIComponent(clubId)}/channels/${encodeURIComponent(channelId)}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(payload),
    }
  );
  const data = await readJson(response);

  if (!response.ok) {
    if (data?.code === 'ERR_REQUIRE_AUTH') {
      throw createApiError(
        data?.message || 'Your session has expired. Please log in again.',
        response.status,
        'ERR_REQUIRE_AUTH',
      );
    }

    const message = data?.message || data?.error || 'Failed to rename channel.';
    throw createApiError(message, response.status, data?.code);
  }

  if (!data?.channel) {
    throw createApiError(
      data?.message || 'Could not rename channel. Please try again.',
      response.status,
      data?.code,
    );
  }

  return data.channel
}
