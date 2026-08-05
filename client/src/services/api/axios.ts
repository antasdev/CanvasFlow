import axios from "axios";

import { appConfig } from "@/config";
import { useAuthStore } from "@/store";

export const api = axios.create({
  baseURL: appConfig.apiUrl,
  timeout: appConfig.api.timeout,
  headers: {
    "Content-Type": "application/json",
  },
  withCredentials: true,
});

api.interceptors.request.use((config) => {
  const { accessToken } = useAuthStore.getState();

  if (accessToken) {
    config.headers.Authorization = `Bearer ${accessToken}`;
  }

  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    // Future:
    // - Handle 401 responses
    // - Refresh access token
    // - Retry original request

    return Promise.reject(error);
  },
);