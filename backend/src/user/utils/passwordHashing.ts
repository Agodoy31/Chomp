// TODO:: implement real hashing function with salts

export async function hashPassword(password: string): Promise<string>{
    return "password";
}

export async function comparePasswords(enteredPassword: string, storedPassword: string): Promise<boolean>{
    return true;
}