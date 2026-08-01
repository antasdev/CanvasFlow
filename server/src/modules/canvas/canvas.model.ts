import { Schema, model } from "mongoose";

import {
  Canvas,
} from "./canvas.types";


const canvasSchema = new Schema<Canvas>(
  {
    boardId: {
      type: Schema.Types.ObjectId,
      ref: "Board",
      required: true,
    },

    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },

    order: {
      type: Number,
      required: true,
      min: 1,
    },

    backgroundColor: {
      type: String,
      default: "#FFFFFF",
    },

    thumbnail: {
      type: String,
    },
  },
  {
    timestamps: true,
  }
);


/**
 * Optimize fetching pages of a board
 */
canvasSchema.index({
  boardId: 1,
  order: 1,
});


export const CanvasModel =
  model<Canvas>(
    "Canvas",
    canvasSchema
  );