import { HydratedDocument, Types } from "mongoose";

/**
 * User Roles
 */
export enum UserRole {
  USER = "USER",
  ADMIN = "ADMIN",
}

/**
 * Authentication Provider
 */
export enum AuthProvider {
  LOCAL = "LOCAL",
  GOOGLE = "GOOGLE",
  GITHUB = "GITHUB",
  MICROSOFT = "MICROSOFT",
}

/**
 * Account Status
 */
export enum UserStatus {
  ACTIVE = "ACTIVE",
  PENDING_VERIFICATION = "PENDING_VERIFICATION",
  SUSPENDED = "SUSPENDED",
  DELETED = "DELETED",
}

/**
 * User Profile
 */
export type UserProfile = {
  avatar?: string;
  bio?: string;
  timezone?: string;
  language?: string;
};

/**
 * User Preferences
 */
export type UserPreferences = {
  theme: "light" | "dark" | "system";
  notificationsEnabled: boolean;
  onboardingCompleted: boolean;
};

/**
 * User Security
 */
export type UserSecurity = {
  failedLoginAttempts: number;
  lockUntil?: Date;
  passwordChangedAt?: Date;
  lastLogin?: Date;
  refreshTokenVersion: number;
};

/**
 * User Entity
 */
export type User = {
  _id: Types.ObjectId;

  fullName: string;
  email: string;
  password: string;

  role: UserRole;
  provider: AuthProvider;
  status: UserStatus;

  emailVerified: boolean;

  profile: UserProfile;

  preferences: UserPreferences;

  security: UserSecurity;

  createdAt: Date;
  updatedAt: Date;
};

export type UserDocument = HydratedDocument<User>;