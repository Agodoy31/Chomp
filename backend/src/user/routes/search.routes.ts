import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { User } from '../models/User';

const router = Router();

// Regex to verify search input
const SEARCH_ALLOWED_REGEX = /^[a-zA-Z0-9 ._\-@']+$/;

const searchSchema = z.object({
  search: z
    .string({ message: 'ERR_SEARCH_REQUIRED' })
    .trim()
    .min(1, 'ERR_SEARCH_REQUIRED')
    .max(100, 'ERR_SEARCH_TOO_LONG')
    .regex(SEARCH_ALLOWED_REGEX, 'ERR_SEARCH_INVALID_CHARACTERS'),
});

// makes regex terms safe
function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// GET /api/search?search=...
router.get('/', async (req: Request, res: Response) => {
  const parsed = searchSchema.safeParse(req.query);
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0];
    return res.status(400).json({
      message: firstIssue?.message ?? 'ERR_SEARCH_REQUIRED',
    });
  }

  const { search } = parsed.data;
  const escaped = escapeRegex(search);
  const searchRegex = new RegExp(escaped, 'i');

  try {
    const currentUserId = req.session.userId;

    const users = await User.find({
      _id: { $ne: currentUserId },
      $or: [
        { firstName: searchRegex },
        { lastName: searchRegex },
        { email: searchRegex },
        {
          $expr: {
            $regexMatch: {
              input: { $concat: ['$firstName', ' ', '$lastName'] },
              regex: escaped,
              options: 'i',
            },
          },
        },
      ],
    })
      .select('_id firstName lastName email')
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
