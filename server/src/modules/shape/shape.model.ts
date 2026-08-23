import { Schema, model } from "mongoose";

import {
  Shape,
  ShapeType,
} from "./shape.types";

const shapeSchema = new Schema<Shape>(
  {
    canvasId: {
      type: Schema.Types.ObjectId,
      ref: "Canvas",
      required: true,
      index: true,
    },

    type: {
      type: String,
      enum: Object.values(ShapeType),
      required: true,
    },

    x: {
      type: Number,
      required: true,
    },

    y: {
      type: Number,
      required: true,
    },

    width: {
      type: Number,
      required: true,
    },

    height: {
      type: Number,
      required: true,
    },

    rotation: {
      type: Number,
      default: 0,
    },

    zIndex: {
      type: Number,
      required: true,
    },

    style: {
      type: Schema.Types.Mixed,
      default: {},
    },

    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    version: {
      type: Number,
      required: true,
      default: 1,
      min: 1,
    },
  },
  {
    timestamps: true,
  }
);

/**
 * Indexes
 */
shapeSchema.index({
  canvasId: 1,
  zIndex: 1,
});

export const ShapeModel = model<Shape>(
  "Shape",
  shapeSchema
);