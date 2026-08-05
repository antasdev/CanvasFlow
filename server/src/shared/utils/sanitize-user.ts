import type { SanitizedUser } from "@/modules/auth/auth.types";
import type { UserDocument } from "@/modules/user/user.types";

export const sanitizeUser = (
  user: UserDocument
): SanitizedUser => {
  return {
    id: user._id.toString(),
    fullName: user.fullName,
    email: user.email,
    role: user.role,
    avatar: user.profile?.avatar ?? null,
  };
};