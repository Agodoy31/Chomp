import 'dotenv/config';
import session from 'express-session';
import { MongoStore } from 'connect-mongo';

const isTest = process.env.NODE_ENV === 'test';
const mongoUrl = process.env.MONGO_URI;
const secret = process.env.SESSION_SECRET;

if (!secret || !mongoUrl) {
  throw new Error('MONGO_URI and SESSION_SECRET are required');
}

const store = isTest
  ? new session.MemoryStore() // we have to use this connection durring tests
  : MongoStore.create({
      mongoUrl,
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