import express, { Application, Request, Response } from 'express';
import cors from 'cors';
import clubRoutes from './clubs/clubRoutes';
import authRoutes from './user/routes/auth.routes';
import searchRoutes from './user/routes/search.routes';
import conversationRoutes from './messaging/routes/conversation.routes';
import { sessionMiddleware } from './sessions/session';
import { requireAuth } from './user/utils/requireAuth';
import userRouter from './user/routes/user.routes';

const app: Application = express();

// Middleware
app.use(
  cors({
    origin: process.env.CLIENT_URL || 'http://localhost:5173',
    credentials: true,
  })
);
app.use(express.json());
app.use(sessionMiddleware);
app.use('/api/users/search', requireAuth, searchRoutes);
app.use('/api/users', userRouter);
app.use('/api/clubs', clubRoutes);

// foward all requests starting with '/api/auth' to the auth routes file
app.use("/api/auth", authRoutes);

app.use('/api/conversations', requireAuth, conversationRoutes);

// Hello World / Health Check endpoint
app.get('/api/health', (req: Request, res: Response) => {
  res.status(200).json({
    status: 'ok',
    message: 'API is running',
  });
});

export default app;
