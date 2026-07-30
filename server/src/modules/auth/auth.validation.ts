import { z } from "zod";

import { Regex } from "@/shared/constants";

export const registerSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(2, "Full name must be at least 2 characters.")
    .max(100, "Full name cannot exceed 100 characters."),

  email: z
    .string()
    .trim()
    .toLowerCase()
    .email("Invalid email address."),

  password: z
    .string()
    .regex(
      Regex.PASSWORD,
      "Password must contain at least one uppercase letter, one lowercase letter, one number, one special character, and be at least 8 characters long."
    ),
});

export const loginSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email("Invalid email address."),

  password: z
    .string()
    .min(1, "Password is required."),
});

export const refreshTokenSchema = z.object({
  refreshToken: z
    .string()
    .min(1, "Refresh token is required."),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type RefreshTokenInput = z.infer<typeof refreshTokenSchema>;