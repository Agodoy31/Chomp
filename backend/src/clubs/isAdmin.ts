import { User } from '../user/models/User';

export function isAdmin(userId: string) {
  return User.exists({ _id: userId, isAdmin: true });
}
