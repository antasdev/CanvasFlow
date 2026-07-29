import { Types } from "mongoose";

export class ObjectIdUtil {
  static isValid(id: string): boolean {
    return Types.ObjectId.isValid(id);
  }
}