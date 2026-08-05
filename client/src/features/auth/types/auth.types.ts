export type UserRole = "owner" | "admin" | "editor" | "viewer";

export type AuthUser = {
  id: string;
  fullName: string;
  email: string;
  role: UserRole;
  avatar?: string | null;
};

export type LoginRequest = {
  email: string;
  password: string;
};

export type RegisterRequest = {
  fullName: string;
  email: string;
  password: string;
  confirmPassword: string;
};

export type AuthTokens = {
  accessToken: string;
};

export type AuthResponse = {
  success: boolean;
  data: {
    user: AuthUser;
    accessToken: string;
  };
};

export type LogoutResponse = {
  success: boolean;
  message: string;
};

export type CurrentUserResponse = {
  success: boolean;
  message: string;
  data: {
    user: AuthUser;
  };
};

