import { Router } from 'express';
import { createClub, getClubs, requestClub } from './controllers/clubController';
import { joinClub } from './controllers/membershipController';

const clubRoutes = Router();

clubRoutes.get('/', getClubs);
clubRoutes.post('/', requestClub);
clubRoutes.post('/:clubId/approve', createClub);
clubRoutes.post('/:clubId/join', joinClub);

export default clubRoutes;
