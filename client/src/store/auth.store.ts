import { create } from "zustand";

import type { AuthUser } from "@/features/auth/types";

type AuthState = {
  user: AuthUser | null;
  accessToken: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
};

type AuthActions = {
  setUser: (user: AuthUser) => void;
  setAccessToken: (token: string) => void;
  clearUser: () => void;
  setLoading: (loading: boolean) => void;
};

type AuthStore = AuthState & AuthActions;

export const useAuthStore = create<AuthStore>((set) => ({
  user: null,
  accessToken: null,
  isAuthenticated: false,
  isLoading: true,

  setUser: (user) =>
    set({
      user,
      isAuthenticated: true,
    }),

  setAccessToken: (token) =>
    set({
      accessToken: token,
    }),

  clearUser: () =>
    set({
      user: null,
      accessToken: null,
      isAuthenticated: false,
    }),

  setLoading: (loading) =>
    set({
      isLoading: loading,
    }),
}));