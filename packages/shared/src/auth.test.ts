import { describe, expect, it } from "vitest";

import { loginRequestSchema, signupRequestSchema } from "./auth";

const validSignup = {
  username: "  Artur   Chichorro  ",
  email: "  ARTUR@EXAMPLE.COM  ",
  password: "  a password with spaces  ",
  accessCode: "  household-code  ",
};

const validLogin = {
  email: "  ARTUR@EXAMPLE.COM  ",
  password: "  a password with spaces  ",
};

describe("signupRequestSchema", () => {
  it("normalizes username, email, and access code without changing the password", () => {
    expect(signupRequestSchema.parse(validSignup)).toEqual({
      username: "artur chichorro",
      email: "artur@example.com",
      password: "  a password with spaces  ",
      accessCode: "household-code",
    });
  });

  it.each([
    "ab",
    "a".repeat(33),
  ])("rejects a username outside the normalized 3–32 character range", (username) => {
    expect(
      signupRequestSchema.safeParse({ ...validSignup, username }).success,
    ).toBe(false);
  });

  it("rejects an invalid email address", () => {
    expect(
      signupRequestSchema.safeParse({
        ...validSignup,
        email: "not-an-email",
      }).success,
    ).toBe(false);
  });

  it.each([
    "a".repeat(11),
    "a".repeat(129),
  ])("rejects a password outside the 12–128 character range", (password) => {
    expect(
      signupRequestSchema.safeParse({ ...validSignup, password }).success,
    ).toBe(false);
  });

  it.each([
    " ",
    undefined,
  ])("rejects a missing or blank access code", (accessCode) => {
    expect(
      signupRequestSchema.safeParse({ ...validSignup, accessCode }).success,
    ).toBe(false);
  });

  it("rejects unexpected request fields", () => {
    expect(
      signupRequestSchema.safeParse({
        ...validSignup,
        unexpected: "value",
      }).success,
    ).toBe(false);
  });
});

describe("loginRequestSchema", () => {
  it("normalizes the email", () => {
    expect(loginRequestSchema.parse(validLogin).email).toBe(
      "artur@example.com",
    );
  });

  it("preserves password exactly", () => {
    expect(loginRequestSchema.parse(validLogin).password).toBe(
      "  a password with spaces  ",
    );
  });

  it("rejects invalid emails", () => {
    expect(
      loginRequestSchema.safeParse({
        ...validLogin,
        email: "not-an-email",
      }).success,
    ).toBe(false);
  });

  it.each([
    123,
    "a".repeat(129),
  ])("rejects non string or oversized passwords", (password) => {
    expect(
      loginRequestSchema.safeParse({ ...validLogin, password }).success,
    ).toBe(false);
  });

  it("rejects unknown fields", () => {
    expect(
      loginRequestSchema.safeParse({
        ...validLogin,
        unexpected: "value",
      }).success,
    ).toBe(false);
  });

  it("allows an empty password to reach credential verification", () => {
    expect(
      loginRequestSchema.safeParse({
        ...validLogin,
        password: "",
      }).success,
    ).toBe(true);
  });
});
