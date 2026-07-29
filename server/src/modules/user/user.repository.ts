import { UserModel } from "./user.model";
import { CreateUserDto, UpdateUserDto } from "./user.dto";

export class UserRepository {
  async create(data: CreateUserDto) {
    return UserModel.create(data);
  }

  async findById(id: string) {
    return UserModel.findById(id);
  }

  async findByEmail(email: string) {
    return UserModel.findOne({ email });
  }

  async update(id: string, data: UpdateUserDto) {
    return UserModel.findByIdAndUpdate(id, data, {
      new: true,
    });
  }

  async delete(id: string) {
    return UserModel.findByIdAndDelete(id);
  }
}

export const userRepository = new UserRepository();