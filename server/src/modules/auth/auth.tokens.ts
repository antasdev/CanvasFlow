import jwt from "jsonwebtoken";

import env from "@/config/env";

import { JwtPayload } from "./auth.types";

export const generateAccessToken = (
  payload: JwtPayload
): string => {
  return jwt.sign(
    payload,
    env.JWT_ACCESS_SECRET,
    {
      expiresIn: env.JWT_ACCESS_EXPIRES_IN,
    }
  );
};

export const generateRefreshToken = (
  payload: JwtPayload
): string => {
  return jwt.sign(
    payload,
    env.JWT_REFRESH_SECRET,
    {
      expiresIn: env.JWT_REFRESH_EXPIRES_IN,
    }
  );
};

export const verifyAccessToken = (
  token: string
): JwtPayload => {
  return jwt.verify(
    token,
    env.JWT_ACCESS_SECRET
  ) as JwtPayload;
};

export const verifyRefreshToken = (
  token: string
): JwtPayload => {
  return jwt.verify(
    token,
    env.JWT_REFRESH_SECRET
  ) as JwtPayload;
};