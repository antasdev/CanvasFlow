/**
 * Standard API messages used throughout the application.
 */
export const Messages = {
  // Common
  SUCCESS: "Request completed successfully.",
  INTERNAL_SERVER_ERROR: "Internal server error.",
  INVALID_REQUEST: "Invalid request data.",
  RESOURCE_NOT_FOUND: "Requested resource not found.",

  // User
  USER_CREATED: "User created successfully.",
  USER_UPDATED: "User updated successfully.",
  USER_DELETED: "User deleted successfully.",
  USER_FOUND: "User fetched successfully.",
  USER_NOT_FOUND: "User not found.",

  // Workspace
  WORKSPACE_CREATED: "Workspace created successfully.",
  WORKSPACE_UPDATED: "Workspace updated successfully.",
  WORKSPACE_DELETED: "Workspace deleted successfully.",
  WORKSPACE_FOUND: "Workspace fetched successfully.",
  WORKSPACE_NOT_FOUND: "Workspace not found.",

  // Authentication
  INVALID_CREDENTIALS: "Invalid email or password.",
  UNAUTHORIZED: "Unauthorized access.",
  FORBIDDEN: "Access denied.",
  EMAIL_ALREADY_EXISTS: "Email is already registered.",
  EMAIL_VERIFIED: "Email verified successfully.",

  // Board
  BOARD_NOT_FOUND: "Board not found.",

  // Canvas
  CANVAS_NOT_FOUND: "Canvas not found.",
};