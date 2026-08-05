import { api } from "@/services/api";

import type {
  AuthResponse,
  CurrentUserResponse,
  LoginRequest,
  LogoutResponse,
  RegisterRequest,
} from "../types";

class AuthApi {
  async register(data: RegisterRequest): Promise<AuthResponse> {
    const response = await api.post<AuthResponse>("/auth/register", data);

    return response.data;
  }

  async login(data: LoginRequest): Promise<AuthResponse> {
    const response = await api.post<AuthResponse>("/auth/login", data);

    return response.data;
  }

  async logout(): Promise<LogoutResponse> {
    const response = await api.post<LogoutResponse>("/auth/logout");

    return response.data;
  }

  async getCurrentUser(): Promise<CurrentUserResponse> {
    const response = await api.get<CurrentUserResponse>("/auth/me");

    return response.data;
  }

  async refreshSession(): Promise<AuthResponse> {
    const response = await api.post<AuthResponse>("/auth/refresh");

    return response.data;
  }
}

export const authApi = new AuthApi();