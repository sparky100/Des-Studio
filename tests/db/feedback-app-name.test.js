import { describe, it, expect, vi } from 'vitest';

// tests/setup.js globally mocks db/supabase.js (without exporting submitFeedback);
// unmock here to exercise the real implementation via an injected client instead.
// A dynamic import (after stubbing the env vars createClient needs at module
// load time) is required since vi.stubEnv isn't hoisted above static imports.
vi.unmock('../../src/db/supabase.js');
vi.stubEnv('VITE_SUPABASE_URL', 'https://placeholder.supabase.co');
vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'placeholder-anon-key');

const { submitFeedback, APP_NAME } = await import('../../src/db/supabase.js');

describe('submitFeedback app_name round-trip', () => {
  it('tags inserted feedback rows with this app\'s identifier', async () => {
    const insert = vi.fn().mockResolvedValue({ error: null });
    const mockClient = {
      from: vi.fn(() => ({ insert })),
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) },
    };

    await submitFeedback({
      category: 'bug',
      message: 'A message at least ten characters long',
      userId: null,
      appVersion: '1.0',
      pageContext: 'library',
    }, mockClient);

    expect(mockClient.from).toHaveBeenCalledWith('feedback');
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({
      app_name: 'simmodlr',
    }));
    expect(APP_NAME).toBe('simmodlr');
  });
});
