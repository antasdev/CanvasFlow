export type Canvas = {
  id: string;
  boardId: string;
  name: string;
  order: number;
  backgroundColor: string;
  thumbnail?: string;
  createdAt: string;
  updatedAt: string;
};

export type CreateCanvasRequest = {
  boardId: string;
  name: string;
  backgroundColor?: string;
};