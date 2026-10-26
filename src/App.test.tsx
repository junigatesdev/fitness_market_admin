import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const auth = vi.hoisted(() => ({
  restoreSession: vi.fn(),
  signIn: vi.fn(),
  signOut: vi.fn(),
  onSignedOut: vi.fn(),
}));
vi.mock('./auth', () => auth);

import { App } from './App';

beforeEach(() => {
  auth.restoreSession.mockResolvedValue(null);
  auth.signIn.mockResolvedValue('admin@fitnessmarket.com');
  auth.signOut.mockResolvedValue(undefined);
  auth.onSignedOut.mockReturnValue(() => {});
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

async function login() {
  await userEvent.type(await screen.findByLabelText('Email'), 'admin@fitnessmarket.com');
  await userEvent.type(screen.getByLabelText('Password'), 'secret');
  await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
}

describe('App', () => {
  it('shows the login page when there is no session', async () => {
    render(<App />);
    expect(await screen.findByLabelText('Email')).toBeTruthy();
  });

  it('shows the error from a failed sign-in', async () => {
    auth.signIn.mockRejectedValue(new Error('This account is not an admin.'));
    render(<App />);
    await login();
    expect((await screen.findByRole('alert')).textContent).toBe('This account is not an admin.');
  });

  it('opens the dashboard after sign-in, and sign out returns to login', async () => {
    render(<App />);
    await login();
    expect(await screen.findByRole('heading', { name: 'Dashboard' })).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(await screen.findByLabelText('Email')).toBeTruthy();
    expect(auth.signOut).toHaveBeenCalled();
  });

  it('goes straight to the dashboard when a session is restored', async () => {
    auth.restoreSession.mockResolvedValue('admin@fitnessmarket.com');
    render(<App />);
    expect(await screen.findByRole('heading', { name: 'Dashboard' })).toBeTruthy();
  });

  it('returns to login when the session ends elsewhere', async () => {
    let ended = () => {};
    auth.onSignedOut.mockImplementation((cb: () => void) => {
      ended = cb;
      return () => {};
    });
    auth.restoreSession.mockResolvedValue('admin@fitnessmarket.com');
    render(<App />);
    await screen.findByRole('heading', { name: 'Dashboard' });
    act(ended);
    expect(await screen.findByLabelText('Email')).toBeTruthy();
  });

  it('menu button toggles the navigation and sections switch', async () => {
    auth.restoreSession.mockResolvedValue('admin@fitnessmarket.com');
    render(<App />);
    const menu = await screen.findByRole('button', { name: 'Open menu' });
    await userEvent.click(menu);
    expect(menu.getAttribute('aria-expanded')).toBe('true');
    await userEvent.click(screen.getByRole('button', { name: /Foods/ }));
    expect(menu.getAttribute('aria-expanded')).toBe('false');
    expect(screen.getByText('This section is coming soon.')).toBeTruthy();
  });
});

