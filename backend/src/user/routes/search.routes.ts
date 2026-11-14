import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { User } from '../models/User';

const router = Router();

const SEARCH_ALLOWED_REGEX = /^[a-zA-Z0-9 ._\-@']+$/;

const searchSchema = z.object({
  search: z
    .string({ message: 'ERR_SEARCH_REQUIRED' })
    .trim()
    .min(1, 'ERR_SEARCH_REQUIRED')
    .max(100, 'ERR_SEARCH_TOO_LONG')
    .regex(SEARCH_ALLOWED_REGEX, 'ERR_SEARCH_INVALID_CHARACTERS'),
});

router.get('/', async (req: Request, res: Response) => {
  const parsed = searchSchema.safeParse(req.query);
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0];
    return res.status(400).json({
      message: firstIssue?.message ?? 'ERR_SEARCH_REQUIRED',
    });
  }

  const words = parsed.data.search.split(/\s+/);
  const wordFilters = words.map((word, index) => {
    const pattern = index < words.length - 1 ? `\\b${word}\\b` : word;
    const wordRegex = new RegExp(pattern, 'i');

    return {
      $or: [
        { firstName: wordRegex },
        { lastName: wordRegex },
        { email: wordRegex },
      ],
    };
  });

  try {
    const currentUserId = req.session.userId;

    const users = await User.find({
      _id: { $ne: currentUserId },
      $and: wordFilters,
    })
      .select('_id firstName lastName email')
      .sort({ firstName: 1, lastName: 1, _id: 1 })
      .limit(10)
      .lean();

    return res.status(200).json(users);
  } catch (error) {
    console.error('User search error:', error);
    return res.status(500).json({
      message: 'ERR_SERVER_ERROR',
    });
  }
});

export default router;
