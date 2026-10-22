import { Request, Response } from 'express';
import { CLUB_CATEGORIES, type ClubFilter, type ClubStatus } from '../interfaces/clubs.interface';
import { Club } from '../model/clubModel';
import { sendError } from '../errors';
 
export const getClubs = async (req: Request, res: Response) => {
  const filter: ClubFilter = { status: 'APPROVED' as ClubStatus};
  const queryCategory = req.query.category;
  if (typeof queryCategory === 'string') { // in case of single category
    const match = CLUB_CATEGORIES.find((category) => category === queryCategory.trim().toUpperCase());
    if (match === undefined){
      sendError(res, { 
        status: 400, 
        code: 'ERR_INVALID_CATEGORY', 
        message: 'Invalid Category' 
      });
      return;
    }
    filter.category = match;

  } else if (Array.isArray(queryCategory)) { // in case of multiple categories
    const categories = queryCategory
      .map((category) => {
        if (typeof category !== 'string') return undefined;
         return CLUB_CATEGORIES.find((entry) => entry === category.trim().toUpperCase());
      });
    if (categories.some((category) => category === undefined)){
      sendError(res, { 
        status: 400, 
        code: 'ERR_INVALID_CATEGORY', 
        message: 'Invalid Category' 
      });
      return;
    }
    filter.category = { $in: categories.filter((category) => category !== undefined) };
  }

  try{
    const clubs = await Club.find(filter)
      .select('-proposerId -__v -status -createdAt -updatedAt')
      .sort({ name: 1 })
      .collation({ locale: 'en', strength: 2 })
      .lean()
      .exec();
    res.status(200).json({ clubs });
  } catch (error) {
    // Will be replaced once error handler is created in app.ts
    res.status(500).json({
      code: 'ERR_INTERNAL_SERVER_ERROR',
      message: 'Invalid category',
    });
  }
};
