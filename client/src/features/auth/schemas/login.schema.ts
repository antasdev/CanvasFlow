import { z } from "zod";

/**
 * Login Schema
 */
export const loginSchema = z.object({
  email: z
    .email("Please enter a valid email address")
    .trim(),

  password: z
    .string()
    .min(1, "Password is required"),
});

export type LoginFormValues = z.infer<typeof loginSchema>;

