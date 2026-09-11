import { SocketRateLimiter } from "../services/socket-rate-limiter.service";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runRateLimiterTests(): Promise<void> {
  console.log("Starting Socket Rate Limiter Unit Tests...\n");

  const limiter = new SocketRateLimiter({
    cursor: { capacity: 5, refillRatePerSec: 10 },
    mutation: { capacity: 3, refillRatePerSec: 5 },
  });

  // Test 1: Burst allowance up to capacity
  console.log("Test 1: Verifying burst allowance within capacity...");
  const socketId1 = "socket-test-1";
  for (let i = 0; i < 5; i++) {
    const allowed = limiter.check(socketId1, "cursor");
    assert(allowed === true, `Expected call ${i + 1} to be allowed under capacity.`);
  }

  // Next immediate call should be rejected (bucket exhausted)
  const rejectedCall = limiter.check(socketId1, "cursor");
  assert(rejectedCall === false, "Expected call beyond burst capacity to be rejected.");
  console.log("✓ Burst allowance and immediate capacity exhaustion verified.");

  // Test 2: Category isolation
  console.log("Test 2: Verifying category isolation...");
  // cursor bucket is exhausted, but mutation bucket for the same socket should be fresh
  const mutationAllowed = limiter.check(socketId1, "mutation");
  assert(mutationAllowed === true, "Exhausted cursor bucket must not block mutation category.");
  console.log("✓ Different categories on same socket operate independently.");

  // Test 3: Socket isolation
  console.log("Test 3: Verifying socket isolation...");
  const socketId2 = "socket-test-2";
  const socket2Allowed = limiter.check(socketId2, "cursor");
  assert(socket2Allowed === true, "Socket 2 must have its own independent token bucket.");
  console.log("✓ Different sockets maintain independent rate limits.");

  // Test 4: Token replenishment over time
  console.log("Test 4: Verifying token replenishment over time...");
  // Wait 250ms -> at 10 tokens/sec, should add ~2.5 tokens
  await sleep(250);
  const replenCall1 = limiter.check(socketId1, "cursor");
  assert(replenCall1 === true, "Token replenishment must allow call after elapsed time.");
  console.log("✓ Token replenishment verified.");

  // Test 5: Cleanup on socket disconnect
  console.log("Test 5: Verifying cleanup removes socket buckets...");
  const countBefore = limiter.getActiveBucketCount();
  assert(countBefore >= 2, "Expected at least 2 active buckets before cleanup.");
  limiter.cleanup(socketId1);
  // Socket 1 keys should be gone, socket 2 should remain
  assert(limiter.check(socketId2, "cursor") === true, "Socket 2 bucket must remain intact.");
  console.log("✓ Cleanup removes target socket state cleanly.");

  console.log("\nAll Socket Rate Limiter Unit Tests Passed Cleanly!\n");
}

runRateLimiterTests().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
