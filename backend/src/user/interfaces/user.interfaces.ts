import {Document, Types} from "mongoose";

export interface IUserDocument extends Document {
    _id: Types.ObjectId;
    email: string;
    hashedPassword: string; // TODO:: make sure that the password is actually hashed and salted
    name: string;
    bio?: string;
    isAdmin: boolean;
    createdAt: Date;
    updatedAt: Date;
}