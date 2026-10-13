import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { INPUT_KEYS, normalizeInput } from '../src/input.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p: string) => JSON.parse(readFileSync(join(root, p), 'utf8'));

describe('.actor files stay in sync with the code', () => {
  const schema = read('.actor/input_schema.json');
  const props = Object.keys(schema.properties);

  it('every Console input exists in the code validation, and vice versa', () => {
    expect([...props].sort()).toEqual([...INPUT_KEYS].sort());
  });

  it('every select default/enum value is accepted by the code', () => {
    for (const [name, def] of Object.entries<any>(schema.properties)) {
      const values: string[] = def.enum ?? def.items?.enum ?? [];
      for (const v of values) {
        const payload = def.type === 'array' ? { [name]: [v] } : { [name]: v };
        expect(() => normalizeInput({ keywords: ['x'], ...payload }), `${name}=${v}`).not.toThrow();
      }
    }
  });

  it('prefill and defaults produce a valid run', () => {
    const input: Record<string, unknown> = {};
    for (const [name, def] of Object.entries<any>(schema.properties)) {
      if (def.prefill !== undefined) input[name] = def.prefill;
      else if (def.default !== undefined) input[name] = def.default;
    }
    expect(() => normalizeInput(input)).not.toThrow();
  });

  it('marks every secret as a secret', () => {
    for (const k of ['telegramToken', 'discordWebhookUrl', 'slackWebhookUrl', 'webhookUrl']) {
      expect(schema.properties[k].isSecret, k).toBe(true);
    }
  });

  it('dataset schema lists every field the code can output', () => {
    const fields = Object.keys(read('.actor/dataset_schema.json').fields.properties);
    for (const k of [
      'id', 'url', 'title', 'company', 'companyUrl', 'location', 'workplaceType', 'postedAt', 'postedAtText', 'salaryText',
      'seniorityLevel', 'employmentType', 'jobFunction', 'industries', 'applicantsText', 'applyType', 'applyUrl', 'description',
      'requirements', 'requirementsSource', 'skills', 'minYearsExperience', 'detailsFetched', 'searchKeyword', 'searchLocation', 'scrapedAt',
    ]) expect(fields, k).toContain(k);
  });
});
