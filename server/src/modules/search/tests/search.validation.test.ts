import {
  escapeRegex,
  encodeCursor,
  decodeCursor,
  searchQuerySchema,
} from "../search.validation";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

async function runSearchValidationTests(): Promise<void> {
  console.log("Starting Search Validation & Utility Tests...\n");

  // 1. escapeRegex utility
  console.log("1. Testing escapeRegex...");
  const specialChars = ".*+?^${}()|[]\\";
  const escaped = escapeRegex(`hello (${specialChars}) world`);
  assert(
    escaped === "hello \\(\\\.\\\*\\\+\\\?\\\^\\\$\\\{\\\}\\\(\\\)\\\|\\\[\\\]\\\\\\) world",
    "All regex special characters must be properly backslash-escaped"
  );
  const regex = new RegExp(escaped, "i");
  assert(regex.test("hello (.*+?^${}()|[]\\) world"), "Regex matches literal string correctly");
  assert(!regex.test("hello any word"), "Regex does not match wildcard patterns");
  console.log("✓ escapeRegex verified.");

  // 2. Cursor encode & decode
  console.log("2. Testing cursor encoding & decoding...");
  const testDate = new Date("2026-09-10T12:00:00.000Z");
  const testId = "507f1f77bcf86cd799439011";
  const encoded = encodeCursor(testDate, testId);
  assert(typeof encoded === "string" && encoded.length > 0, "Encoded cursor is non-empty string");

  const decoded = decodeCursor(encoded);
  assert(decoded !== null, "Decoded cursor must not be null");
  assert(decoded!.timestamp.getTime() === testDate.getTime(), "Decoded timestamp matches original");
  assert(decoded!.id === testId, "Decoded id matches original");

  // 3. Corrupt and invalid cursors
  console.log("3. Testing invalid cursor rejection...");
  assert(decodeCursor("invalid-base64-random") === null, "Malformed base64 returns null");
  assert(decodeCursor(Buffer.from("not json").toString("base64url")) === null, "Non-JSON base64 returns null");
  assert(
    decodeCursor(Buffer.from(JSON.stringify({ timestamp: "invalid", id: testId })).toString("base64url")) === null,
    "Non-numeric timestamp returns null"
  );
  assert(
    decodeCursor(Buffer.from(JSON.stringify({ timestamp: Date.now(), id: "short-id" })).toString("base64url")) === null,
    "Invalid ObjectId format returns null"
  );
  console.log("✓ Cursor encoding and decoding verified.");

  // 4. searchQuerySchema - Valid requests
  console.log("4. Testing searchQuerySchema valid inputs...");
  const validWorkspaceSearch = searchQuerySchema.safeParse({
    query: {
      q: "diagram",
      scope: "workspace",
      workspaceId: "507f1f77bcf86cd799439011",
      limit: "15",
    },
  });
  assert(validWorkspaceSearch.success, "Valid workspace search schema should pass");
  if (validWorkspaceSearch.success) {
    assert(validWorkspaceSearch.data.query.limit === 15, "Limit coerced to integer");
    assert(validWorkspaceSearch.data.query.q === "diagram", "Query preserved");
  }

  const validBoardSearch = searchQuerySchema.safeParse({
    query: {
      q: "architecture",
      scope: "board",
      boardId: "507f1f77bcf86cd799439022",
      types: "canvas,shape",
      cursor: encoded,
    },
  });
  assert(validBoardSearch.success, "Valid board search with cursor and types should pass");
  if (validBoardSearch.success) {
    assert(
      Array.isArray(validBoardSearch.data.query.types) &&
        validBoardSearch.data.query.types.length === 2 &&
        validBoardSearch.data.query.types.includes("canvas") &&
        validBoardSearch.data.query.types.includes("shape"),
      "Comma-separated types parsed correctly into array"
    );
  }

  // 5. searchQuerySchema - Invalid requests
  console.log("5. Testing searchQuerySchema validation rejections...");

  // Empty query
  const emptyQuery = searchQuerySchema.safeParse({
    query: {
      q: "",
      scope: "workspace",
      workspaceId: "507f1f77bcf86cd799439011",
    },
  });
  assert(!emptyQuery.success, "Empty query must fail validation");

  // Whitespace only query
  const whitespaceQuery = searchQuerySchema.safeParse({
    query: {
      q: "     ",
      scope: "workspace",
      workspaceId: "507f1f77bcf86cd799439011",
    },
  });
  assert(!whitespaceQuery.success, "Whitespace-only query must fail validation");

  // Missing scope ID
  const missingWorkspaceId = searchQuerySchema.safeParse({
    query: {
      q: "test",
      scope: "workspace",
    },
  });
  assert(!missingWorkspaceId.success, "Workspace scope without workspaceId must fail");

  const missingBoardId = searchQuerySchema.safeParse({
    query: {
      q: "test",
      scope: "board",
    },
  });
  assert(!missingBoardId.success, "Board scope without boardId must fail");

  // Invalid scope enum
  const invalidScope = searchQuerySchema.safeParse({
    query: {
      q: "test",
      scope: "global",
    },
  });
  assert(!invalidScope.success, "Unsupported scope 'global' must fail");

  // Query length bounds
  const overlongQuery = searchQuerySchema.safeParse({
    query: {
      q: "a".repeat(101),
      scope: "board",
      boardId: "507f1f77bcf86cd799439022",
    },
  });
  assert(!overlongQuery.success, "Query longer than 100 characters must fail");

  // Limit bounds
  const excessiveLimit = searchQuerySchema.safeParse({
    query: {
      q: "test",
      scope: "board",
      boardId: "507f1f77bcf86cd799439022",
      limit: 100,
    },
  });
  assert(!excessiveLimit.success, "Limit greater than 50 must fail");

  const negativeLimit = searchQuerySchema.safeParse({
    query: {
      q: "test",
      scope: "board",
      boardId: "507f1f77bcf86cd799439022",
      limit: 0,
    },
  });
  assert(!negativeLimit.success, "Limit less than 1 must fail");

  // Malformed cursor
  const badCursor = searchQuerySchema.safeParse({
    query: {
      q: "test",
      scope: "board",
      boardId: "507f1f77bcf86cd799439022",
      cursor: "invalid-cursor",
    },
  });
  assert(!badCursor.success, "Malformed cursor string must fail validation");

  console.log("✓ searchQuerySchema validation tests completed successfully.\n");
}

runSearchValidationTests()
  .then(() => {
    console.log("All Search Validation Tests Passed!");
    process.exit(0);
  })
  .catch((err) => {
    console.error("Search Validation Tests Failed:", err);
    process.exit(1);
  });
