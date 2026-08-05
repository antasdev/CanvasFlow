import type { UserRole } from "@/modules/user/user.types";

export type SanitizedUser = {
  id: string;
  fullName: string;
  email: string;
  role: UserRole;
  avatar: string | null;
};