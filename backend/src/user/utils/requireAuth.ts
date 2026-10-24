import { Request, Response, NextFunction } from 'express';

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!req.session || !req.session.userId) { // this works because express-sessions makes invalid cookies undefined
    res.status(401).json({
      message: 'ERR_REQUIRE_AUTH',
      redirectTo: '/login', //TODO:: when frontend login is done, connect route here
    });
    return;
  }

  next(); 
}
