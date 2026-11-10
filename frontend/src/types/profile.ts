 
import type { ClubCategory } from './club'
 
export type ProfileClub = {
  _id: string // the club's id (not the membership id)
  name: string
  description: string
  category: ClubCategory
  role: string
}
 
export type UserProfile = {
  id: string
  firstName: string
  lastName: string
  email: string
  bio: string
  clubs: ProfileClub[]
}