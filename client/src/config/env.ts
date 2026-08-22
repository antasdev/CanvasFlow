import { z } from "zod";

const envSchema = z.object({
  VITE_APP_NAME: z.string().default("CanvasFlow"),
  VITE_API_URL: z.string().default("http://localhost:5000/api/v1"),
  VITE_SOCKET_URL: z.string().default("http://localhost:5000"),
});

export const env = envSchema.parse(import.meta.env ?? {});