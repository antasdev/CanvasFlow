import { HttpStatus, Messages } from "@/shared/constants";
import { ApiError } from "@/shared/utils";

import { CreateUserDto, UpdateUserDto } from "./user.dto";
import { userRepository } from "./user.repository";

export class UserService {
  async createUser(data: CreateUserDto) {
    return userRepository.create(data);
  }

  async getUserById(id: string) {
    const user = await userRepository.findById(id);

    if (!user) {
      throw new ApiError(
        HttpStatus.NOT_FOUND,
        Messages.USER_NOT_FOUND
      );
    }

    return user;
  }

  async updateUser(id: string, data: UpdateUserDto) {
    const user = await userRepository.update(id, data);

    if (!user) {
      throw new ApiError(
        HttpStatus.NOT_FOUND,
        Messages.USER_NOT_FOUND
      );
    }

    return user;
  }

  async deleteUser(id: string) {
    const user = await userRepository.delete(id);

    if (!user) {
      throw new ApiError(
        HttpStatus.NOT_FOUND,
        Messages.USER_NOT_FOUND
      );
    }

    return user;
  }
}

export const userService = new UserService();