import type { Club, ClubCategory } from '../types/club';

export type UpdateClubPayload = {
  name?: string;
  description?: string;
  category?: ClubCategory;
  meeting?: {
    day?: string;
    time?: string;
    location?: string;
  };
};

/**
 * Updates club's details 
 * Endpoint: PATCH /api/clubs/:clubId
 */
export async function updateClub(clubId: string, payload: UpdateClubPayload): Promise<Club> {
 
  const response = await fetch(`/api/clubs/${clubId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(payload),
  });

  
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.message || data.error || 'Failed to update club.');
  }


  return data.club ?? data;
}