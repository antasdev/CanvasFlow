import {
    RegisterDto,
    LoginDto,
    RefreshTokenDto,
} from "./auth.dto";
import { AuthResponse, JwtPayload } from "./auth.types";

import { authRepository } from "./auth.repository";
import { userRepository } from "../user/user.repository";



import {
    hashPassword,
    comparePassword,
} from "@/shared/utils/password";
import {
    generateAccessToken,
    generateRefreshToken,
    verifyRefreshToken,
} from "./auth.tokens";

import { ApiError } from "@/shared/utils/ApiError";
import { HttpStatus } from "@/shared/constants/http-status";

export class AuthService {
    async register(data: RegisterDto): Promise<AuthResponse> {
        const { email, password, ...userData } = data;

        // Check if user already exists
        const existingUser = await authRepository.findByEmail(email);

        if (existingUser) {
            throw new ApiError(
                HttpStatus.CONFLICT,
                "Email already exists."
            );
        }

        // Hash password
        const hashedPassword = await hashPassword(password);

        // Create user
        const user = await userRepository.create({
            ...userData,
            email,
            password: hashedPassword,
        });

        // Generate JWT payload
        const accessPayload: JwtPayload = {
            userId: user._id.toString(),
            role: user.role,
        };
        const refreshPayload: JwtPayload = {
            userId: user._id.toString(),
            role: user.role,
            version: user.security.refreshTokenVersion,
        };

        // Generate tokens
        const tokens = {
            accessToken: generateAccessToken(accessPayload),
            refreshToken: generateRefreshToken(refreshPayload),
        };

        return {
            user,
            tokens,
        };
    }

    async login(data: LoginDto): Promise<AuthResponse> {
        const { email, password } = data;

        const user = await authRepository.findByEmail(email);

        if (!user) {
            throw new ApiError(
                HttpStatus.UNAUTHORIZED,
                "Invalid email or password."
            );
        }

        const isPasswordValid = await comparePassword(
            password,
            user.password
        );

        if (!isPasswordValid) {
            throw new ApiError(
                HttpStatus.UNAUTHORIZED,
                "Invalid email or password."
            );
        }

        const updatedUser = await authRepository.updateLastLogin(
            user._id.toString()
        );
        const accessPayload: JwtPayload = {
            userId: user._id.toString(),
            role: user.role,
        };

        const refreshPayload: JwtPayload = {
            userId: user._id.toString(),
            role: user.role,
            version: user.security.refreshTokenVersion,
        };

        const tokens = {
            accessToken: generateAccessToken(accessPayload),
            refreshToken: generateRefreshToken(refreshPayload),
        };

        return {
            user: updatedUser ?? user,
            tokens,
        };
    }

    async refreshToken(
        data: RefreshTokenDto
    ): Promise<AuthResponse> {

        let payload: JwtPayload;

        try {
            payload = verifyRefreshToken(
                data.refreshToken
            );
        } catch {
            throw new ApiError(
                HttpStatus.UNAUTHORIZED,
                "Invalid refresh token."
            );
        }

        const user = await userRepository.findById(
            payload.userId
        );

        if (!user) {
            throw new ApiError(
                HttpStatus.UNAUTHORIZED,
                "Invalid refresh token."
            );
        }

        if (
            user.security.refreshTokenVersion !== payload.version
        ) {
            throw new ApiError(
                HttpStatus.UNAUTHORIZED,
                "Refresh token expired."
            );
        }

        const updatedUser =
            await authRepository.incrementRefreshTokenVersion(
                user._id.toString()
            );

        if (!updatedUser) {
            throw new ApiError(
                HttpStatus.UNAUTHORIZED,
                "Unable to refresh token."
            );
        }

        const accessPayload: JwtPayload = {
            userId: updatedUser._id.toString(),
            role: updatedUser.role,
        };

        const refreshPayload: JwtPayload = {
            userId: updatedUser._id.toString(),
            role: updatedUser.role,
            version: updatedUser.security.refreshTokenVersion,
        };

        const tokens = {
            accessToken: generateAccessToken(accessPayload),
            refreshToken: generateRefreshToken(refreshPayload),
        };

        return {
            user: updatedUser,
            tokens,
        };
    }

    async logout(userId: string): Promise<void> {
  await authRepository.incrementRefreshTokenVersion(
    userId
  );
}

}

export const authService = new AuthService();