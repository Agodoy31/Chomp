import { describe, expect, test } from "@jest/globals";
import express, { Request, Response } from "express";
import request from "supertest";
import { requireAuth } from "../../../src/user/utils/requireAuth";

function createTestApp(sessionData?: { userId?: string }) {
  const testApp = express();
  testApp.use(express.json());

  testApp.use((req: Request, _res: Response, next) => {
    if (sessionData) {
      req.session = sessionData as unknown as Request["session"];
    }
    next();
  });

  testApp.get("/protected", requireAuth, (_req: Request, res: Response) => {
    res.status(200).json({ message: "Access granted" });
  });

  return testApp;
}

describe("requireAuth Middleware Testing", () => {
  test("Unauthorized when no session is present", async () => {
    const app = createTestApp();
    const res = await request(app).get("/protected");

    expect(res.status).toBe(401);
    expect(res.body.message).toBe("ERR_REQUIRE_AUTH");
    expect(res.body.redirectTo).toBe("/login");
  });

  test("Unauthorized when session exists but has no userId", async () => {
    const app = createTestApp({});
    const res = await request(app).get("/protected");

    expect(res.status).toBe(401);
    expect(res.body.message).toBe("ERR_REQUIRE_AUTH");
    expect(res.body.redirectTo).toBe("/login");
  });

  test("Happy Path - passes when user is authenticated", async () => {
    const app = createTestApp({ userId: "mockUserId123" });
    const res = await request(app).get("/protected");

    expect(res.status).toBe(200);
    expect(res.body.message).toBe("Access granted");
  });
});
