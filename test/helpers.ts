import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

export const fixtureDir = join(here, 'fixtures');
export const fixture = (name: string): string => readFileSync(join(fixtureDir, name), 'utf8');

export const silentLog = { info() {}, warning() {}, debug() {} };
