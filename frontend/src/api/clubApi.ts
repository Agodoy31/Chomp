import type { ClubChannel, ClubDetails, ClubMember } from '../types/club';

type ApiError = Error & { status?: number };

function createApiError(message: string, status: number): ApiError {
  return Object.assign(new Error(message), { status });
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
    throw createApiError(message, response.status);
  }

  return data;
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
