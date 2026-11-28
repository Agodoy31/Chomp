import type { Club, ClubCategory, ClubChannel, ClubDetails, ClubMember } from '../types/club';

export interface Channel {
  _id: string;
  title: string;
}

export interface CreateChannelPayload {
  title: string;
}

export interface RenameChannelPayload {
  title: string;
}

export type UpdateClubPayload = {
  name?: string;
  description?: string;
  category?: ClubCategory;
  meeting?: Partial<NonNullable<Club['meeting']>> | Record<string, never>;
};

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

function clubUrl(clubId: string, suffix = ''): string {
  return `/api/clubs/${encodeURIComponent(clubId)}${suffix}`;
}

async function request(url: string, init?: RequestInit) {
  const response = await fetch(url, {
    credentials: 'include',
    ...init,
  });
  const data = await readJson(response);

  if (!response.ok) {
    const message = data?.message || 'Something went wrong. Please try again.';
    throw createApiError(message, response.status, data?.code);
  }

  return data;
}

/**
 * Approved clubs, sorted by name.
 * Endpoint: GET /api/clubs
 */
export async function getClubs(): Promise<Club[]> {
  const data = await request('/api/clubs');
  return data?.clubs ?? [];
}

/**
 * Club requests waiting for an admin.
 * Endpoint: GET /api/clubs/pending
 */
export async function getPendingClubs(): Promise<Club[]> {
  const data = await request('/api/clubs/pending');
  return data?.clubs ?? [];
}

/**
 * Approves a pending club request.
 * Endpoint: POST /api/clubs/:clubId/approve
 */
export async function approveClub(clubId: string): Promise<void> {
  await request(clubUrl(clubId, '/approve'), { method: 'POST' });
}

/**
 * Rejects a pending club request.
 * Endpoint: POST /api/clubs/:clubId/reject
 */
export async function rejectClub(clubId: string): Promise<void> {
  await request(clubUrl(clubId, '/reject'), { method: 'POST' });
}

/**
 * Approved club details for the member info view.
 * Endpoint: GET /api/clubs/:clubId
 */
export async function getClub(clubId: string, signal?: AbortSignal): Promise<ClubDetails> {
  const data = await request(clubUrl(clubId), { signal });
  if (!data?.club) {
    throw createApiError('Could not load this club. Please try again.', 500);
  }
  return data.club;
}

/**
 * Channels shown in the club info view.
 * Endpoint: GET /api/clubs/:clubId/channels
 */
export async function getClubChannels(clubId: string, signal?: AbortSignal): Promise<ClubChannel[]> {
  const data = await request(clubUrl(clubId, '/channels'), { signal });
  return data?.channels ?? [];
}

/**
 * Active members, officers first.
 * Endpoint: GET /api/clubs/:clubId/members
 */
export async function getClubMembers(clubId: string, signal?: AbortSignal): Promise<ClubMember[]> {
  const data = await request(clubUrl(clubId, '/members'), { signal });
  return data?.members ?? [];
}

/**
 * Leaves the club and drops the member from its channels.
 * Endpoint: POST /api/clubs/:clubId/leave
 */
export async function leaveClub(clubId: string): Promise<void> {
  await request(clubUrl(clubId, '/leave'), { method: 'POST' });
}

/**
 * Updates club's details
 * Endpoint: PATCH /api/clubs/:clubId
 */
export async function updateClub(clubId: string, payload: UpdateClubPayload): Promise<ClubDetails> {
  const response = await fetch(clubUrl(clubId), {
    method: 'PATCH',
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
    const message = data?.message || 'Failed to update club. Please try again.';
    throw createApiError(message, response.status, data?.code);
  }
  if (!data?.club) {
    throw createApiError(
      data?.message || 'Could not update club. Please try again.',
      response.status,
      data?.code,
    );
  }

  return data.club;
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
    if (response.status === 401 || data?.message === 'ERR_REQUIRE_AUTH') {
    throw createApiError(
      'Your session has expired. Please log in again.',
      401,
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
    if (response.status === 401 || data?.message === 'ERR_REQUIRE_AUTH') {
      throw createApiError(
        'Your session has expired. Please log in again.',
        401,
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

/**
 * Deletes a club channel. The General channel is rejected by the server.
 * Endpoint: DELETE /api/clubs/:clubId/channels/:channelId
 */
export async function deleteChannel(clubId: string, channelId: string): Promise<void> {
  await request(clubUrl(clubId, `/channels/${encodeURIComponent(channelId)}`), { method: 'DELETE' });
}

/**
 * Promotes a member to officer or returns an officer to member.
 * Endpoint: PATCH /api/clubs/:clubId/members/:userId
 */
export async function updateMemberRole(
  clubId: string,
  userId: string,
  role: ClubMember['role'],
): Promise<void> {
  await request(clubUrl(clubId, `/members/${encodeURIComponent(userId)}`), {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ role }),
  });
}

/**
 * Removes another member. Removed members cannot rejoin. Self-removal is rejected.
 * Endpoint: DELETE /api/clubs/:clubId/members/:userId
 */
export async function removeMember(clubId: string, userId: string): Promise<void> {
  await request(clubUrl(clubId, `/members/${encodeURIComponent(userId)}`), { method: 'DELETE' });
}
