import type { UserProfile } from '../types/profile';

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
 * Fetches a user profile by ID.
 * Endpoint: GET /api/users/:id
 */
export async function getUserProfile(
  profileId: string,
  signal?: AbortSignal
): Promise<UserProfile> {
  const response = await fetch(`/api/users/${profileId}`, {
    credentials: 'include',
    signal,
  });

  const data = await readJson(response);

  if (!response.ok) {
    if (data?.code === 'ERR_USER_NOT_FOUND') {
      throw createApiError('User not found.', response.status, 'ERR_USER_NOT_FOUND');
    }
    const message = data?.message || 'Could not load this profile. Please try again.';
    throw createApiError(message, response.status);
  }

  if (!data) {
    throw createApiError('Could not load this profile. Please try again.', response.status);
  }

  return data;
}

/**
 * Updates the current user's biography.
 * Endpoint: PATCH /api/users/me
 */
export async function updateUserBio(bio: string): Promise<string> {
  const response = await fetch('/api/users/me', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ bio }),
  });

  const data = await readJson(response);

  if (!response.ok) {
    const message = data?.message || 'Could not save bio. Please try again.';
    throw createApiError(message, response.status);
  }

  return data?.bio ?? bio;
}