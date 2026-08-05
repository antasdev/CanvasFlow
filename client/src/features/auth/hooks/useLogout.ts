import { useMutation } from "@tanstack/react-query";

import { useAuthStore } from "@/store";

import { authApi } from "../api";

export const useLogout = () => {
  const clearUser = useAuthStore((state) => state.clearUser);

  return useMutation({
    mutationFn: authApi.logout,

    onSuccess: () => {
      clearUser();
    },
  });
};