import { Router, Request, Response } from "express";
import { User } from "../models/User";
import { comparePasswords, hashPassword } from "../utils/passwordHashing";

const router = Router();

router.post("/login", async (req: Request, res: Response) => {
    try{
        const { email, password } = req.body;

        console.log("Login request for: ", email, " recieved"); // collect that data cuh

        if (!email){
            return res.status(400).json({
                message: "ERR_EMAIL_REQUIRED"
            });
        }if (!password) {
            return res.status(400).json({
                message: "ERR_PASSWORD_REQUIRED"
            }); 
        }

        const user = await User.findOne({email: email.toLowerCase().trim()}).select("+hashedPassword");

        if (!user) {
            return res.status(401).json({
                message: "ERR_LOGIN_INVALID"
            });
        }

        const isPassword = await comparePasswords(password,user.hashedPassword);
        if (!isPassword){
            return res.status(401).json({
                message: "ERR_LOGIN_INVALID"
            });
        }

        await new Promise<void>((resolve, reject) => {
            req.session.regenerate((err: unknown) => {
                if (err) return reject(err);
                resolve();
            });
        });

        req.session.userId = String(user._id);

        await new Promise<void>((resolve, reject) => {
            req.session.save((err: unknown) => {
                if (err) return reject(err);
                resolve();
            });
        });

        return res.status(200).json({
            message: "SUCCESS_LOGIN",
            user: {
                id: user._id,
                email: user.email,
                firstName: user.firstName,
                lastName: user.lastName,
                bio: user.bio,
                isAdmin: user.isAdmin
            }
        });
    }catch (error){
        console.error("Login error:", error);
        return res.status(500).json({
            message: "ERR_SERVER_ERROR"
        });
    }
});

router.post("/register", async (req: Request, res: Response) =>{
    try{
        const { email, password, firstName, lastName } = req.body;

        if(!email){
            return res.status(400).json({
                message: "ERR_EMAIL_REQUIRED"
            });
        }if(!password){
            return res.status(400).json({
                message: "ERR_PASSWORD_REQUIRED"
            });
        }if(!firstName){
            return res.status(400).json({
                message: "ERR_FIRST_NAME_REQUIRED"
            });
        }if(!lastName){
            return res.status(400).json({
                message: "ERR_LAST_NAME_REQUIRED"
            });
        }

        const currentUser = await User.findOne({ email: email.toLowerCase() });
        if(currentUser) {
            return res.status(409).json({
                message: "ERR_EMAIL_TAKEN"
            });
        }

        const hashedPassword  = await hashPassword(password);

        const user = await User.create({
            email,
            hashedPassword,
            firstName,
            lastName
        });

        await new Promise<void>((resolve, reject) => {
            req.session.regenerate((err: unknown) => {
                if (err) return reject(err);
                resolve();
            });
        });

        req.session.userId = String(user._id);

        await new Promise<void>((resolve, reject) => {
            req.session.save((err: unknown) => {
                if (err) return reject(err);
                resolve();
            });
        });

        return res.status(201).json({
            message: "SUCCESS_REGISTER",
            user: {
                id: user._id,
                email: user.email,
                firstName: user.firstName,
                lastName: user.lastName,
                bio: user.bio,
                isAdmin: user.isAdmin
            }
        });
    }catch (error: any){
        if(error.name === "ValidationError"){
            return res.status(400).json({
                message: error.message,
            });
        }

        console.error("Registration error:", error);
        return res.status(500).json({
            message: "ERR_SERVER_ERROR"
        });
    }
})

export default router;