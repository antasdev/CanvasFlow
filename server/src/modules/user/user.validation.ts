import { z } from "zod";

import { Regex } from "@/shared/constants";

export const createUserSchema = z.object({
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

export const updateUserSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(2, "Full name must be at least 2 characters.")
    .max(100, "Full name cannot exceed 100 characters.")
    .optional(),
});

export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;