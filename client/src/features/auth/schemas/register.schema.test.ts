import { describe, expect, it } from "vitest";

import { registerSchema } from "./register.schema";

describe("registerSchema Validation", () => {
  it("validates successfully with correct data", () => {
    const validData = {
      fullName: "Jane Doe",
      email: "jane@example.com",
      password: "Password123!",
      confirmPassword: "Password123!",
    };

    const result = registerSchema.safeParse(validData);
    expect(result.success).toBe(true);
  });

  it("fails when full name is shorter than 2 characters", () => {
    const data = {
      fullName: "J",
      email: "jane@example.com",
      password: "Password123!",
      confirmPassword: "Password123!",
    };

    const result = registerSchema.safeParse(data);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain("at least 2 characters");
    }
  });

  it("fails when email is invalid", () => {
    const data = {
      fullName: "Jane Doe",
      email: "invalid-email",
      password: "Password123!",
      confirmPassword: "Password123!",
    };

    const result = registerSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it("fails when password lacks special characters", () => {
    const data = {
      fullName: "Jane Doe",
      email: "jane@example.com",
      password: "Password123",
      confirmPassword: "Password123",
    };

    const result = registerSchema.safeParse(data);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain("special character");
    }
  });

  it("fails when password lacks numbers", () => {
    const data = {
      fullName: "Jane Doe",
      email: "jane@example.com",
      password: "Password!",
      confirmPassword: "Password!",
    };

    const result = registerSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it("fails when password is shorter than 8 characters", () => {
    const data = {
      fullName: "Jane Doe",
      email: "jane@example.com",
      password: "P1!",
      confirmPassword: "P1!",
    };

    const result = registerSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it("fails when passwords do not match", () => {
    const data = {
      fullName: "Jane Doe",
      email: "jane@example.com",
      password: "Password123!",
      confirmPassword: "Password456!",
    };

    const result = registerSchema.safeParse(data);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe("Passwords do not match");
    }
  });
});
