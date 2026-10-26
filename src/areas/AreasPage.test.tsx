import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({
  listAreas: vi.fn(), addArea: vi.fn(), renameArea: vi.fn(), deleteArea: vi.fn(), reorderAreas: vi.fn(),
}));
vi.mock('./api', () => api);

import { AreasPage } from './AreasPage';

const LIST = [
  { id: 'g', name: 'Global', sortOrder: 1, foodCount: 67 },
  { id: 'w', name: 'Western', sortOrder: 2, foodCount: 1 },
  { id: 's', name: 'South Asian', sortOrder: 3, foodCount: 15 },
];

beforeEach(() => {
  api.listAreas.mockResolvedValue(LIST);
  for (const k of ['addArea', 'renameArea', 'deleteArea', 'reorderAreas'] as const) api[k].mockResolvedValue(undefined);
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

const row = (name: string) => screen.getByText(name).closest('li')!;

describe('AreasPage', () => {
  it('lists areas with food counts', async () => {
    render(<AreasPage />);
    await screen.findByText('Western');
    expect(within(row('Global')).getByText('67 foods')).toBeTruthy();
    expect(within(row('Western')).getByText('1 food')).toBeTruthy();
  });

  it('adds an area at the end of the order', async () => {
    render(<AreasPage />);
    await userEvent.type(await screen.findByLabelText('New area name'), 'East Asian');
    await userEvent.click(screen.getByRole('button', { name: 'Add area' }));
    expect(api.addArea).toHaveBeenCalledWith('East Asian', 4);
  });

  it('rejects a duplicate name without calling the server', async () => {
    render(<AreasPage />);
    await userEvent.type(await screen.findByLabelText('New area name'), 'western');
    await userEvent.click(screen.getByRole('button', { name: 'Add area' }));
    expect((await screen.findByRole('alert')).textContent).toContain('already exists');
    expect(api.addArea).not.toHaveBeenCalled();
  });

  it('renames an area', async () => {
    render(<AreasPage />);
    await userEvent.click(within((await screen.findByText('Western')).closest('li')!).getByRole('button', { name: 'Rename' }));
    const input = screen.getByLabelText('Rename Western');
    await userEvent.clear(input);
    await userEvent.type(input, 'Western culture');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(api.renameArea).toHaveBeenCalledWith('w', 'Western culture');
  });

  it('reorders by swapping with the neighbour; the ends cannot move outwards', async () => {
    render(<AreasPage />);
    await userEvent.click(await screen.findByRole('button', { name: 'Move South Asian up' }));
    expect(api.reorderAreas).toHaveBeenCalledWith(['g', 's', 'w']);
    expect((screen.getByRole('button', { name: 'Move Global up' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'Move South Asian down' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('deletes only after confirmation, and says the foods are kept', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
    render(<AreasPage />);
    const south = (await screen.findByText('South Asian')).closest('li')!;
    await userEvent.click(within(south).getByRole('button', { name: 'Delete' }));
    expect(api.deleteArea).not.toHaveBeenCalled();
    await userEvent.click(within(south).getByRole('button', { name: 'Delete' }));
    expect(confirm.mock.calls[0][0]).toContain('removed from its 15 foods; the foods are kept');
    expect(api.deleteArea).toHaveBeenCalledWith('s');
  });

  it('shows the server error and keeps the list when a change fails', async () => {
    api.deleteArea.mockRejectedValue(new Error('Could not delete: nope'));
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<AreasPage />);
    await userEvent.click(within((await screen.findByText('Western')).closest('li')!).getByRole('button', { name: 'Delete' }));
    expect((await screen.findByRole('alert')).textContent).toBe('Could not delete: nope');
    expect(screen.getByText('Western')).toBeTruthy();
  });

  it('has an empty state', async () => {
    api.listAreas.mockResolvedValue([]);
    render(<AreasPage />);
    expect(await screen.findByText('No areas yet')).toBeTruthy();
  });
});
