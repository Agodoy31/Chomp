import 'express-session';

// adding this so that SessionData contains the userID
declare module 'express-session' {
  interface SessionData {
    userId?: string;
  }
}
