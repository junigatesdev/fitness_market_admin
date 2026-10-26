export interface LoginErrors {
  username?: string;
  password?: string;
}

export function validateLogin(username: string, password: string): LoginErrors {
  const errors: LoginErrors = {};
  if (!username.trim()) errors.username = 'Enter your username.';
  if (!password) errors.password = 'Enter your password.';
  return errors;
}
