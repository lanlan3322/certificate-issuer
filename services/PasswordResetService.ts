import { requestPasswordReset, resetPassword } from "../lib/auth";

export const PasswordResetService = {
  request: requestPasswordReset,
  reset: resetPassword,
};