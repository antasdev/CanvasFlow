import { Types } from "mongoose";

async function verifyFlow() {
  console.log("Starting End-to-End API flow verification...");

  // 1. Register a fresh user
  const email = `testuser_${Date.now()}@example.com`;
  const password = "Password123!";
  const regRes = await fetch("http://localhost:5000/api/v1/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      fullName: "E2E Test User",
      email,
      password,
    }),
  });
  const regData = (await regRes.json()) as any;
  if (!regRes.ok || !regData.data?.tokens?.accessToken) {
    throw new Error(`Registration failed: ${JSON.stringify(regData)}`);
  }
  const token = regData.data.tokens.accessToken;
  console.log("✓ User registered and authenticated.");

  // 2. Create a workspace
  const wsRes = await fetch("http://localhost:5000/api/v1/workspaces", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      name: "E2E Verification Workspace",
      visibility: "PRIVATE",
    }),
  });
  const wsData = (await wsRes.json()) as any;
  if (!wsRes.ok || !wsData.data?.id) {
    throw new Error(`Workspace creation failed: ${JSON.stringify(wsData)}`);
  }
  const workspaceId = wsData.data.id;
  console.log("✓ Workspace created:", workspaceId);

  // 3. Create a new Board
  const boardRes = await fetch("http://localhost:5000/api/v1/boards", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      workspaceId,
      name: "E2E Verification Board",
      description: "Testing default canvas provisioning",
    }),
  });
  const boardData = (await boardRes.json()) as any;
  if (!boardRes.ok || !boardData.data?._id) {
    throw new Error(`Board creation failed: ${JSON.stringify(boardData)}`);
  }
  const boardId = boardData.data._id;
  console.log("✓ Board created:", boardId);

  // 4. Verify GET /api/v1/canvases/board/:boardId returns the default canvas
  const canvasRes = await fetch(`http://localhost:5000/api/v1/canvases/board/${boardId}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  const canvasData = (await canvasRes.json()) as any;
  if (!canvasRes.ok || !Array.isArray(canvasData.data) || canvasData.data.length === 0) {
    throw new Error(`Failed to fetch default canvas: ${JSON.stringify(canvasData)}`);
  }

  const defaultCanvas = canvasData.data[0];
  console.log("Default Canvas received:", defaultCanvas);

  if (defaultCanvas.name !== "Page 1") {
    throw new Error(`Expected canvas name 'Page 1', got '${defaultCanvas.name}'`);
  }
  if (defaultCanvas.order !== 1) {
    throw new Error(`Expected canvas order 1, got ${defaultCanvas.order}`);
  }
  if (defaultCanvas.backgroundColor !== "#FFFFFF") {
    throw new Error(`Expected backgroundColor '#FFFFFF', got '${defaultCanvas.backgroundColor}'`);
  }
  console.log("✓ GET /api/v1/canvases/board/:boardId returned default Canvas (Page 1, order: 1, #FFFFFF).");

  // 5. Create a shape (rectangle) on the default canvas
  const canvasId = defaultCanvas._id;
  const shapeRes = await fetch("http://localhost:5000/api/v1/shapes", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      canvasId,
      type: "rectangle",
      x: 100,
      y: 150,
      width: 200,
      height: 120,
      rotation: 0,
      style: {
        fill: "#4f46e5",
        stroke: "#312e81",
        strokeWidth: 2,
        opacity: 1,
      },
    }),
  });
  const shapeData = (await shapeRes.json()) as any;
  if (!shapeRes.ok || !shapeData.data?.id) {
    throw new Error(`Shape creation failed: ${JSON.stringify(shapeData)}`);
  }
  const shapeId = shapeData.data.id;
  console.log("✓ Shape created on default canvas:", shapeId);

  // 6. Verify shape persistence via GET /api/v1/shapes/canvas/:canvasId
  const getShapesRes = await fetch(`http://localhost:5000/api/v1/shapes/canvas/${canvasId}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  const getShapesData = (await getShapesRes.json()) as any;
  if (!getShapesRes.ok || !Array.isArray(getShapesData.data) || getShapesData.data.length === 0) {
    throw new Error(`Failed to fetch shapes: ${JSON.stringify(getShapesData)}`);
  }
  const persistedShape = getShapesData.data[0];
  if (persistedShape.id !== shapeId || persistedShape.x !== 100 || persistedShape.y !== 150) {
    throw new Error(`Persisted shape data mismatch: ${JSON.stringify(persistedShape)}`);
  }
  console.log("✓ Shape persistence verified on canvas.");

  console.log("\nAll end-to-end API flows passed successfully!\n");
}

verifyFlow().catch((err) => {
  console.error("E2E Verification failed:", err);
  process.exit(1);
});
