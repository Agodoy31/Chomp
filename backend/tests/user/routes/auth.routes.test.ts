import request from "supertest";
import app from "../../../src/app";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "@jest/globals";
import { clearTestDb, closeTestDb, connectTestDb } from "../../helpers/db";
import { User } from "../../../src/user/models/User";
import { hashPassword } from "../../../src/user/utils/passwordHashing";

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

describe("Auth Routes Testing /api/auth/login", () => {
    beforeEach(async ()=> {
        await User.create({
            email: "albert@ufl.edu",
            hashedPassword: await hashPassword("password"),
            firstName: "Albert",
            lastName: "Gator",
        });
    });
    test("Happy Path", async () => {
        const res = await request(app)
        .post("/api/auth/login")
        .send({
            email: "albert@ufl.edu",
            password: "password",
        });

        expect(res.status).toBe(200);
        expect(res.body.message).toBe("SUCCESS_LOGIN");
        expect(res.body.user.id).toBeDefined();
        expect(res.body.user.email).toBe("albert@ufl.edu");
        expect(res.body.user.isAdmin).toBe(false);
        expect(res.body.user.bio).toBe("This user doesn't have a bio yet!");
        expect(res.body.user.firstName).toBe("Albert");
        expect(res.body.user.lastName).toBe("Gator");
        expect(res.body.user.hashedPassword).toBeUndefined();
        expect(res.body.hashedPassword).toBeUndefined();
        expect(res.body.createdAt).toBeUndefined();
        expect(res.body.updatedAt).toBeUndefined();
        expect(res.headers["set-cookie"]).toBeDefined();
        expect(res.headers["set-cookie"]?.[0]).toContain("chomp.sid");
    });

    test("Missing Email", async () => {
        const res = await request(app)
        .post("/api/auth/login")
        .send({
            password: "password",
        });

        expect(res.status).toBe(400);
        expect(res.body.message).toBe("ERR_EMAIL_REQUIRED");
    });

    test("Missing Password", async () => {
        const res = await request(app)
        .post("/api/auth/login")
        .send({
            email: "albert@ufl.edu",
        });

        expect(res.status).toBe(400);
        expect(res.body.message).toBe("ERR_PASSWORD_REQUIRED");
    });

    test("No User", async () => {
        const res = await request(app)
        .post("/api/auth/login")
        .send({
            email: "alberta@ufl.edu",
            password: "password",
        });

        expect(res.status).toBe(401);
        expect(res.body.message).toBe("ERR_LOGIN_INVALID");
    });

    test("Incorrect Password", async () => {
        const res = await request(app)
        .post("/api/auth/login")
        .send({
            email: "albert@ufl.edu",
            password: "pas5word",
        });

        expect(res.status).toBe(401);
        expect(res.body.message).toBe("ERR_LOGIN_INVALID");
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
        expect(res.body.message).toBe("SUCCESS_REGISTER");
        expect(res.body.user.id).toBeDefined();
        expect(res.body.user.email).toBe("albert@ufl.edu");
        expect(res.body.user.isAdmin).toBe(false);
        expect(res.body.user.bio).toBe("This user doesn't have a bio yet!")
        expect(res.body.user.firstName).toBe("Albert");
        expect(res.body.user.lastName).toBe("Gator");
        expect(res.body.user.hashedPassword).toBeUndefined();
        expect(res.body.hashedPassword).toBeUndefined();
        expect(res.body.createdAt).toBeUndefined();
        expect(res.body.updatedAt).toBeUndefined();
        expect(res.headers["set-cookie"]).toBeDefined();
        expect(res.headers["set-cookie"]?.[0]).toContain("chomp.sid");
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
        expect(res.body.message).toBe("ERR_EMAIL_REQUIRED");
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
        expect(res.body.message).toBe("ERR_PASSWORD_REQUIRED");
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
        expect(res.body.message).toBe("ERR_FIRST_NAME_REQUIRED");
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
        expect(res.body.message).toBe("ERR_LAST_NAME_REQUIRED");
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
        expect(res.body.message).toBe("ERR_EMAIL_TAKEN");
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
