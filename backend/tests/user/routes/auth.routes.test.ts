import request from "supertest";
import app from "../../../src/app";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "@jest/globals";
import { clearTestDb, closeTestDb, connectTestDb } from "../../helpers/db";
import { User } from "../../../src/user/models/User";
import { hashPassword } from "../../../src/user/utils/passwordHashing";

describe("Auth Routes Testing /api/auth/login", () => {
    beforeAll(async () => {
        await connectTestDb();
        await User.init();
    }, 60000);

    beforeEach(async ()=> {
        await User.create({
            email: "albert@ufl.edu",
            hashedPassword: await hashPassword("password"),
            firstName: "Albert",
            lastName: "Gator",
        });
    });
    afterEach(async () => {
        await clearTestDb();
    });

    afterAll(async () => {
        await closeTestDb();
    });


    test("Happy Path", async () => {
        const res = await request(app)
        .post("/api/auth/login")
        .send({
            email: "albert@ufl.edu",
            password: "password",
        });

        expect(res.status).toBe(200);
        expect(res.body.message).toBe("Login Success");
        expect(res.body.user.id).toBeDefined();
        expect(res.body.user.email).toBe("albert@ufl.edu");
        expect(res.body.user.isAdmin).toBe(false);
        expect(res.body.user.bio).toBe("This user doesn't have a bio yet!");
        expect(res.body.user.firstName).toBe("Albert");
        expect(res.body.user.lastName).toBe("Gator");
        expect(res.body.createdAt).toBeUndefined();
        expect(res.body.updatedAt).toBeUndefined();
        expect(res.body.authToken).toBeDefined(); // TODO:: Make a Check here for auth token
    });

    test("Missing Email", async () => {
        const res = await request(app)
        .post("/api/auth/login")
        .send({
            password: "password",
        });

        expect(res.status).toBe(400);
        expect(res.body.message).toBe("Email is required to login");
    });

    test("Missing Password", async () => {
        const res = await request(app)
        .post("/api/auth/login")
        .send({
            email: "albert@ufl.edu",
        });

        expect(res.status).toBe(400);
        expect(res.body.message).toBe("Password is required to login");
    });

    test("No User", async () => {
        const res = await request(app)
        .post("/api/auth/login")
        .send({
            email: "alberta@ufl.edu",
            password: "password",
        });

        expect(res.status).toBe(401);
        expect(res.body.message).toBe("Invalid email or password");
    });

    test("Incorrect Password", async () => {
        const res = await request(app)
        .post("/api/auth/login")
        .send({
            email: "albert@ufl.edu",
            password: "pas5word",
        });

        expect(res.status).toBe(401);
        expect(res.body.message).toBe("Invalid email or password");
    });

    test("Case-Insensitive Login", async () => {
        const res = await request(app)
        .post("/api/auth/login")
        .send({
            email: "ALBERT@UFL.EDU",
            password: "password",
        });

        expect(res.status).toBe(200);
    });

});

describe("Auth Routes Testing /api/auth/register", () => {
    beforeAll(async () => {
        await connectTestDb();
        await User.init();
    }, 60000);

    afterEach(async () => {
        await clearTestDb();
    });

    afterAll(async () => {
        await closeTestDb();
    });


    test("Happy Path", async () => {
        const res = await request(app)
        .post("/api/auth/register")
        .send({
            email: "albert@ufl.edu",
            password: "password",
            firstName: "Albert",
            lastName: "Gator",
        });

        expect(res.status).toBe(201);
        expect(res.body.message).toBe("New user registered");
        expect(res.body.user.id).toBeDefined();
        expect(res.body.user.email).toBe("albert@ufl.edu");
        expect(res.body.user.isAdmin).toBe(false);
        expect(res.body.user.bio).toBe("This user doesn't have a bio yet!")
        expect(res.body.user.firstName).toBe("Albert");
        expect(res.body.user.lastName).toBe("Gator");
        expect(res.body.createdAt).toBeUndefined();
        expect(res.body.updatedAt).toBeUndefined();
        expect(res.body.authToken).toBeDefined(); // TODO:: Make a Check here for auth token
    });

    test("Missing Email", async () => {
        const res = await request(app)
        .post("/api/auth/register")
        .send({
            password: "password",
            firstName: "Albert",
            lastName: "Gator",
        });

        expect(res.status).toBe(400);
        expect(res.body.message).toBe("Email is required");
    });

    test("Missing Password", async () => {
        const res = await request(app)
        .post("/api/auth/register")
        .send({
            email: "albert@ufl.edu",
            firstName: "Albert",
            lastName: "Gator",
        });

        expect(res.status).toBe(400);
        expect(res.body.message).toBe("Password is required");
    });
    test("Missing First Name", async () => {
        const res = await request(app)
        .post("/api/auth/register")
        .send({
            email: "albert@ufl.edu",
            password: "password",
            lastName: "Gator",
        });

        expect(res.status).toBe(400);
        expect(res.body.message).toBe("First name is required");
    });
    test("Missing Last Name", async () => {
        const res = await request(app)
        .post("/api/auth/register")
        .send({
            email: "albert@ufl.edu",
            password: "password",
            firstName: "Albert",
        });

        expect(res.status).toBe(400);
        expect(res.body.message).toBe("Last name is required");
    });

    test("User Already Exists", async () => {
        await User.create({
            email: "albert@ufl.edu",
            hashedPassword: await hashPassword("password"),
            firstName: "Albert",
            lastName: "Gator",
        });

        const res = await request(app)
        .post("/api/auth/register")
        .send({
            email: "albert@ufl.edu",
            password: "password",
            firstName: "Albert",
            lastName: "Gator",
        });

        expect(res.status).toBe(409);
        expect(res.body.message).toBe("There already exists a user with this email");
    });

    test("Reject Non-UFL Email", async () => {
        const res = await request(app)
        .post("/api/auth/register")
        .send({
            email: "albert@gmail.com",
            password: "password",
            firstName: "Albert",
            lastName: "Gator",
        });

        expect(res.status).toBe(400);
        expect(res.body.message).toContain("email must be a ufl email");
    });

});