/**
 * Common regular expressions used throughout the application.
 */
export const Regex = {
  /**
   * Basic email validation.
   */
  EMAIL: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,

  /**
   * At least:
   * - 8 characters
   * - One uppercase
   * - One lowercase
   * - One number
   * - One special character
   */
  PASSWORD:
    /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&^#()_\-+=])[A-Za-z\d@$!%*?&^#()_\-+=]{8,}$/,

  /**
   * Letters, numbers, underscore and hyphen.
   */
  USERNAME: /^[a-zA-Z0-9_-]+$/,

  /**
   * 24-character MongoDB ObjectId.
   */
  OBJECT_ID: /^[a-f\d]{24}$/i,
} as const;