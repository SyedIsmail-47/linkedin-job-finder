import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { normalizeInput } from '../src/input.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function extractJsonBlocks(md: string): unknown[] {
  const blocks: unknown[] = [];
  const re = /```json\s*([\s\S]*?)```/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(md))) {
    blocks.push(JSON.parse(m[1]));
  }
  return blocks;
}

describe('input_schema quality guards', () => {
  const schema = JSON.parse(readFileSync(join(root, '.actor/input_schema.json'), 'utf8'));

  it('every property has a non-empty title and description', () => {
    for (const [name, def] of Object.entries<Record<string, unknown>>(schema.properties)) {
      expect(typeof def.title === 'string' && (def.title as string).trim().length > 0, `${name}.title`).toBe(true);
      expect(typeof def.description === 'string' && (def.description as string).trim().length > 0, `${name}.description`).toBe(
        true,
      );
    }
  });

  it('section captions are unique', () => {
    const captions: string[] = [];
    for (const def of Object.values<Record<string, unknown>>(schema.properties)) {
      if (typeof def.sectionCaption === 'string') captions.push(def.sectionCaption);
    }
    expect(new Set(captions).size).toBe(captions.length);
  });
});

describe('README examples', () => {
  const readme = readFileSync(join(root, 'README.md'), 'utf8');
  const datasetFields = new Set(
    Object.keys(JSON.parse(readFileSync(join(root, '.actor/dataset_schema.json'), 'utf8')).fields.properties),
  );
  const blocks = extractJsonBlocks(readme);

  it('finds at least one input and one output JSON example', () => {
    expect(blocks.length).toBeGreaterThanOrEqual(2);
  });

  it('every JSON example with keywords validates as Actor input', () => {
    const inputs = blocks.filter((b) => b && typeof b === 'object' && 'keywords' in (b as object));
    expect(inputs.length).toBeGreaterThanOrEqual(1);
    for (const input of inputs) {
      expect(() => normalizeInput(input)).not.toThrow();
    }
  });

  it('output example field names are a subset of the dataset schema', () => {
    const outputs = blocks.filter((b) => b && typeof b === 'object' && 'id' in (b as object) && 'applyType' in (b as object));
    expect(outputs.length).toBeGreaterThanOrEqual(1);
    for (const out of outputs) {
      for (const key of Object.keys(out as object)) {
        expect(datasetFields.has(key), `unknown output field ${key}`).toBe(true);
      }
    }
  });
});
