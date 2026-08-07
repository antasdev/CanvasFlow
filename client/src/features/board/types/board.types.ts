export type Board = {
  id: string;
  workspaceId: string;
  name: string;
  description?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
};

export type CreateBoardRequest = {
  workspaceId: string;
  name: string;
  description?: string;
};

export type UpdateBoardRequest = {
  name?: string;
  description?: string;
};