import express, { Application, Request, Response } from 'express';
import cors from 'cors';
import clubRoutes from './clubs/clubRoutes';
import authRoutes from './user/routes/auth.routes';
import { sessionMiddleware } from './sessions/session';

const app: Application = express();

// Middleware
app.use(
  cors({
    origin: process.env.CLIENT_URL || 'http://localhost:5173',
    credentials: true,
  })
);
app.use(express.json());
app.use('/api/clubs', clubRoutes);

app.use(sessionMiddleware);

// foward all requests starting with '/api/auth' to the auth routes file
app.use("/api/auth", authRoutes);

// Hello World / Health Check endpoint
app.get('/api/health', (req: Request, res: Response) => {
  res.status(200).json({
    status: 'ok',
    message: 'API is running',
  });
});

export default app;
