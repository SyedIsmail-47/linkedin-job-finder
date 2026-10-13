/**
 * Sanitize LinkedIn HTML for fixtures: strip tracking/session codes, keep job markup.
 * Does not invent content. Usage: npx tsx scripts/sanitize-fixture.ts <in> <out>
 */
import { readFileSync, writeFileSync } from 'node:fs';

const inPath = process.argv[2];
const outPath = process.argv[3];
if (!inPath || !outPath) {
  console.error('Usage: tsx scripts/sanitize-fixture.ts <in.html> <out.html>');
  process.exit(1);
}

let html = readFileSync(inPath, 'utf8');
// Opaque session / tracking blobs in <code> tags
html = html.replace(
  /(<code[^>]*id=["'](?:referenceId|csrfToken|pageInstance|clientInfo)["'][^>]*>\s*<!--\s*")([\s\S]*?)("\s*-->\s*<\/code>)/gi,
  '$1REDACTED$3',
);
// Long tokens only on data-* attributes that actually have a quoted value (skip boolean attrs).
html = html.replace(
  /\b(data-(?:tracking|impression)-[a-z0-9_-]+=["'])[^"']{40,}(["'])/gi,
  '$1REDACTED$2',
);
writeFileSync(outPath, html, 'utf8');
console.log(`Wrote ${outPath} (${html.length} chars)`);
