export const PASSWORD_REQUIREMENTS =
  "Password must be at least 10 characters and include an uppercase letter, a lowercase letter, a number, and a special character.";

export function isValidPassword(password: string): boolean {
  return password.length >= 10 &&
    /[A-Z]/.test(password) &&
    /[a-z]/.test(password) &&
    /[0-9]/.test(password) &&
    /[^A-Za-z0-9\s]/.test(password);
}
