//checks ufl email, name, and password length

export function isUflEmail(email: string): boolean {
    return /^[a-zA-Z0-9._-]+@ufl\.edu$/i.test(email.trim())
}
 
export function isValidName(name: string): boolean {
    return /^[a-zA-Z]+(?:[' -][a-zA-Z]+)*$/.test(name.trim())
}
 
export const MIN_PASSWORD_LENGTH = 8
 