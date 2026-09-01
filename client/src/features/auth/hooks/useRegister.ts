import { useMutation } from "@tanstack/react-query";

import { useAuthStore } from "@/store";

import { authApi } from "../api";

export const useRegister = () => {
  const setUser = useAuthStore((state) => state.setUser);
  const setAccessToken = useAuthStore((state) => state.setAccessToken);

  return useMutation({
    mutationFn: authApi.register,
    onSuccess: (response) => {
      setUser(response.data.user);
      setAccessToken(response.data.accessToken);
    },
  });
};