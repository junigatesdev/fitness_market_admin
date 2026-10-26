import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LoginPage } from './LoginPage';
import { validateLogin } from './validation';

afterEach(cleanup);

describe('validateLogin', () => {
  it('requires email and password', () => {
    expect(validateLogin('', '')).toEqual({ email: 'Enter your email.', password: 'Enter your password.' });
  });
  it('rejects malformed email', () => {
    expect(validateLogin('nope', 'x').email).toBe('Enter a valid email address.');
  });
  it('accepts valid input', () => {
    expect(validateLogin('a@b.co', 'x')).toEqual({});
  });
});

describe('LoginPage', () => {
  it('shows validation errors and does not call onLogin', async () => {
    const onLogin = vi.fn();
    render(<LoginPage onLogin={onLogin} />);
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(screen.getByText('Enter your email.')).toBeTruthy();
    expect(onLogin).not.toHaveBeenCalled();
  });

  it('submits trimmed email and password', async () => {
    const onLogin = vi.fn().mockResolvedValue(undefined);
    render(<LoginPage onLogin={onLogin} />);
    await userEvent.type(screen.getByLabelText('Email'), ' admin@fitnessmarket.com ');
    await userEvent.type(screen.getByLabelText('Password'), 'secret');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(onLogin).toHaveBeenCalledWith('admin@fitnessmarket.com', 'secret');
  });

  it('shows the error when sign-in fails', async () => {
    render(<LoginPage onLogin={() => Promise.reject(new Error('Wrong email or password.'))} />);
    await userEvent.type(screen.getByLabelText('Email'), 'a@b.co');
    await userEvent.type(screen.getByLabelText('Password'), 'x');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect((await screen.findByRole('alert')).textContent).toBe('Wrong email or password.');
  });

  it('toggles password visibility', async () => {
    render(<LoginPage />);
    const input = screen.getByLabelText('Password') as HTMLInputElement;
    expect(input.type).toBe('password');
    await userEvent.click(screen.getByRole('button', { name: 'Show' }));
    expect(input.type).toBe('text');
  });
});
