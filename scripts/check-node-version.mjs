import { readFileSync } from 'node:fs';
import process from 'node:process';

function readPinnedMajorVersion() {
  const raw = readFileSync(new URL('../.nvmrc', import.meta.url), 'utf8').trim();
  const match = raw.match(/^(\d+)/);

  if (!match) {
    throw new Error(`.nvmrc does not start with a Node major version: ${raw}`);
  }

  return Number(match[1]);
}

const expectedMajor = readPinnedMajorVersion();
const currentMajor = Number(process.versions.node.split('.')[0]);

if (currentMajor === expectedMajor) {
  process.exit(0);
}

console.error(
  [
    '',
    `NanoClaw expects Node ${expectedMajor}.x for local development (.nvmrc), but found Node ${process.versions.node}.`,
    '',
    'Why this fails:',
    '- Native modules such as better-sqlite3 are rebuilt against the active Node ABI.',
    '- Running npm scripts under a different major version can break tests and local runtime commands.',
    '',
    'Fix:',
    `- Switch to Node ${expectedMajor} (for example: \`nvm use ${expectedMajor}\`).`,
    `- If you do not use nvm, run commands via: \`npx -y -p node@${expectedMajor} -p npm@11 -c "npm test"\``,
    '- After switching majors, rebuild native modules with: `npm rebuild better-sqlite3`',
    '',
  ].join('\n'),
);

process.exit(1);
