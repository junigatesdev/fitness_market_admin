import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { App } from './App';

beforeEach(() => sessionStorage.clear());
afterEach(cleanup);

async function login(user: string, pass: string) {
  await userEvent.type(screen.getByLabelText('Username'), user);
  await userEvent.type(screen.getByLabelText('Password'), pass);
  await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
}

describe('App', () => {
  it('rejects wrong credentials', async () => {
    render(<App />);
    await login('abc', 'wrong');
    expect((await screen.findByRole('alert')).textContent).toBe('Wrong username or password.');
  });

  it('abc / abc opens the dashboard, and sign out returns to login', async () => {
    render(<App />);
    await login('abc', 'abc');
    expect(await screen.findByRole('heading', { name: 'Dashboard' })).toBeTruthy();
    expect(screen.getByText('Recent activity')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(screen.getByLabelText('Username')).toBeTruthy();
  });

  it('keeps the session across a reload', async () => {
    render(<App />);
    await login('abc', 'abc');
    cleanup();
    render(<App />);
    expect(screen.getByRole('heading', { name: 'Dashboard' })).toBeTruthy();
  });

  it('menu button toggles the navigation and sections switch', async () => {
    render(<App />);
    await login('abc', 'abc');
    const menu = await screen.findByRole('button', { name: 'Open menu' });
    await userEvent.click(menu);
    expect(menu.getAttribute('aria-expanded')).toBe('true');
    await userEvent.click(screen.getByRole('button', { name: /Foods/ }));
    expect(menu.getAttribute('aria-expanded')).toBe('false');
    expect(screen.getByText('This section is coming soon.')).toBeTruthy();
  });
});
