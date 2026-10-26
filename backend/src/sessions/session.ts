import 'dotenv/config';
import { once } from 'events';
import session from 'express-session';
import { MongoStore } from 'connect-mongo';
import mongoose from 'mongoose';
import './session.types'; //so that SessionData contains the userID and I don't get poopy type errors

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
  rolling: true,
  cookie: {
    path: '/',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 1000 * 60 * 60 * 72,
  },
});
