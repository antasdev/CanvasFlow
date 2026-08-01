import { z } from "zod";


const objectIdSchema = z
  .string()
  .regex(
    /^[0-9a-fA-F]{24}$/,
    "Invalid ID format."
  );


const canvasNameSchema = z
  .string()
  .trim()
  .min(
    2,
    "Canvas name must be at least 2 characters."
  )
  .max(
    100,
    "Canvas name cannot exceed 100 characters."
  );


const backgroundColorSchema = z
  .string()
  .trim()
  .optional();


export const createCanvasSchema = z.object({
  body: z.object({
    boardId: objectIdSchema,

    name: canvasNameSchema,

    backgroundColor:
      backgroundColorSchema,
  }),
});


export const updateCanvasValidationSchema =
  z.object({
    params: z.object({
      id: objectIdSchema,
    }),

    body: z.object({
      name: canvasNameSchema.optional(),

      backgroundColor:
        backgroundColorSchema,
    }),
  });


export const canvasParamsSchema = z.object({
  params: z.object({
    id: objectIdSchema,
  }),
});


export const boardCanvasParamsSchema = z.object({
  params: z.object({
    boardId: objectIdSchema,
  }),
});