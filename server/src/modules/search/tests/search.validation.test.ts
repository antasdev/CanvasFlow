import {
  escapeRegex,
  encodeCursor,
  encodeV2Cursor,
  decodeCursor,
  searchQuerySchema,
} from "../search.validation";
import { CompositeCursorPayload } from "../search.types";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

async function runSearchValidationTests(): Promise<void> {
  console.log("Starting Hardened Search Validation & Utility Tests...\n");

  // 1. escapeRegex utility - Comprehensive metacharacter coverage
  console.log("1. Testing escapeRegex with all 14 regex metacharacters...");
  const metacharacters = [
    ".", "*", "+", "?", "^", "$", "{", "}", "(", ")", "|", "[", "]", "\\"
  ];
  for (const char of metacharacters) {
    const input = `prefix${char}suffix`;
    const escaped = escapeRegex(input);
    const regex = new RegExp(escaped, "i");
    assert(regex.test(input), `Regex must match literal character '${char}'`);
    assert(!regex.test("prefixXsuffix"), `Regex must NOT match arbitrary characters for '${char}'`);
  }

  // Combined metacharacters string
  const rawString = "query [test] (all*+?^${}()|[]\\)";
  const escapedCombined = escapeRegex(rawString);
  const regexCombined = new RegExp(escapedCombined, "i");
  assert(regexCombined.test(rawString), "Combined regex matches literal exact string");
  assert(!regexCombined.test("query test all"), "Combined regex rejects non-matching strings");
  console.log("✓ escapeRegex verified across all individual and combined metacharacters.");

  // 2. V2 Cursor Encoding & Decoding
  console.log("2. Testing V2 composite cursor encoding & decoding...");
  const v2Payload: CompositeCursorPayload = {
    v: 2,
    b: { t: 1789095873876, id: "507f1f77bcf86cd799439011" },
    c: { t: 1789095873800, id: "507f1f77bcf86cd799439022" },
    s: { t: 1789095873750, id: "507f1f77bcf86cd799439033" },
    m: { t: 1789095873700, id: "507f1f77bcf86cd799439044" },
  };

  const encodedV2 = encodeV2Cursor(v2Payload);
  assert(typeof encodedV2 === "string" && encodedV2.length > 0, "Encoded V2 cursor is non-empty string");

  const decodedV2 = decodeCursor(encodedV2);
  assert(decodedV2 !== null, "Decoded V2 cursor must not be null");
  assert(decodedV2!.version === 2, "Decoded version is 2");
  assert(decodedV2!.v2?.v === 2, "Payload version is 2");
  assert(decodedV2!.v2?.b?.t === 1789095873876, "Board timestamp matches");
  assert(decodedV2!.v2?.b?.id === "507f1f77bcf86cd799439011", "Board id matches");
  assert(decodedV2!.v2?.c?.id === "507f1f77bcf86cd799439022", "Canvas id matches");
  assert(decodedV2!.v2?.s?.id === "507f1f77bcf86cd799439033", "Shape id matches");
  assert(decodedV2!.v2?.m?.id === "507f1f77bcf86cd799439044", "Comment id matches");
  console.log("✓ V2 cursor encoding and decoding verified.");

  // 3. V2 Validation Rejections
  console.log("3. Testing V2 validation rejections...");

  // Unknown version
  const badVersion = Buffer.from(JSON.stringify({ v: 3, b: { t: 1000, id: "507f1f77bcf86cd799439011" } })).toString("base64url");
  assert(decodeCursor(badVersion) === null, "Unknown version v: 3 must be rejected");

  // Empty entity payload (v: 2 without any entities)
  const emptyV2 = Buffer.from(JSON.stringify({ v: 2 })).toString("base64url");
  assert(decodeCursor(emptyV2) === null, "V2 with no entity cursors must be rejected");

  // Unexpected keys
  const extraKeysV2 = Buffer.from(JSON.stringify({
    v: 2,
    b: { t: 1000, id: "507f1f77bcf86cd799439011" },
    unexpected: "danger",
  })).toString("base64url");
  assert(decodeCursor(extraKeysV2) === null, "V2 with unexpected keys must be rejected");

  // Invalid entity cursor fields
  const extraEntityKeys = Buffer.from(JSON.stringify({
    v: 2,
    b: { t: 1000, id: "507f1f77bcf86cd799439011", extra: 123 },
  })).toString("base64url");
  assert(decodeCursor(extraEntityKeys) === null, "Entity cursor with extra keys must be rejected");

  // Negative timestamp
  const negativeTs = Buffer.from(JSON.stringify({
    v: 2,
    b: { t: -100, id: "507f1f77bcf86cd799439011" },
  })).toString("base64url");
  assert(decodeCursor(negativeTs) === null, "Negative timestamp must be rejected");

  // Float timestamp
  const floatTs = Buffer.from(JSON.stringify({
    v: 2,
    b: { t: 100.55, id: "507f1f77bcf86cd799439011" },
  })).toString("base64url");
  assert(decodeCursor(floatTs) === null, "Float timestamp must be rejected");

  // Invalid ObjectId in V2
  const badIdV2 = Buffer.from(JSON.stringify({
    v: 2,
    b: { t: 1000, id: "invalid-id" },
  })).toString("base64url");
  assert(decodeCursor(badIdV2) === null, "Invalid ObjectId in V2 entity must be rejected");

  // Malformed JSON and base64
  assert(decodeCursor("not-base64-random!@#$") === null, "Malformed Base64URL string must be rejected");
  assert(decodeCursor(Buffer.from("not json").toString("base64url")) === null, "Non-JSON string must be rejected");
  console.log("✓ V2 validation rejection tests passed.");

  // 4. Legacy V1 Cursor Backwards Compatibility
  console.log("4. Testing legacy V1 cursor backwards compatibility...");
  const testDate = new Date("2026-09-10T12:00:00.000Z");
  const testId = "507f1f77bcf86cd799439011";
  const encodedV1 = encodeCursor(testDate, testId);

  const decodedV1 = decodeCursor(encodedV1);
  assert(decodedV1 !== null, "Decoded V1 cursor must not be null");
  assert(decodedV1!.version === 1, "Decoded version is 1");
  assert(decodedV1!.v1?.timestamp === testDate.getTime(), "V1 timestamp matches original");
  assert(decodedV1!.v1?.id === testId, "V1 id matches original");

  // Malformed V1
  const badV1Ts = Buffer.from(JSON.stringify({ timestamp: "invalid", id: testId })).toString("base64url");
  assert(decodeCursor(badV1Ts) === null, "V1 non-numeric timestamp must be rejected");
  const badV1Id = Buffer.from(JSON.stringify({ timestamp: Date.now(), id: "short" })).toString("base64url");
  assert(decodeCursor(badV1Id) === null, "V1 invalid ObjectId must be rejected");
  console.log("✓ Legacy V1 cursor backwards compatibility verified.");

  // 5. searchQuerySchema - Valid requests
  console.log("5. Testing searchQuerySchema valid inputs with V2 and V1 cursors...");
  const validV2Search = searchQuerySchema.safeParse({
    query: {
      q: "diagram",
      scope: "workspace",
      workspaceId: "507f1f77bcf86cd799439011",
      limit: "15",
      cursor: encodedV2,
    },
  });
  assert(validV2Search.success, "Valid search with V2 cursor should pass");
  if (validV2Search.success) {
    assert(validV2Search.data.query.limit === 15, "Limit coerced to integer");
    assert(validV2Search.data.query.q === "diagram", "Query preserved");
  }

  const validV1Search = searchQuerySchema.safeParse({
    query: {
      q: "architecture",
      scope: "board",
      boardId: "507f1f77bcf86cd799439022",
      types: "canvas,shape",
      cursor: encodedV1,
    },
  });
  assert(validV1Search.success, "Valid search with legacy V1 cursor should pass");

  // 6. searchQuerySchema - Validation rejections
  console.log("6. Testing searchQuerySchema validation rejections...");
  const emptyQuery = searchQuerySchema.safeParse({
    query: { q: "", scope: "workspace", workspaceId: "507f1f77bcf86cd799439011" },
  });
  assert(!emptyQuery.success, "Empty query must fail validation");

  const whitespaceQuery = searchQuerySchema.safeParse({
    query: { q: "     ", scope: "workspace", workspaceId: "507f1f77bcf86cd799439011" },
  });
  assert(!whitespaceQuery.success, "Whitespace-only query must fail validation");

  const missingWorkspaceId = searchQuerySchema.safeParse({
    query: { q: "test", scope: "workspace" },
  });
  assert(!missingWorkspaceId.success, "Workspace scope without workspaceId must fail");

  const missingBoardId = searchQuerySchema.safeParse({
    query: { q: "test", scope: "board" },
  });
  assert(!missingBoardId.success, "Board scope without boardId must fail");

  const invalidScope = searchQuerySchema.safeParse({
    query: { q: "test", scope: "global" },
  });
  assert(!invalidScope.success, "Unsupported scope 'global' must fail");

  const badCursor = searchQuerySchema.safeParse({
    query: {
      q: "test",
      scope: "board",
      boardId: "507f1f77bcf86cd799439022",
      cursor: "invalid-cursor",
    },
  });
  assert(!badCursor.success, "Malformed cursor string must fail validation");

  // Empty string cursor should be accepted as undefined (first page)
  const emptyStringCursor = searchQuerySchema.safeParse({
    query: {
      q: "test",
      scope: "board",
      boardId: "507f1f77bcf86cd799439022",
      cursor: "",
    },
  });
  assert(emptyStringCursor.success, "Empty string cursor should pass validation");
  assert(emptyStringCursor.data?.query.cursor === undefined, "Empty string cursor must be transformed to undefined");

  const whitespaceCursor = searchQuerySchema.safeParse({
    query: {
      q: "test",
      scope: "board",
      boardId: "507f1f77bcf86cd799439022",
      cursor: "   ",
    },
  });
  assert(whitespaceCursor.success, "Whitespace cursor should pass validation");
  assert(whitespaceCursor.data?.query.cursor === undefined, "Whitespace cursor must be transformed to undefined");

  console.log("✓ Hardened validation tests completed successfully.\n");
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
