import type { UserRole } from "../user/user.types";


export type JwtPayload = {
  userId: string;
  role: UserRole;
  version?: number;
};


export type TokenPair = {
  accessToken: string;
  refreshToken: string;
};


export type SanitizedUser = {
  id: string;
  fullName: string;
  email: string;
  role: UserRole;
  avatar: string | null;
};

export type AuthResponse = {
  user: SanitizedUser;
  tokens: TokenPair;
};