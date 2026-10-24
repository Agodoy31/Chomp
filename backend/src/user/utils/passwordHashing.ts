import argon2 from 'argon2';

export async function hashPassword(password: string): Promise<string> {
  return await argon2.hash(password);
}

export async function comparePasswords(enteredPassword: string, storedPassword: string): Promise<boolean> {
  return await argon2.verify(storedPassword, enteredPassword);
}