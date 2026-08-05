import { useEffect } from "react";

import { useAuthStore } from "@/store";

import { authApi } from "../api";

export const useAuthSession = (): void => {
  const setUser = useAuthStore((state) => state.setUser);
  const clearUser = useAuthStore((state) => state.clearUser);
  const setLoading = useAuthStore((state) => state.setLoading);

  useEffect(() => {
    const initializeSession = async (): Promise<void> => {
      try {
        const response = await authApi.getCurrentUser();

        setUser(response.data.user);
      } catch {
        clearUser();
      } finally {
        setLoading(false);
      }
    };

    void initializeSession();
  }, [setUser, clearUser, setLoading]);
};