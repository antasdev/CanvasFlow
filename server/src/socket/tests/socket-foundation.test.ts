import { createServer } from "http";
import { Types } from "mongoose";
import { io as clientIO, Socket as ClientSocket } from "socket.io-client";

import { generateAccessToken } from "@/modules/auth/auth.tokens";
import { UserRole } from "@/modules/user/user.types";
import {
  getBoardRoom,
  getCanvasRoom,
  SocketEvents,
  socketAuthMiddleware,
  SocketServer,
} from "../index";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

async function runSocketFoundationTests(): Promise<void> {
  console.log("Starting Socket.IO Foundation Tests...\n");

  // 1. Room Helper Determinism
  console.log("Test 1: Verifying room helpers...");
  const sampleBoardId = "675000000000000000000001";
  const sampleCanvasId = "675000000000000000000002";

  assert(
    getBoardRoom(sampleBoardId) === `board:${sampleBoardId}`,
    "getBoardRoom must produce 'board:<boardId>'"
  );
  assert(
    getCanvasRoom(sampleCanvasId) === `canvas:${sampleCanvasId}`,
    "getCanvasRoom must produce 'canvas:<canvasId>'"
  );
  console.log("✓ Room helpers produced deterministic room identifiers.");

  // 2. Middleware Unit Tests: Missing Token
  console.log("Test 2: Middleware rejection on missing token...");
  let middlewareError: Error | undefined;
  const mockSocketMissingToken: any = {
    handshake: { auth: {}, headers: {} },
    data: {},
  };

  socketAuthMiddleware(mockSocketMissingToken, (err) => {
    middlewareError = err;
  });

  assert(
    middlewareError !== undefined,
    "Middleware must call next() with error when token is missing"
  );
  assert(
    middlewareError?.message === "Authentication required: token missing.",
    `Expected 'Authentication required: token missing.', got '${middlewareError?.message}'`
  );
  console.log("✓ Middleware rejected missing token cleanly.");

  // 3. Middleware Unit Tests: Invalid Token
  console.log("Test 3: Middleware rejection on invalid token...");
  let invalidTokenError: Error | undefined;
  const mockSocketInvalidToken: any = {
    handshake: { auth: { token: "Bearer invalid.jwt.token" }, headers: {} },
    data: {},
  };

  socketAuthMiddleware(mockSocketInvalidToken, (err) => {
    invalidTokenError = err;
  });

  assert(
    invalidTokenError !== undefined,
    "Middleware must call next() with error when token is invalid"
  );
  assert(
    invalidTokenError?.message === "Authentication failed: invalid token.",
    `Expected 'Authentication failed: invalid token.', got '${invalidTokenError?.message}'`
  );
  console.log("✓ Middleware rejected invalid token cleanly.");

  // 4. Middleware Unit Tests: Valid Token
  console.log("Test 4: Middleware acceptance on valid token...");
  const validUserId = new Types.ObjectId();
  const validToken = generateAccessToken({
    userId: validUserId.toString(),
    role: UserRole.USER,
  });

  let validAuthError: Error | undefined;
  const mockSocketValidToken: any = {
    handshake: { auth: { token: `Bearer ${validToken}` }, headers: {} },
    data: {},
  };

  socketAuthMiddleware(mockSocketValidToken, (err) => {
    validAuthError = err;
  });

  assert(validAuthError === undefined, "Middleware must succeed on valid token");
  assert(
    mockSocketValidToken.data.user !== undefined,
    "socket.data.user must be populated"
  );
  assert(
    mockSocketValidToken.data.user.userId.toString() === validUserId.toString(),
    "socket.data.user.userId must match token subject"
  );
  assert(
    mockSocketValidToken.data.user.role === UserRole.USER,
    "socket.data.user.role must match token role"
  );
  console.log("✓ Middleware accepted valid token and attached user to socket.data.user.");

  // 5. Integration Test: Live SocketServer Authentication & Disconnect
  console.log("Test 5: Live HTTP SocketServer connection and lifecycle...");
  const httpServer = createServer();
  const socketServer = new SocketServer(httpServer);

  await new Promise<void>((resolve) => {
    httpServer.listen(0, () => resolve());
  });

  const address = httpServer.address();
  const port = typeof address === "object" && address ? address.port : 0;
  const serverUrl = `http://localhost:${port}`;

  try {
    // 5a. Attempt unauthenticated connection
    console.log("  5a: Verifying unauthenticated live client connection rejection...");
    await new Promise<void>((resolve, reject) => {
      const client = clientIO(serverUrl, {
        auth: { token: "" },
        transports: ["websocket"],
        reconnection: false,
      });

      client.on("connect", () => {
        client.disconnect();
        reject(new Error("Unauthenticated client should not have connected"));
      });

      client.on("connect_error", (err) => {
        assert(
          err.message.includes("Authentication required"),
          `Expected authentication error, got: ${err.message}`
        );
        client.disconnect();
        resolve();
      });
    });
    console.log("  ✓ Unauthenticated client connection rejected by server.");

    // 5b. Authenticated connection
    console.log("  5b: Verifying authenticated live client connection...");
    const authClient = await new Promise<ClientSocket>((resolve, reject) => {
      const client = clientIO(serverUrl, {
        auth: { token: `Bearer ${validToken}` },
        transports: ["websocket"],
        reconnection: false,
      });

      client.on("connect", () => {
        resolve(client);
      });

      client.on("connect_error", (err) => {
        reject(err);
      });
    });

    assert(authClient.connected === true, "Client should be connected");
    console.log("  ✓ Authenticated client connected successfully.");

    // 5c. Disconnect lifecycle
    console.log("  5c: Verifying client disconnect lifecycle...");
    await new Promise<void>((resolve) => {
      authClient.on(SocketEvents.DISCONNECT, () => {
        resolve();
      });
      authClient.disconnect();
    });

    assert(authClient.connected === false, "Client should be disconnected");
    console.log("  ✓ Client disconnected cleanly.");
  } finally {
    await socketServer.close();
    await new Promise<void>((resolve) => {
      httpServer.close(() => resolve());
    });
  }

  console.log("\nAll Socket.IO Foundation Tests Passed Successfully!\n");
}

runSocketFoundationTests().catch((error) => {
  console.error("Test failed:", error);
  process.exit(1);
});
