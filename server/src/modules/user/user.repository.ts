import { UserModel } from "./user.model";
import { CreateUserDto, UpdateUserDto } from "./user.dto";
import { User, UserDocument  } from "./user.types";

export class UserRepository {
  async create(data: CreateUserDto): Promise<UserDocument> {
    return UserModel.create(data);
  }

  async findById(id: string): Promise<UserDocument  | null> {
    return UserModel.findById(id);
  }

  async update(
    id: string,
    data: UpdateUserDto
  ): Promise<UserDocument  | null> {
    return UserModel.findByIdAndUpdate(id, data, {
      new: true,
    });
  }

  async delete(id: string): Promise<UserDocument  | null> {
    return UserModel.findByIdAndDelete(id);
  }
}

export const userRepository = new UserRepository();