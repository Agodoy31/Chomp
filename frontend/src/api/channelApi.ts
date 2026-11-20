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

/**
 * Creates a new channel for a club
 * Endpoint: POST /api/clubs/:clubId/channels
 */
export async function createChannel(
  clubId: string,
  payload: CreateChannelPayload
): Promise<Channel> {
  const response = await fetch(`/api/clubs/${clubId}/channels`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(payload),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.message || data.error || 'Failed to create channel.');
  }

  return data.channel ?? data;
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

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.message || data.error || 'Failed to rename channel.');
  }

  return data.channel ?? data;
}
