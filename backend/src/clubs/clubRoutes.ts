import { Router } from 'express';
import { requireAuth } from '../user/utils/requireAuth';
import {
  approveClub,
  getClubById,
  getClubs,
  getPendingClubs,
  rejectClub,
  requestClub,
  updateClub,
} from './controllers/clubController';
import {
  getClubMembers,
  getMyClubs,
  joinClub,
  leaveClub,
  removeMember,
  updateMemberRole,
} from './controllers/membershipController';

const clubRoutes = Router();

clubRoutes.get('/', getClubs);
clubRoutes.post('/', requireAuth, requestClub);
clubRoutes.get('/me', requireAuth, getMyClubs);
clubRoutes.get('/pending', requireAuth, getPendingClubs);
clubRoutes.get('/:clubId', getClubById);
clubRoutes.patch('/:clubId', requireAuth, updateClub);
clubRoutes.post('/:clubId/approve', requireAuth, approveClub);
clubRoutes.post('/:clubId/reject', requireAuth, rejectClub);
clubRoutes.post('/:clubId/join', requireAuth, joinClub);
clubRoutes.post('/:clubId/leave', requireAuth, leaveClub);
clubRoutes.get('/:clubId/members', requireAuth, getClubMembers);
clubRoutes.patch('/:clubId/members/:userId', requireAuth, updateMemberRole);
clubRoutes.delete('/:clubId/members/:userId', requireAuth, removeMember);

export default clubRoutes;
