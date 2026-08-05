import { useMutation } from "@tanstack/react-query";

import { useAuthStore } from "@/store";

import { authApi } from "../api";

export const useLogin = () => {
  const setUser = useAuthStore(
    (state) => state.setUser
  );

  const setAccessToken = useAuthStore(
    (state) => state.setAccessToken
  );

  return useMutation({
  mutationFn: authApi.login,

  onSuccess: (response) => {
  setUser(response.data.user);
  setAccessToken(response.data.accessToken);

},
});
};