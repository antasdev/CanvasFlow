import { env } from "./env";

export const appConfig = {
  appName: env.VITE_APP_NAME,
  apiUrl: env.VITE_API_URL,
  socketUrl: env.VITE_SOCKET_URL,

  query: {
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 30,
    retry: 1,
  },

  api: {
    timeout: 10_000,
  },
} as const;