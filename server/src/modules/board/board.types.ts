import { HydratedDocument, Types } from "mongoose";

/**
 * Board Visibility
 */
export enum BoardVisibility {
  PRIVATE = "PRIVATE",
  PUBLIC = "PUBLIC",
}

/**
 * Board Entity
 */
export type Board = {
  _id: Types.ObjectId;

  workspaceId: Types.ObjectId;

  name: string;
  description?: string;

  createdBy: Types.ObjectId;

  visibility: BoardVisibility;

  isArchived: boolean;

  createdAt: Date;
  updatedAt: Date;
};

/**
 * Data used to create a board
 */
export type CreateBoardData = {
  workspaceId: Types.ObjectId;

  name: string;
  description?: string;

  createdBy: Types.ObjectId;
};

/**
 * Board Document
 */
export type BoardDocument = HydratedDocument<Board>;