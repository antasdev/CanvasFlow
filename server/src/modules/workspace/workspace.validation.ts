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

export const addWorkspaceMemberSchema = z.object({
  params: z.object({
    id: z
      .string()
      .regex(/^[0-9a-fA-F]{24}$/, "Invalid workspace ID."),
  }),
  body: z.object({
    email: z
      .string()
      .trim()
      .toLowerCase()
      .email("Invalid email address."),
    role: z.enum(
      ["ADMIN", "EDITOR", "VIEWER"],
      { message: "Role must be ADMIN, EDITOR, or VIEWER." }
    ),
  }),
});

export const updateWorkspaceMemberRoleSchema = z.object({
  params: z.object({
    id: z
      .string()
      .regex(/^[0-9a-fA-F]{24}$/, "Invalid workspace ID."),
    memberUserId: z
      .string()
      .regex(/^[0-9a-fA-F]{24}$/, "Invalid member user ID."),
  }),
  body: z.object({
    role: z.enum(
      ["ADMIN", "EDITOR", "VIEWER"],
      { message: "Role must be ADMIN, EDITOR, or VIEWER." }
    ),
  }),
});

export const workspaceMemberParamsSchema = z.object({
  params: z.object({
    id: z
      .string()
      .regex(/^[0-9a-fA-F]{24}$/, "Invalid workspace ID."),
    memberUserId: z
      .string()
      .regex(/^[0-9a-fA-F]{24}$/, "Invalid member user ID."),
  }),
});