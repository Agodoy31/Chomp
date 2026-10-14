import {IUserDocument} from "../interfaces/user.interfaces";
import {model, Schema} from "mongoose";

export type { IUserDocument } from '../interfaces/user.interfaces';

const userSchema = new Schema<IUserDocument>({
    email: {
        type: String,
        required: [true, "an email is required"],
        trim: true,
        unique: true,
        lowercase: true, // need to make sure that @ufl.edu is lowercase
        validate: {
            validator: (value: string) => {
                return value.endsWith("@ufl.edu") && value.length > 8;
            },
            message: "email must be a ufl email"
        }
    },
    hashedPassword: {
        type: String,
        required: [true, "a password is required"],
        select: false, // don't return this value by default when querying
    },
    name:{
        type: String,
        trim: true,
        required: [true, "display name is required"],
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