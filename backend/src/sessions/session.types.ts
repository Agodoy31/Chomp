import type { Session, SessionData } from 'express-session';

// adding this so that SessionData contains the userID
declare module 'express-session' {
  interface SessionData {
    userId?: string;
  }
}

declare module 'http' {
  interface IncomingMessage {
    session?: Session & Partial<SessionData>;
  }
}
