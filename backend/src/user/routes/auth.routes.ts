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
                message: "Email is required to login"
            });
        }if (!password) {
            return res.status(400).json({
                message: "Password is required to login"
            }); 
        }

        const user = await User.findOne({email: email.toLowerCase().trim()}).select("+hashedPassword");

        if (!user) {
            return res.status(401).json({
                message: "Invalid email or password"
            });
        }

        const isPassword = await comparePasswords(password,user.hashedPassword);
        if (!isPassword){
            return res.status(401).json({
                message: "Invalid email or password"
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
            message: "Login Success",
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
            message: "Server error durring login"
        });
    }
});

router.post("/register", async (req: Request, res: Response) =>{
    try{
        const { email, password, firstName, lastName } = req.body;

        if(!email){
            return res.status(400).json({
                message: "Email is required"
            });
        }if(!password){
            return res.status(400).json({
                message: "Password is required"
            });
        }if(!firstName){
            return res.status(400).json({
                message: "First name is required"
            });
        }if(!lastName){
            return res.status(400).json({
                message: "Last name is required"
            });
        }

        const currentUser = await User.findOne({ email: email.toLowerCase() });
        if(currentUser) {
            return res.status(409).json({
                message: "There already exists a user with this email"
            });
        }

        const hashedPassword  = await hashPassword(password);

        const user = await User.create({
            email,
            hashedPassword,
            firstName,
            lastName
        });

        return res.status(201).json({
            message: "New user registered",
            user: {
                id: user._id,
                email: user.email,
                firstName: user.firstName,
                lastName: user.lastName,
                bio: user.bio,
                isAdmin: user.isAdmin
            },
            authToken: "temp-token", // TODO:: make this also a proper token
        })
    }catch (error: any){
        if(error.name === "ValidationError"){
            return res.status(400).json({
                message: error.message,
            });
        }

        console.error("Registration error:", error);
        return res.status(500).json({
            message: "Server error durring registration"
        });
    }
})

export default router;