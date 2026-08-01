import { Types } from "mongoose";

/**
 * Board DTOs
 */
export type CreateBoardDto = {
  workspaceId: Types.ObjectId;

  name: string;
  description?: string;
};

export type UpdateBoardDto = {
  name?: string;
  description?: string;
  visibility?: "PRIVATE" | "PUBLIC";
  isArchived?: boolean;
};