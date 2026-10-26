// TEMPORARY: lets the placeholder login name through. Remove with the block in auth.ts.
const TEMP_LOGIN = 'abc';

export interface LoginErrors {
  email?: string;
  password?: string;
}

export function validateLogin(email: string, password: string): LoginErrors {
  const errors: LoginErrors = {};
  if (!email.trim()) errors.email = 'Enter your email.';
  else if (email.trim() !== TEMP_LOGIN && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) errors.email = 'Enter a valid email address.';
  if (!password) errors.password = 'Enter your password.';
  return errors;
}
