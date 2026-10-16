import {IUserDocument} from "../interfaces/user.interfaces";
import {model, Schema} from "mongoose";

export type { IUserDocument } from '../interfaces/user.interfaces';

const uflEmailRegex = /^[a-zA-Z0-9._-]+@ufl\.edu$/;

const userSchema = new Schema<IUserDocument>({
    email: {
        type: String,
        required: [true, "an email is required"],
        trim: true,
        unique: true,
        lowercase: true, // need to make sure that @ufl.edu is lowercase
        validate: {
            validator: (value: string) => uflEmailRegex.test(value),
            message: "email must be a ufl email"
        }
    },
    hashedPassword: {
        type: String,
        required: [true, "a password is required"],
        select: false, // don't return this value by default when querying
    },
    firstName:{
        type: String,
        trim: true,
        required: [true, "first name is required"],
    },
    lastName:{
        type: String,
        trim: true,
        required: [true, "last name is required"],
    },
    bio: {
        type: String,
        default: "This user doesn't have a bio yet!",
    },
    isAdmin: {
        type: Boolean,
        required: true,
        default: false,
    },},
    { timestamps: true,}
);

export const User = model<IUserDocument>("User", userSchema, "users");