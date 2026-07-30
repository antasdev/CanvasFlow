import dotenv from "dotenv";
import { z } from "zod";
import type { StringValue } from "ms";

dotenv.config();

const envSchema = z.object({
  PORT: z.string().default("5000"),

  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),

  MONGODB_URI: z.string().min(1, "MONGODB_URI is required."),

  JWT_ACCESS_SECRET: z
    .string()
    .min(1, "JWT_ACCESS_SECRET is required."),

  JWT_REFRESH_SECRET: z
    .string()
    .min(1, "JWT_REFRESH_SECRET is required."),

  JWT_ACCESS_EXPIRES_IN: z.custom<StringValue>(
    (value) => typeof value === "string",
    {
      message: "JWT_ACCESS_EXPIRES_IN is required.",
    }
  ),

  JWT_REFRESH_EXPIRES_IN: z.custom<StringValue>(
    (value) => typeof value === "string",
    {
      message: "JWT_REFRESH_EXPIRES_IN is required.",
    }
  ),
});

const env = envSchema.parse(process.env);

export default env;