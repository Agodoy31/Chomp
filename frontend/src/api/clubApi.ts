import type { Club, ClubCategory } from '../types/club';
import type { ClubChannel, ClubDetails, ClubMember } from '../types/club';

export type UpdateClubPayload = {
  name?: string;
  description?: string;
  category?: ClubCategory;
  meeting?: Partial<NonNullable<Club['meeting']>> | Record<string, never>;
};

export type UpdatedClubResponse = Omit<Club, 'status' | 'role'>;

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
 * Channels a member can open from the club info view.
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
export async function updateClub(clubId: string, payload: UpdateClubPayload): Promise<UpdatedClubResponse> {
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
