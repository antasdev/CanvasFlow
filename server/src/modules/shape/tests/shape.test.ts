import { Types } from "mongoose";
import { ShapeMapper } from "../shape.mapper";
import { ShapeType, Shape } from "../shape.types";
import {
  createShapeSchema,
  updateShapeValidationSchema,
} from "../shape.validation";

/**
 * Lightweight test assertion helper
 */
function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

async function runTests() {
  console.log("Starting Backend Shape Tests...");

  // 1. DTO & ObjectId -> String Mapping Test
  const mockShapeId = new Types.ObjectId();
  const mockCanvasId = new Types.ObjectId();
  const mockUserId = new Types.ObjectId();
  const mockDate = new Date();

  const mockDoc: Shape = {
    _id: mockShapeId,
    canvasId: mockCanvasId,
    type: ShapeType.RECTANGLE,
    x: 100,
    y: 200,
    width: 300,
    height: 150,
    rotation: 45,
    zIndex: 3,
    style: {
      fill: "#ff0000",
      stroke: "#000000",
      strokeWidth: 4,
      opacity: 0.8,
    },
    createdBy: mockUserId,
    createdAt: mockDate,
    updatedAt: mockDate,
  };

  const responseDto = ShapeMapper.toResponseDto(mockDoc);

  assert(responseDto.id === mockShapeId.toString(), "DTO id must be a string");
  assert(
    responseDto.canvasId === mockCanvasId.toString(),
    "DTO canvasId must be a string"
  );
  assert(
    responseDto.createdBy === mockUserId.toString(),
    "DTO createdBy must be a string"
  );
  assert(responseDto.type === "rectangle", "DTO type must be lowercase rectangle");
  assert(responseDto.x === 100, "DTO x must match");
  assert(responseDto.y === 200, "DTO y must match");
  assert(responseDto.width === 300, "DTO width must match");
  assert(responseDto.height === 150, "DTO height must match");
  assert(responseDto.rotation === 45, "DTO rotation must match");
  assert(responseDto.zIndex === 3, "DTO zIndex must match");
  assert(responseDto.style.fill === "#ff0000", "DTO style.fill must match");
  assert(responseDto.style.stroke === "#000000", "DTO style.stroke must match");
  assert(responseDto.style.strokeWidth === 4, "DTO style.strokeWidth must match");
  assert(responseDto.style.opacity === 0.8, "DTO style.opacity must match");
  assert(
    responseDto.createdAt === mockDate.toISOString(),
    "DTO createdAt must be ISO string"
  );

  console.log("✓ DTO and ObjectId -> string mapping passed.");

  // 2. Default Style Mapping Test
  const mockMinimalDoc: Shape = {
    _id: mockShapeId,
    canvasId: mockCanvasId,
    type: ShapeType.RECTANGLE,
    x: 10,
    y: 20,
    width: 100,
    height: 100,
    rotation: 0,
    zIndex: 1,
    style: {},
    createdBy: mockUserId,
    createdAt: mockDate,
    updatedAt: mockDate,
  };

  const minimalDto = ShapeMapper.toResponseDto(mockMinimalDoc);
  assert(minimalDto.style.fill === "#ffffff", "Default fill should be #ffffff");
  assert(minimalDto.style.stroke === "#1f2937", "Default stroke should be #1f2937");
  assert(minimalDto.style.strokeWidth === 2, "Default strokeWidth should be 2");
  assert(minimalDto.style.opacity === 1, "Default opacity should be 1");
  console.log("✓ Default style mapping passed.");

  // 3. Validation: Valid Create Shape
  const validCreatePayload = {
    body: {
      canvasId: new Types.ObjectId().toString(),
      type: "rectangle",
      x: 50,
      y: 75,
      width: 200,
      height: 120,
      rotation: 0,
      style: {
        fill: "#00ff00",
        stroke: "#111111",
        strokeWidth: 2,
        opacity: 1,
      },
    },
  };

  const parsedCreate = createShapeSchema.safeParse(validCreatePayload);
  assert(parsedCreate.success === true, "Valid create payload must parse successfully");
  if (parsedCreate.success) {
    assert(
      parsedCreate.data.body.type === "RECTANGLE",
      "Parsed type should normalize to RECTANGLE"
    );
  }
  console.log("✓ Valid create shape validation passed.");

  // 4. Validation: Invalid Canvas ID
  const invalidCanvasPayload = {
    body: {
      ...validCreatePayload.body,
      canvasId: "invalid-id",
    },
  };
  const parsedInvalidCanvas = createShapeSchema.safeParse(invalidCanvasPayload);
  assert(
    parsedInvalidCanvas.success === false,
    "Invalid canvasId must fail validation"
  );
  console.log("✓ Invalid canvas ID rejection passed.");

  // 5. Validation: Invalid Width / Height
  const invalidDimensionsPayload = {
    body: {
      ...validCreatePayload.body,
      width: -10,
      height: 0,
    },
  };
  const parsedInvalidDimensions = createShapeSchema.safeParse(
    invalidDimensionsPayload
  );
  assert(
    parsedInvalidDimensions.success === false,
    "Non-positive dimensions must fail validation"
  );
  console.log("✓ Invalid width/height rejection passed.");

  // 6. Validation: Valid Update Shape
  const validUpdatePayload = {
    params: {
      id: new Types.ObjectId().toString(),
    },
    body: {
      x: 120,
      y: 180,
      width: 250,
      height: 140,
      rotation: 15,
      style: {
        fill: "#3b82f6",
      },
    },
  };
  const parsedUpdate = updateShapeValidationSchema.safeParse(validUpdatePayload);
  assert(parsedUpdate.success === true, "Valid update payload must parse successfully");
  console.log("✓ Valid update shape validation passed.");

  // 7. Validation: Invalid Update Params
  const invalidUpdatePayload = {
    params: {
      id: "not-an-objectid",
    },
    body: {
      x: 100,
    },
  };
  const parsedInvalidUpdate = updateShapeValidationSchema.safeParse(
    invalidUpdatePayload
  );
  assert(
    parsedInvalidUpdate.success === false,
    "Invalid update ID parameter must fail validation"
  );
  console.log("✓ Invalid update shape params rejection passed.");

  console.log("\nAll backend shape tests passed successfully!\n");
}

runTests().catch((error) => {
  console.error("Test failed:", error);
  process.exit(1);
});
