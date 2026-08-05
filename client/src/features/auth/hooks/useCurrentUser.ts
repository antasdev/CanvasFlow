import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";

import { useAuthStore } from "@/store";

import { authApi } from "../api";


export const useCurrentUser = () => {
  const setUser = useAuthStore(
    (state) => state.setUser
  );

  const query = useQuery({
    queryKey: ["current-user"],
    queryFn: authApi.getCurrentUser,
  });


  useEffect(() => {
    if (query.data) {
      setUser(query.data.data.user);
    }
  }, [query.data, setUser]);


  return query;
};