import { userRepository } from "./user.repository";
import { CreateUserDto, UpdateUserDto } from "./user.dto";

export class UserService {
  async createUser(data: CreateUserDto) {
    return userRepository.create(data);
  }

  async getUserById(id: string) {
    return userRepository.findById(id);
  }

  async updateUser(id: string, data: UpdateUserDto) {
    return userRepository.update(id, data);
  }

  async deleteUser(id: string) {
    return userRepository.delete(id);
  }
}

export const userService = new UserService();