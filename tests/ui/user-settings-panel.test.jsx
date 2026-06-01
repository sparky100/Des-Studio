import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UserSettingsPanel } from '../../src/ui/UserSettingsPanel.jsx';

const { mockFetchUserSettings, mockSaveUserSettings } = vi.hoisted(() => ({
  mockFetchUserSettings: vi.fn(),
  mockSaveUserSettings: vi.fn(),
}));

vi.mock('../../src/db/models.js', () => ({
  fetchUserSettings: mockFetchUserSettings,
  saveUserSettings: mockSaveUserSettings,
}));

describe('UserSettingsPanel theme preference', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetchUserSettings.mockResolvedValue({
      schemaVersion: 1,
      settings: {
        ui: { theme: 'light' },
        execute: {},
        ai: {},
      },
    });
    mockSaveUserSettings.mockResolvedValue({
      schemaVersion: 1,
      settings: {
        ui: { theme: 'light' },
        execute: {},
        ai: {},
      },
    });
  });

  it('applies the saved theme when settings load', async () => {
    const onThemeChange = vi.fn();

    render(<UserSettingsPanel userId="user-1" plan="free" onThemeChange={onThemeChange} />);

    await waitFor(() => expect(onThemeChange).toHaveBeenCalledWith('light'));
  });

  it('applies changed theme immediately and persists it without waiting for Save Settings', async () => {
    const onThemeChange = vi.fn();

    render(<UserSettingsPanel userId="user-1" plan="free" onThemeChange={onThemeChange} />);

    await waitFor(() => expect(screen.queryByText('Loading...')).not.toBeInTheDocument());
    fireEvent.click(screen.getByRole('tab', { name: 'UI' }));

    const select = screen.getByDisplayValue('Light');
    fireEvent.change(select, { target: { value: 'high-contrast-dark' } });

    expect(onThemeChange).toHaveBeenCalledWith('high-contrast-dark');

    await waitFor(() => expect(mockSaveUserSettings).toHaveBeenCalled());
    expect(mockSaveUserSettings).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({
        ui: { theme: 'high-contrast-dark' },
      }),
      1
    );
  });
});
