import fs from 'fs';
import path from 'path';
import { logger } from './logger.js';

/**
 * Parse the .env file and return values for the requested keys.
 * Does NOT load anything into process.env — callers decide what to
 * do with the values. This keeps secrets out of the process environment
 * so they don't leak to child processes.
 */
export function readEnvFile(
  keys: string[],
  envFile = path.join(process.cwd(), '.env'),
): Record<string, string> {
  let content: string;
  try {
    content = fs.readFileSync(envFile, 'utf-8');
  } catch (err) {
    logger.debug({ err }, '.env file not found, using defaults');
    return {};
  }

  const result: Record<string, string> = {};
  const wanted = new Set(keys);

  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    if (!wanted.has(key)) continue;
    let value = trimmed.slice(eqIdx + 1).trim();
    if (
      value.length >= 2 &&
      ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'")))
    ) {
      value = value.slice(1, -1);
    }
    if (value) result[key] = value;
  }

  return result;
}

/**
 * Resolve env values across multiple candidate files in priority order.
 * Earlier files win for overlapping keys; later files only fill gaps.
 */
export function readEnvFiles(
  keys: string[],
  envFiles: string[],
): Record<string, string> {
  const result: Record<string, string> = {};
  const remaining = new Set(keys);

  for (const envFile of envFiles) {
    if (remaining.size === 0) break;
    if (!fs.existsSync(envFile)) continue;

    const values = readEnvFile([...remaining], envFile);
    for (const [key, value] of Object.entries(values)) {
      result[key] = value;
      remaining.delete(key);
    }
  }

  return result;
}
