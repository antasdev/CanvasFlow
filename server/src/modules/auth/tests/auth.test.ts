import { createServer } from "http";
import mongoose from "mongoose";

import app from "@/app";
import env from "@/config/env";
import { UserModel } from "@/modules/user/user.model";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

async function runAuthTests(): Promise<void> {
  console.log("Starting Authentication Integration Tests...\n");

  let isDbConnected = false;
  try {
    await mongoose.connect(env.MONGODB_URI);
    isDbConnected = true;
    console.log("Connected to MongoDB for auth testing.");
  } catch (err) {
    console.warn("MongoDB connection unavailable, skipping tests:", err);
    return;
  }

  const httpServer = createServer(app);

  await new Promise<void>((resolve) => {
    httpServer.listen(0, () => resolve());
  });

  const address = httpServer.address();
  const port = typeof address === "object" && address ? address.port : 0;
  const baseUrl = `http://localhost:${port}/api/v1/auth`;

  const testEmail = `auth_test_${Date.now()}@example.com`;
  const testPassword = "Password123!";
  const testFullName = "Auth Test User";
  let createdUserId: string | null = null;
  let refreshCookie: string | null = null;
  let accessToken: string | null = null;

  try {
    // 1. Successful Registration
    console.log("Test 1: Register new user with valid credentials...");
    const regRes = await fetch(`${baseUrl}/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fullName: testFullName,
        email: testEmail,
        password: testPassword,
      }),
    });

    assert(regRes.status === 201, `Expected status 201, got ${regRes.status}`);
    const regBody = (await regRes.json()) as any;
    assert(regBody.success === true, "Response success must be true");
    assert(!!regBody.data?.accessToken, "Response must include accessToken");
    assert(regBody.data?.user?.email === testEmail.toLowerCase(), "User email must match");
    assert(regBody.data?.user?.fullName === testFullName, "User full name must match");
    assert(!("password" in regBody.data.user), "User object must not leak password");

    createdUserId = regBody.data.user.id || regBody.data.user._id;
    accessToken = regBody.data.accessToken;

    // 2. Register sets refreshToken cookie
    console.log("Test 2: Verifying refreshToken cookie is set on registration...");
    const rawSetCookie = regRes.headers.get("set-cookie") || "";
    assert(!!rawSetCookie, "Set-Cookie header must be present on register");
    assert(rawSetCookie.includes("refreshToken="), "Cookie must contain refreshToken");
    assert(rawSetCookie.toLowerCase().includes("httponly"), "Cookie must be HttpOnly");

    // Extract cookie value for subsequent requests
    const cookieMatch = rawSetCookie.match(/refreshToken=([^;]+)/);
    assert(!!cookieMatch, "Could not extract refreshToken from Set-Cookie");
    refreshCookie = `refreshToken=${cookieMatch![1]}`;
    console.log("✓ Registration succeeded and issued HTTP-only refreshToken cookie.");

    // 3. Duplicate Email Rejection
    console.log("Test 3: Rejecting duplicate email registration...");
    const dupRes = await fetch(`${baseUrl}/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fullName: "Duplicate User",
        email: testEmail,
        password: testPassword,
      }),
    });
    assert(dupRes.status === 409, `Expected 409 Conflict, got ${dupRes.status}`);
    console.log("✓ Duplicate email rejected with 409 Conflict.");

    // 4. Invalid Email Rejection
    console.log("Test 4: Rejecting invalid email format...");
    const invalidEmailRes = await fetch(`${baseUrl}/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fullName: "Test User",
        email: "not-an-email",
        password: testPassword,
      }),
    });
    assert(invalidEmailRes.status === 400, `Expected 400 Bad Request, got ${invalidEmailRes.status}`);
    console.log("✓ Invalid email rejected with 400 Bad Request.");

    // 5. Weak Password Rejection
    console.log("Test 5: Rejecting weak password (missing special char / digit)...");
    const weakPassRes = await fetch(`${baseUrl}/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fullName: "Weak Pass User",
        email: `weak_${Date.now()}@example.com`,
        password: "simplepassword",
      }),
    });
    assert(weakPassRes.status === 400, `Expected 400 Bad Request, got ${weakPassRes.status}`);
    console.log("✓ Weak password rejected with 400 Bad Request.");

    // 6. Successful Login
    console.log("Test 6: Logging in with valid credentials...");
    const loginRes = await fetch(`${baseUrl}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: testEmail,
        password: testPassword,
      }),
    });
    assert(loginRes.status === 200, `Expected 200 OK, got ${loginRes.status}`);
    const loginBody = (await loginRes.json()) as any;
    assert(loginBody.success === true, "Login success must be true");
    assert(!!loginBody.data?.accessToken, "Login must return accessToken");
    assert(loginBody.data?.user?.email === testEmail.toLowerCase(), "Login email must match");

    const loginSetCookie = loginRes.headers.get("set-cookie") || "";
    assert(!!loginSetCookie && loginSetCookie.includes("refreshToken="), "Login must set refreshToken cookie");
    const newCookieMatch = loginSetCookie.match(/refreshToken=([^;]+)/);
    refreshCookie = `refreshToken=${newCookieMatch![1]}`;
    accessToken = loginBody.data.accessToken;
    console.log("✓ Login succeeded with valid credentials.");

    // 7. Invalid Login Credentials
    console.log("Test 7: Rejecting invalid credentials...");
    const badLoginRes = await fetch(`${baseUrl}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: testEmail,
        password: "WrongPassword123!",
      }),
    });
    assert(badLoginRes.status === 401, `Expected 401 Unauthorized, got ${badLoginRes.status}`);
    console.log("✓ Invalid credentials rejected with 401 Unauthorized.");

    // 8. Session Restoration / Refresh Token
    console.log("Test 8: Refreshing access token via HTTP-only cookie...");
    const refreshRes = await fetch(`${baseUrl}/refresh`, {
      method: "POST",
      headers: {
        Cookie: refreshCookie,
      },
    });
    assert(refreshRes.status === 200, `Expected 200 OK, got ${refreshRes.status}`);
    const refreshBody = (await refreshRes.json()) as any;
    assert(!!refreshBody.data?.accessToken, "Refresh must return new accessToken");
    assert(refreshBody.data?.user?.email === testEmail.toLowerCase(), "Refresh user must match");

    const rotatedSetCookie = refreshRes.headers.get("set-cookie") || "";
    assert(!!rotatedSetCookie, "Token rotation should set new cookie");
    const rotatedCookieMatch = rotatedSetCookie.match(/refreshToken=([^;]+)/);
    refreshCookie = `refreshToken=${rotatedCookieMatch![1]}`;
    accessToken = refreshBody.data.accessToken;
    console.log("✓ Token refreshed and rotated successfully.");

    // 9. Current User Profile (/me)
    console.log("Test 9: Accessing /me with valid access token...");
    const meRes = await fetch(`${baseUrl}/me`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
    assert(meRes.status === 200, `Expected 200 OK, got ${meRes.status}`);
    const meBody = (await meRes.json()) as any;
    assert(meBody.data?.user?.email === testEmail.toLowerCase(), "/me user email must match");
    console.log("✓ Authenticated /me endpoint returned current user profile.");

    // 10. Unauthenticated /me Rejection
    console.log("Test 10: Accessing /me without authorization header...");
    const unauthMeRes = await fetch(`${baseUrl}/me`);
    assert(unauthMeRes.status === 401, `Expected 401 Unauthorized, got ${unauthMeRes.status}`);
    console.log("✓ Unauthenticated /me request rejected with 401.");

    // 11. Logout & Cookie Invalidation
    console.log("Test 11: Logging out user and clearing cookie...");
    const logoutRes = await fetch(`${baseUrl}/logout`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
    assert(logoutRes.status === 200, `Expected 200 OK, got ${logoutRes.status}`);
    const logoutSetCookie = logoutRes.headers.get("set-cookie") || "";
    assert(!!logoutSetCookie, "Logout must issue Set-Cookie to clear refreshToken");
    assert(
      logoutSetCookie.includes("refreshToken=;") ||
      logoutSetCookie.toLowerCase().includes("expires=") ||
      logoutSetCookie.toLowerCase().includes("max-age=0"),
      "Logout cookie must be expired or cleared"
    );
    console.log("✓ Logout succeeded and cleared refreshToken cookie.");

    // 12. Refresh After Logout Fails (Token Version Invalidation)
    console.log("Test 12: Verifying revoked token version cannot refresh...");
    const postLogoutRefreshRes = await fetch(`${baseUrl}/refresh`, {
      method: "POST",
      headers: {
        Cookie: refreshCookie,
      },
    });
    assert(
      postLogoutRefreshRes.status === 401,
      `Expected 401 Unauthorized for invalidated token, got ${postLogoutRefreshRes.status}`
    );
    console.log("✓ Invalidation verified: revoked token rejected with 401.");

  } finally {
    // Cleanup test user
    if (createdUserId) {
      await UserModel.findByIdAndDelete(createdUserId);
    }
    await new Promise<void>((resolve) => {
      httpServer.close(() => resolve());
    });
    await mongoose.disconnect();
    console.log("MongoDB disconnected and test data cleaned up.");
  }

  console.log("\nAll Authentication Integration Tests Passed Successfully!\n");
}

runAuthTests().catch((error) => {
  console.error("Auth tests failed:", error);
  process.exit(1);
});
