import { useEffect } from "react";

import { useAuthStore } from "@/store";
import { authApi } from "../api";

export const useAuthSession = (): void => {
  const setAccessToken = useAuthStore((state) => state.setAccessToken);
  const setUser = useAuthStore((state) => state.setUser);
  const clearUser = useAuthStore((state) => state.clearUser);
  const setLoading = useAuthStore((state) => state.setLoading);

  useEffect(() => {
    const initializeSession = async (): Promise<void> => {
      try {
        const refreshResponse = await authApi.refreshSession();

        setAccessToken(refreshResponse.data.accessToken);

        const currentUserResponse = await authApi.getCurrentUser();

        setUser(currentUserResponse.data.user);
      } catch {
        clearUser();
      } finally {
        setLoading(false);
      }
    };

    void initializeSession();
  }, [setAccessToken, setUser, clearUser, setLoading]);
};