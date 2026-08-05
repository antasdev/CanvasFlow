import { useMutation } from "@tanstack/react-query";

import { authApi } from "../api";

export const useRegister = () => {
  return useMutation({
    mutationFn: authApi.register,
  });
};