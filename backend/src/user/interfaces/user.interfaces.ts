import {Document, Types} from "mongoose";

export interface IUserDocument extends Document {
    _id: Types.ObjectId;
    email: string;
    hashedPassword: string; // TODO:: make sure that the password is actually hashed and salted
    firstName: string;
    lastName: string;
    bio?: string;
    isAdmin: boolean;
    createdAt: Date;
    updatedAt: Date;
}

export interface UserProfileClubItem {
    _id: string;
    name: string;
    description: string;
    category: string;
    role: 'MEMBER' | 'OFFICER';
}

export interface UserProfileResponse {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    bio: string;
    clubs: UserProfileClubItem[];
}

export interface UpdateBioResponse {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    bio: string;
}
