import { expect, test } from "bun:test";
import { createRealtimeToken, verifyRealtimeToken, isAuthorizedPublisher } from "./index";

const secret = "test-secret-0123456789abcdef";

test("round-trips tokens", () => {
  const token = createRealtimeToken("user_1", 60, secret);
  expect(verifyRealtimeToken(token, secret)).toEqual({ userId: "user_1" });
});

test("rejects tampered and expired tokens", () => {
  const token = createRealtimeToken("user_1", 60, secret);
  const [payload, sig] = token.split(".");
  const forged = Buffer.from(JSON.stringify({ sub: "user_2", exp: 9999999999 })).toString("base64url");
  expect(verifyRealtimeToken(`${forged}.${sig}`, secret)).toBeNull();
  expect(verifyRealtimeToken(`${payload}.${sig}`, "another-secret-0123456789")).toBeNull();
  expect(verifyRealtimeToken(createRealtimeToken("u", -10, secret), secret)).toBeNull();
});

test("publisher auth", () => {
  expect(isAuthorizedPublisher(`Bearer ${secret}`, secret)).toBe(true);
  expect(isAuthorizedPublisher("Bearer nope", secret)).toBe(false);
  expect(isAuthorizedPublisher(null, secret)).toBe(false);
});
