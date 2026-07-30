import { UserRole } from "../user/user.types";
import { UserDocument } from "../user/user.types";

export type LoginCredentials = {
  email: string;
  password: string;
};

export type JwtPayload = {
  userId: string;
  role: UserRole;
  version?: number;
};

export type TokenPair = {
  accessToken: string;
  refreshToken: string;
};

export type AuthUser = {
  userId: string;
  email: string;
  role: UserRole;
};

export type AuthResponse = {
  user: UserDocument;
  tokens: TokenPair;
};