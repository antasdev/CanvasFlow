export type RegisterDto = {
  fullName: string;
  email: string;
  password: string;
};

export type LoginDto = {
  email: string;
  password: string;
};

export type RefreshTokenDto = {
  refreshToken: string;
};