import { z } from "zod";

const objectIdRegex = /^[0-9a-fA-F]{24}$/;

export const boardRecoveryRequestSchema = z.object({
  boardId: z
    .string()
    .regex(objectIdRegex, "Invalid boardId format. Must be a 24-character hexadecimal ObjectId."),
});

export type BoardRecoveryRequestInput = z.infer<
  typeof boardRecoveryRequestSchema
>;
