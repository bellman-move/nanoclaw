import path from 'path';

import { readEnvFiles } from './env.js';

export interface LocalAgentOutput {
  status: 'success' | 'error';
  result: string | null;
  error?: string;
}

interface AnthropicTextBlock {
  type?: string;
  text?: string;
}

interface AnthropicMessageResponse {
  content?: AnthropicTextBlock[] | string;
}

const ANTHROPIC_ENV_KEYS = [
  'ANTHROPIC_BASE_URL',
  'ANTHROPIC_AUTH_TOKEN',
  'ANTHROPIC_MODEL',
];

function resolveProjectRoot(cwd = process.cwd()): string {
  const worktreeMarker = `${path.sep}.omx${path.sep}team${path.sep}`;
  const markerIndex = cwd.indexOf(worktreeMarker);
  return markerIndex === -1 ? cwd : cwd.slice(0, markerIndex);
}

function resolveArchiveEnvPath(): string {
  return path.resolve(
    resolveProjectRoot(),
    '..',
    'orbi-oracle-bot.archive',
    '.env',
  );
}

function resolveAnthropicConfig(): {
  baseUrl?: string;
  authToken?: string;
  model: string;
} {
  const env = readEnvFiles(ANTHROPIC_ENV_KEYS, [
    path.join(process.cwd(), '.env'),
    resolveArchiveEnvPath(),
  ]);

  return {
    baseUrl: process.env.ANTHROPIC_BASE_URL || env.ANTHROPIC_BASE_URL,
    authToken: process.env.ANTHROPIC_AUTH_TOKEN || env.ANTHROPIC_AUTH_TOKEN,
    model: process.env.ANTHROPIC_MODEL || env.ANTHROPIC_MODEL || 'MiniMax-M2.7',
  };
}

function resolveMessagesEndpoint(baseUrl: string): string {
  const trimmed = baseUrl.replace(/\/+$/, '');
  if (trimmed.endsWith('/messages')) return trimmed;
  if (trimmed.endsWith('/v1')) return `${trimmed}/messages`;
  return `${trimmed}/v1/messages`;
}

function parseResponseText(payload: AnthropicMessageResponse): string | null {
  if (typeof payload.content === 'string') {
    const text = payload.content.trim();
    return text || null;
  }

  const text = (payload.content || [])
    .filter((item) => item.type === 'text' && item.text)
    .map((item) => item.text)
    .join('\n')
    .trim();

  return text || null;
}

export function shouldUseLocalAgentFallback(): boolean {
  const { baseUrl, authToken } = resolveAnthropicConfig();
  return Boolean(baseUrl && authToken);
}

export async function runLocalAgent(prompt: string): Promise<LocalAgentOutput> {
  const { baseUrl, authToken, model } = resolveAnthropicConfig();
  if (!baseUrl || !authToken) {
    return {
      status: 'error',
      result: null,
      error: 'Local agent fallback is not configured.',
    };
  }

  const endpoint = resolveMessagesEndpoint(baseUrl);

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'x-api-key': authToken,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model,
        max_tokens: 1000,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: prompt,
              },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      return {
        status: 'error',
        result: null,
        error: `Local agent request failed with HTTP ${response.status}`,
      };
    }

    return {
      status: 'success',
      result: parseResponseText(
        (await response.json()) as AnthropicMessageResponse,
      ),
    };
    // eslint-disable-next-line no-catch-all/no-catch-all -- network/proxy failures are returned as user-facing fallback errors
  } catch (error) {
    return {
      status: 'error',
      result: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
