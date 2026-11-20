import type { Club, ClubCategory } from '../types/club';

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


/**
 * Updates club's details 
 * Endpoint: PATCH /api/clubs/:clubId
 */
export async function updateClub(clubId: string, payload: UpdateClubPayload): Promise<UpdatedClubResponse> {
  const url = `/api/clubs/${encodeURIComponent(clubId)}`;
 
  const response = await fetch(url, {
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