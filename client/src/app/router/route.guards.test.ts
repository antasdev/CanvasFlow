import { describe, expect, it } from "vitest";

import { useAuthStore } from "@/store";

describe("Auth Store & Route Guard State", () => {
  it("initializes in loading state and not authenticated", () => {
    useAuthStore.getState().clearUser();
    useAuthStore.getState().setLoading(true);

    const state = useAuthStore.getState();
    expect(state.isAuthenticated).toBe(false);
    expect(state.isLoading).toBe(true);
    expect(state.user).toBeNull();
    expect(state.accessToken).toBeNull();
  });

  it("updates state correctly on successful login/registration", () => {
    const mockUser = {
      id: "user-123",
      fullName: "Test User",
      email: "test@example.com",
      role: "viewer" as const,
    };

    useAuthStore.getState().setUser(mockUser);
    useAuthStore.getState().setAccessToken("mock.jwt.token");
    useAuthStore.getState().setLoading(false);

    const state = useAuthStore.getState();
    expect(state.isAuthenticated).toBe(true);
    expect(state.isLoading).toBe(false);
    expect(state.user).toEqual(mockUser);
    expect(state.accessToken).toBe("mock.jwt.token");
  });

  it("clears user and token on logout", () => {
    useAuthStore.getState().clearUser();

    const state = useAuthStore.getState();
    expect(state.isAuthenticated).toBe(false);
    expect(state.user).toBeNull();
    expect(state.accessToken).toBeNull();
  });
});
