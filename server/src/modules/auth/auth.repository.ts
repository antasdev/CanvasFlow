import { UserModel } from "../user/user.model";
import { UserDocument } from "../user/user.types";

export class AuthRepository {
  async findByEmail(email: string): Promise<UserDocument | null> {
    return UserModel.findOne({ email });
  }

  async updateLastLogin(userId: string): Promise<UserDocument | null> {
    return UserModel.findByIdAndUpdate(
      userId,
      {
        "security.lastLogin": new Date(),
      },
      {
        new: true,
      }
    );
  }

  async incrementRefreshTokenVersion(
    userId: string
  ): Promise<UserDocument | null> {
    return UserModel.findByIdAndUpdate(
      userId,
      {
        $inc: {
          "security.refreshTokenVersion": 1,
        },
      },
      {
        new: true,
      }
    );
  }
}

export const authRepository = new AuthRepository();