import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const readEnvFilesMock = vi.hoisted(() => vi.fn());

vi.mock('./env.js', () => ({
  readEnvFiles: readEnvFilesMock,
}));

import { runLocalAgent, shouldUseLocalAgentFallback } from './local-agent.js';

describe('local agent fallback', () => {
  const originalEnv = {
    ANTHROPIC_BASE_URL: process.env.ANTHROPIC_BASE_URL,
    ANTHROPIC_AUTH_TOKEN: process.env.ANTHROPIC_AUTH_TOKEN,
    ANTHROPIC_MODEL: process.env.ANTHROPIC_MODEL,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    readEnvFilesMock.mockReturnValue({});
    vi.stubGlobal('fetch', vi.fn());
    delete process.env.ANTHROPIC_BASE_URL;
    delete process.env.ANTHROPIC_AUTH_TOKEN;
    delete process.env.ANTHROPIC_MODEL;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    process.env.ANTHROPIC_BASE_URL = originalEnv.ANTHROPIC_BASE_URL;
    process.env.ANTHROPIC_AUTH_TOKEN = originalEnv.ANTHROPIC_AUTH_TOKEN;
    process.env.ANTHROPIC_MODEL = originalEnv.ANTHROPIC_MODEL;
  });

  it('enables fallback when config is available from env files', () => {
    readEnvFilesMock.mockReturnValue({
      ANTHROPIC_BASE_URL: 'https://proxy.example.com/v1',
      ANTHROPIC_AUTH_TOKEN: 'token-from-file',
    });

    expect(shouldUseLocalAgentFallback()).toBe(true);
  });

  it('prefers process env over env files and sends Anthropic-compatible content blocks', async () => {
    process.env.ANTHROPIC_BASE_URL = 'https://proxy.example.com';
    process.env.ANTHROPIC_AUTH_TOKEN = 'token-from-process';
    process.env.ANTHROPIC_MODEL = 'claude-compatible-mini';
    readEnvFilesMock.mockReturnValue({
      ANTHROPIC_BASE_URL: 'https://ignored.example.com/v1',
      ANTHROPIC_AUTH_TOKEN: 'token-from-file',
      ANTHROPIC_MODEL: 'ignored-model',
    });

    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        content: [
          { type: 'text', text: 'First line' },
          { type: 'tool_use', text: 'ignored' },
          { type: 'text', text: 'Second line' },
        ],
      }),
    } as unknown as Response);

    const result = await runLocalAgent('Hello fallback');

    expect(fetchMock).toHaveBeenCalledWith(
      'https://proxy.example.com/v1/messages',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'x-api-key': 'token-from-process',
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        }),
        body: JSON.stringify({
          model: 'claude-compatible-mini',
          max_tokens: 1000,
          messages: [
            {
              role: 'user',
              content: [{ type: 'text', text: 'Hello fallback' }],
            },
          ],
        }),
      }),
    );
    expect(result).toEqual({
      status: 'success',
      result: 'First line\nSecond line',
    });
  });

  it('accepts string content from compatible proxies', async () => {
    readEnvFilesMock.mockReturnValue({
      ANTHROPIC_BASE_URL: 'https://proxy.example.com/messages',
      ANTHROPIC_AUTH_TOKEN: 'token-from-file',
    });

    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        content: '  plain text response  ',
      }),
    } as unknown as Response);

    const result = await runLocalAgent('Hello fallback');

    expect(fetchMock).toHaveBeenCalledWith(
      'https://proxy.example.com/messages',
      expect.any(Object),
    );
    expect(result).toEqual({
      status: 'success',
      result: 'plain text response',
    });
  });

  it('returns an error when fallback is not configured', async () => {
    expect(shouldUseLocalAgentFallback()).toBe(false);
    await expect(runLocalAgent('Hello fallback')).resolves.toEqual({
      status: 'error',
      result: null,
      error: 'Local agent fallback is not configured.',
    });
  });

  it('surfaces HTTP failures', async () => {
    readEnvFilesMock.mockReturnValue({
      ANTHROPIC_BASE_URL: 'https://proxy.example.com/v1',
      ANTHROPIC_AUTH_TOKEN: 'token-from-file',
    });

    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValue({
      ok: false,
      status: 503,
    } as Response);

    await expect(runLocalAgent('Hello fallback')).resolves.toEqual({
      status: 'error',
      result: null,
      error: 'Local agent request failed with HTTP 503',
    });
  });
});
