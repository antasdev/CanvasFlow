import { z } from "zod";

const workspaceNameSchema = z
  .string()
  .trim()
  .min(2, "Workspace name must be at least 2 characters.")
  .max(100, "Workspace name cannot exceed 100 characters.");

const workspaceDescriptionSchema = z
  .string()
  .trim()
  .max(500, "Description cannot exceed 500 characters.");

  export const createWorkspaceSchema = z.object({
  body: z.object({
    name: workspaceNameSchema,
    description: workspaceDescriptionSchema.optional(),
  }),
});

export const updateWorkspaceSchema = z.object({
  body: z.object({
    name: workspaceNameSchema.optional(),
    description: workspaceDescriptionSchema.optional(),
  }),
});

export const workspaceParamsSchema = z.object({
  params: z.object({
    id: z
      .string()
      .regex(
        /^[0-9a-fA-F]{24}$/,
        "Invalid workspace ID."
      ),
  }),
});