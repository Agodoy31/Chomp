import { Router, Request, Response } from 'express';
import { User } from '../models/User';
import { requireAuth } from '../utils/requireAuth';

const router = Router();

// GET /api/users
router.get('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const query = req.query.q as string | undefined;

    // TODO: Query users matching search query (or all users if query is omitted)
    // Make sure to exclude sensitive fields (e.g., hashedPassword)
    // and format response with { _id, firstName, lastName, email }

    return res.status(200).json([]);
  } catch (error) {
    console.error('User search error:', error);
    return res.status(500).json({
      message: 'ERR_SERVER_ERROR',
    });
  }
});

export default router;