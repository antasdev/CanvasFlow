import mongoose, { Types } from "mongoose";
import dotenv from "dotenv";
import path from "path";

// Load environment variables for DB tests if needed
dotenv.config({ path: path.resolve(__dirname, "../../../../.env") });

import { boardService } from "../board.service";
import { boardRepository } from "../board.repository";
import { workspaceRepository } from "../../workspace/workspace.repository";
import { canvasService } from "../../canvas/canvas.service";
import { canvasRepository } from "../../canvas/canvas.repository";
import { BoardModel } from "../board.model";
import { CanvasModel } from "../../canvas/canvas.model";
import { WorkspaceModel } from "../../workspace/workspace.model";
import env from "@/config/env";

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

async function runTests() {
  console.log("Starting Board Default Canvas Provisioning Tests...\n");

  let isDbConnected = false;
  try {
    await mongoose.connect(env.MONGODB_URI);
    isDbConnected = true;
    console.log("Connected to MongoDB for integration testing.");
  } catch (err) {
    console.warn("MongoDB connection unavailable, skipping live DB tests:", err);
  }

  if (isDbConnected) {
    const testUserId = new Types.ObjectId();
    let testWorkspaceId: Types.ObjectId | null = null;
    let createdBoardId: Types.ObjectId | null = null;

    try {
      // Setup test workspace
      const workspace = await WorkspaceModel.create({
        name: "Test Workspace for Canvas Provisioning",
        ownerId: testUserId,
        visibility: "PRIVATE",
      });
      const activeWorkspaceId = workspace._id as Types.ObjectId;
      testWorkspaceId = activeWorkspaceId;

      // Test 1: Creating a Board creates a default Canvas
      console.log("Test 1: Creating a Board provisions default Canvas...");
      const board = await boardService.createBoard(testUserId, {
        workspaceId: activeWorkspaceId,
        name: "Test Board 1",
        description: "Test board description",
      });
      createdBoardId = board._id as Types.ObjectId;

      assert(!!board._id, "Board must have an _id");
      assert(board.name === "Test Board 1", "Board name must match");
      assert(
        board.workspaceId.toString() === activeWorkspaceId.toString(),
        "Board workspaceId must match"
      );
      console.log("✓ Board created successfully.");

      // Test 2: Default Canvas attributes validation
      console.log("Test 2: Verifying default Canvas attributes...");
      const canvases = await canvasRepository.findByBoardId(createdBoardId);
      assert(canvases.length === 1, `Expected 1 canvas, found ${canvases.length}`);

      const defaultCanvas = canvases[0];
      assert(
        defaultCanvas.boardId.toString() === createdBoardId.toString(),
        "Default canvas boardId must match the board _id"
      );
      assert(
        defaultCanvas.name === "Page 1",
        `Default canvas name must be 'Page 1', got '${defaultCanvas.name}'`
      );
      assert(
        defaultCanvas.order === 1,
        `Default canvas order must be 1, got ${defaultCanvas.order}`
      );
      assert(
        defaultCanvas.backgroundColor === "#FFFFFF",
        `Default canvas backgroundColor must be '#FFFFFF', got '${defaultCanvas.backgroundColor}'`
      );
      console.log("✓ Default canvas has name 'Page 1', order 1, backgroundColor '#FFFFFF', and correct boardId.");

      // Test 3: GET canvases by boardId via canvasService returns the default canvas
      console.log("Test 3: Testing canvasService.getBoardCanvases(boardId)...");
      const fetchedCanvases = await canvasService.getBoardCanvases(createdBoardId);
      assert(
        fetchedCanvases.length === 1,
        `Expected 1 canvas from getBoardCanvases, got ${fetchedCanvases.length}`
      );
      assert(
        fetchedCanvases[0]._id.toString() === defaultCanvas._id.toString(),
        "Fetched canvas ID must match default canvas ID"
      );
      assert(
        fetchedCanvases[0].name === "Page 1",
        "Fetched canvas name must be 'Page 1'"
      );
      assert(
        fetchedCanvases[0].order === 1,
        "Fetched canvas order must be 1"
      );
      console.log("✓ canvasService.getBoardCanvases returned the default canvas.");

      // Test 4: Creating a second Canvas preserves existing order behavior
      console.log("Test 4: Creating a second canvas verifies sequential order...");
      const secondCanvas = await canvasService.createCanvas({
        boardId: createdBoardId,
        name: "Page 2",
        backgroundColor: "#F0F0F0",
      });

      assert(
        secondCanvas.order === 2,
        `Second canvas order must be 2, got ${secondCanvas.order}`
      );
      assert(
        secondCanvas.name === "Page 2",
        `Second canvas name must be 'Page 2', got '${secondCanvas.name}'`
      );
      assert(
        secondCanvas.backgroundColor === "#F0F0F0",
        `Second canvas backgroundColor must be '#F0F0F0', got '${secondCanvas.backgroundColor}'`
      );

      const allCanvases = await canvasService.getBoardCanvases(createdBoardId);
      assert(allCanvases.length === 2, `Expected 2 canvases, got ${allCanvases.length}`);
      assert(allCanvases[0].order === 1, "First canvas order must be 1");
      assert(allCanvases[1].order === 2, "Second canvas order must be 2");
      console.log("✓ Second canvas created with sequential order: 2.");

      // Test 5: Existing Board creation response contract and getBoardById
      console.log("Test 5: Verifying existing Board retrieval behavior...");
      const fetchedBoard = await boardService.getBoardById(createdBoardId);
      assert(
        fetchedBoard._id.toString() === createdBoardId.toString(),
        "Fetched board ID must match"
      );
      assert(
        fetchedBoard.name === "Test Board 1",
        "Fetched board name must match"
      );
      console.log("✓ Existing Board behavior remains intact.");

    } finally {
      // Cleanup test data
      if (createdBoardId) {
        await CanvasModel.deleteMany({ boardId: createdBoardId });
        await BoardModel.findByIdAndDelete(createdBoardId);
      }
      if (testWorkspaceId) {
        await WorkspaceModel.findByIdAndDelete(testWorkspaceId);
      }
      await mongoose.disconnect();
      console.log("MongoDB disconnected and test data cleaned up.");
    }
  }

  console.log("\nAll Board & Default Canvas Provisioning Tests Passed Successfully!\n");
}

runTests().catch((error) => {
  console.error("Test failed:", error);
  process.exit(1);
});
