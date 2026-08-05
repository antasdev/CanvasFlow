import { useQuery } from "@tanstack/react-query";

import { useAuthStore } from "@/store";

import { authApi } from "../api";

export const useCurrentUser = () => {
  const setUser = useAuthStore((state) => state.setUser);
  const setLoading = useAuthStore((state) => state.setLoading);
  const clearUser = useAuthStore((state) => state.clearUser);

  return useQuery({
    queryKey: ["current-user"],
    queryFn: authApi.getCurrentUser,
    retry: false,

    onSuccess: (response) => {
      setUser(response.data.user);
      setLoading(false);
    },

    onError: () => {
      clearUser();
      setLoading(false);
    },
  });
};