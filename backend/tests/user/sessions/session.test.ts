import { describe, expect, test } from "@jest/globals";
import { hashPassword, comparePasswords } from "../../../src/user/utils/passwordHashing";

describe("Testing Hashing", () => {
    test("Check Two Hashes differ", async () =>{
        const hash1: string = await hashPassword("Test Password 1");
        const hash2: string = await hashPassword("Test Password 1");

        expect(hash1).not.toBe(hash2);
        expect(await comparePasswords("Test Password 1", hash1)).toBe(true);
        expect(await comparePasswords("Test Password 1", hash2)).toBe(true);
    });

    test("Checking comparePasswords true", async () => {
        const hash: string = await hashPassword("abc123ThisIsAPassword");

        expect(await comparePasswords("abc123ThisIsAPassword", hash)).toBe(true);
    });

    test("Checking comparePasswords false", async () => {
        const hash: string = await hashPassword("abc123ThisIsAPassword");

        expect(await comparePasswords("NotThisPassword", hash)).toBe(false);
    });
});