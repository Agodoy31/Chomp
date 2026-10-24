import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { User } from '../models/User';
import { comparePasswords, hashPassword } from '../utils/passwordHashing';
import { requireAuth } from '../utils/requireAuth';

const router = Router();

const uflEmailRegex = /^[a-zA-Z0-9._-]+@ufl\.edu$/;
const nameRegex = /^[a-zA-Z]+(?:[' -][a-zA-Z]+)*$/;

const loginSchema = z.object({
  email: z
    .string({ message: 'ERR_EMAIL_REQUIRED' })
    .trim()
    .toLowerCase()
    .min(1, 'ERR_EMAIL_REQUIRED')
    .email('ERR_LOGIN_INVALID'),
  password: z
    .string({ message: 'ERR_PASSWORD_REQUIRED' })
    .min(1, 'ERR_PASSWORD_REQUIRED'),
});

const registerSchema = z.object({
  email: z
    .string({ message: 'ERR_EMAIL_REQUIRED' })
    .trim()
    .toLowerCase()
    .min(1, 'ERR_EMAIL_REQUIRED')
    .regex(uflEmailRegex, 'email must be a ufl email'),
  password: z
    .string({ message: 'ERR_PASSWORD_REQUIRED' })
    .min(1, 'ERR_PASSWORD_REQUIRED')
    .min(8, 'Password must be at least 8 characters long'),
  firstName: z
    .string({ message: 'ERR_FIRST_NAME_REQUIRED' })
    .trim()
    .min(1, 'ERR_FIRST_NAME_REQUIRED')
    .regex(nameRegex, 'First name can only contain letters'),
  lastName: z
    .string({ message: 'ERR_LAST_NAME_REQUIRED' })
    .trim()
    .min(1, 'ERR_LAST_NAME_REQUIRED')
    .regex(nameRegex, 'Last name can only contain letters'),
});

router.post('/login', async (req: Request, res: Response) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0];
    return res.status(400).json({
      message: firstIssue?.message ?? 'ERR_VALIDATION_FAILED',
    });
  }
  const { email, password } = parsed.data;

  const user = await User.findOne({ email })
    .select('+hashedPassword')
    .lean();

  if (!user) {
    return res.status(401).json({
      message: 'ERR_LOGIN_INVALID',
    });
  }

  const isPassword = await comparePasswords(password, user.hashedPassword);
  if (!isPassword) {
    return res.status(401).json({
      message: 'ERR_LOGIN_INVALID',
    });
  }

  await new Promise<void>((resolve, reject) => {
    req.session.regenerate((err: unknown) => {
      if (err) return reject(err);
      resolve();
    });
  });

  req.session.userId = String(user._id);

  await new Promise<void>((resolve, reject) => {
    req.session.save((err: unknown) => {
      if (err) return reject(err);
      resolve();
    });
  });

  return res.status(200).json({
    message: 'SUCCESS_LOGIN',
    user: {
      id: user._id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      bio: user.bio,
      isAdmin: user.isAdmin,
    },
  });
});

router.post('/register', async (req: Request, res: Response) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0];
    return res.status(400).json({
      message: firstIssue?.message ?? 'ERR_VALIDATION_FAILED',
    });
  }
  const { email, password, firstName, lastName } = parsed.data;

  const emailExists = await User.exists({ email });
  if (emailExists) {
    return res.status(409).json({
      message: 'ERR_EMAIL_TAKEN',
    });
  }

  const hashedPassword = await hashPassword(password);

  let user;
  try {
    user = await User.create({
      email,
      hashedPassword,
      firstName,
      lastName,
    });
  } catch (error: unknown) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 11000) {
      return res.status(409).json({
        message: 'ERR_EMAIL_TAKEN',
      });
    }
    throw error;
  }

  await new Promise<void>((resolve, reject) => {
    req.session.regenerate((err: unknown) => {
      if (err) return reject(err);
      resolve();
    });
  });

  req.session.userId = String(user._id);

  await new Promise<void>((resolve, reject) => {
    req.session.save((err: unknown) => {
      if (err) return reject(err);
      resolve();
    });
  });

  return res.status(201).json({
    message: 'SUCCESS_REGISTER',
    user: {
      id: user._id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      bio: user.bio,
      isAdmin: user.isAdmin,
    },
  });
});

router.get('/me', requireAuth, async (req: Request, res: Response) => {
  const user = await User.findById(req.session.userId).lean();

  if (!user) {
    return res.status(401).json({
      message: 'ERR_REQUIRE_AUTH',
      redirectTo: '/login',
    });
  }

  return res.status(200).json({
    user: {
      id: user._id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      bio: user.bio,
      isAdmin: user.isAdmin,
    },
  });
});

router.post('/logout', requireAuth, async (req: Request, res: Response) => {
  await new Promise<void>((resolve, reject) => {
    req.session.destroy((err: unknown) => {
      if (err) return reject(err);
      resolve();
    });
  });

  res.clearCookie('chomp.sid', { path: '/' });
  return res.status(200).json({
    message: 'SUCCESS_LOGOUT',
  });
});

export default router;
