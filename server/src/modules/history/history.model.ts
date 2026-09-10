import { Schema, model, models } from "mongoose";
import {
  BoardVersion,
  VersionCanvasSnapshot,
  VersionChangeSummary,
  VersionShapeSnapshot,
  VersionSnapshot,
} from "./history.types";

const shapeConnectorSnapshotSchema = new Schema(
  {
    sourceShapeId: { type: Schema.Types.Mixed, default: null },
    sourceAnchor: {
      type: String,
      enum: ["top", "right", "bottom", "left", "center", null],
      default: null,
    },
    targetShapeId: { type: Schema.Types.Mixed, default: null },
    targetAnchor: {
      type: String,
      enum: ["top", "right", "bottom", "left", "center", null],
      default: null,
    },
    routing: {
      type: String,
      enum: ["straight", "orthogonal", "curved"],
      default: "straight",
    },
  },
  { _id: false }
);

const shapeConfigSnapshotSchema = new Schema(
  {
    sides: { type: Number, required: false },
    points: { type: Number, required: false },
    innerRadiusRatio: { type: Number, required: false },
  },
  { _id: false }
);

const versionShapeSnapshotSchema = new Schema<VersionShapeSnapshot>(
  {
    id: { type: String, required: true },
    canvasId: { type: String, required: true },
    type: { type: String, required: true },
    x: { type: Number, required: true },
    y: { type: Number, required: true },
    width: { type: Number, required: true },
    height: { type: Number, required: true },
    rotation: { type: Number, default: 0 },
    zIndex: { type: Number, required: true },
    text: { type: String, required: false },
    points: { type: [Number], required: false },
    connector: { type: shapeConnectorSnapshotSchema, required: false },
    shapeConfig: { type: shapeConfigSnapshotSchema, required: false },
    style: { type: Schema.Types.Mixed, default: () => ({}) },
    createdBy: { type: String, required: true },
    parentId: { type: String, default: null },
    version: { type: Number, required: true },
    createdAt: { type: String, required: true },
    updatedAt: { type: String, required: true },
  },
  { _id: false }
);

const versionCanvasSnapshotSchema = new Schema<VersionCanvasSnapshot>(
  {
    canvasId: { type: String, required: true },
    name: { type: String, required: true },
    order: { type: Number, required: true },
    backgroundColor: { type: String, default: "#FFFFFF" },
    thumbnail: { type: String, required: false },
    shapes: { type: [versionShapeSnapshotSchema], default: [] },
  },
  { _id: false }
);

const versionSnapshotSchema = new Schema<VersionSnapshot>(
  {
    canvases: { type: [versionCanvasSnapshotSchema], default: [] },
    shapeCount: { type: Number, required: true, default: 0 },
  },
  { _id: false }
);

const versionChangeSummarySchema = new Schema<VersionChangeSummary>(
  {
    shapesCreated: { type: Number, required: false },
    shapesUpdated: { type: Number, required: false },
    shapesDeleted: { type: Number, required: false },
    description: { type: String, required: false },
  },
  { _id: false }
);

const boardVersionSchema = new Schema<BoardVersion>(
  {
    boardId: {
      type: Schema.Types.ObjectId,
      ref: "Board",
      required: true,
      index: true,
    },
    versionNumber: {
      type: Number,
      required: true,
      min: 1,
    },
    name: {
      type: String,
      trim: true,
      maxlength: 100,
      default: "",
    },
    description: {
      type: String,
      trim: true,
      maxlength: 500,
      default: "",
    },
    trigger: {
      type: String,
      enum: ["manual", "automatic"],
      default: "manual",
      required: true,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    collaborationRevision: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },
    snapshot: {
      type: versionSnapshotSchema,
      required: true,
    },
    changeSummary: {
      type: versionChangeSummarySchema,
      required: false,
    },
    isNamed: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
    collection: "board_versions",
  }
);

// Compound unique index ensuring monotonically increasing version numbers per board
boardVersionSchema.index(
  {
    boardId: 1,
    versionNumber: -1,
  },
  {
    unique: true,
  }
);

// Timeline ordering index
boardVersionSchema.index({
  boardId: 1,
  createdAt: -1,
});

// Filter by trigger type on timeline
boardVersionSchema.index({
  boardId: 1,
  trigger: 1,
  createdAt: -1,
});

const MODEL_NAME = "BoardVersion";

export const BoardVersionModel =
  models[MODEL_NAME] || model<BoardVersion>(MODEL_NAME, boardVersionSchema);
