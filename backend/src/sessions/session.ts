import 'dotenv/config';
import { once } from 'events';
import session from 'express-session';
import { MongoStore } from 'connect-mongo';
import mongoose from 'mongoose';

const secret = process.env.SESSION_SECRET;

if (!secret) {
  throw new Error('SESSION_SECRET is required');
}

const clientPromise =
  mongoose.connection.readyState === 1
    ? Promise.resolve(mongoose.connection.getClient())
    : once(mongoose.connection, 'connected').then(() => mongoose.connection.getClient());

const store = MongoStore.create({
  clientPromise,
  collectionName: 'sessions',
});

export const sessionMiddleware = session({
  name: 'chomp.sid',
  secret,
  store,
  resave: false,
  saveUninitialized: false,
  cookie: {
    path: '/',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 1000 * 12, // 12 hours before the session token expires
  },
});
