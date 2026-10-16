import { Router } from 'express';
import { getClubs } from './controllers/clubController';
import { joinClub } from './controllers/membershipController';

const clubRoutes = Router();

clubRoutes.get('/', getClubs);
clubRoutes.post('/:clubId/join', joinClub);

export default clubRoutes;
