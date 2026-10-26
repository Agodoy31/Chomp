// clubs.interfaces.ts
import type { Club } from '../model/clubModel';
export const CLUB_CATEGORIES = ['ACADEMIC', 'CULTURAL', 'SPORTS', 'OTHER'] as const;
export type ClubCategory = (typeof CLUB_CATEGORIES)[number]; // 'ACADEMIC' | 'CULTURAL' | 'SPORTS' | 'OTHER'

export const CLUB_STATUSES = ['PENDING', 'APPROVED', 'REJECTED'] as const;
export type ClubStatus = (typeof CLUB_STATUSES)[number];

export const MEMBERSHIP_STATUSES = ['ACTIVE', 'PENDING', 'INACTIVE', 'REMOVED', 'REJECTED'] as const;
export type MembershipStatus = (typeof MEMBERSHIP_STATUSES)[number];

export interface ClubFilter {
  status: ClubStatus;
  category?: ClubCategory | { $in: ClubCategory[] };
}

export type ClubRequest = Pick<Club, 'name' | 'description' | 'category' | 'meeting'> 

export interface ClientError {
  status: number;
  code: string;
  message: string;
};
