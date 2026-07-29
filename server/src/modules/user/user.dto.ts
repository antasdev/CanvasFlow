import { UserPreferences, UserProfile } from "./user.types";

/**
 * Data required to create a new user.
 */
export type CreateUserDto = {
  fullName: string;
  email: string;
  password: string;
};

/**
 * Data allowed when updating a user.
 */
export type UpdateUserDto = {
  fullName?: string;
  profile?: UserProfile;
  preferences?: UserPreferences;
};