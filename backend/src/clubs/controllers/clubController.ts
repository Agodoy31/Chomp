import { Request, Response,  } from 'express';
import { Club } from '../model/clubModel';

export const getAllClubs = async (req: Request, res: Response) => {
    interface clubFilter {
      status: string
      category ?: string
    }
    const filter: clubFilter = {status: "APPROVED"};
    if (req.query.category && typeof req.query.category === 'string') filter.category = req.query.category as string;
  
    const clubs = await Club.find(filter)
      .select('-properserId -__v -status')
      .sort({name: 1})
      .exec();
    !clubs ?
      res.status(404).json({error: "Clubs could not be retrieved"})
      : res.status(200).json({clubs});

}