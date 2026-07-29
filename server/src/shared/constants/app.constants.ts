/**
 * Application-wide constants.
 */
export const AppConstants = {
  PAGINATION: {
    DEFAULT_PAGE: 1,
    DEFAULT_LIMIT: 10,
    MAX_LIMIT: 100,
  },

  USER: {
    DEFAULT_LANGUAGE: "en",
    DEFAULT_TIMEZONE: "UTC",
  },

  FILE_UPLOAD: {
    MAX_SIZE: 5 * 1024 * 1024, // 5 MB
  },
} as const;