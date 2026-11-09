import { Request, Response, RequestHandler } from 'express';

export const getUserProfile: RequestHandler = async (
  req: Request,
  res: Response
): Promise<void> => {
  res.status(501).json({ message: 'Not implemented' });
};

export const updateBio: RequestHandler = async (
  req: Request,
  res: Response
): Promise<void> => {
  res.status(501).json({ message: 'Not implemented' });
};
