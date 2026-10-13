import * as cheerio from 'cheerio';
import type { RequirementsSource } from './types.js';

interface DomNode {
  type: string;
  name?: string;
  data?: string;
  children?: DomNode[];
}
export interface Line {
  text: string;
  bullet: boolean;
  heading: boolean;
}

const BLOCK = new Set(['p', 'div', 'ul', 'ol', 'li', 'section', 'article', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'table', 'tr']);
const BOLD = new Set(['strong', 'b', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6']);

/** Flatten a job description's HTML into ordered lines, flagging headings and bullets. */
export function toLines(html: string): Line[] {
  const $ = cheerio.load(`<div id="root">${html}</div>`);
  const root = $('#root').get(0) as unknown as DomNode | undefined;
  const lines: Line[] = [];
  let buf = '';
  let total = 0;
  let bold = 0;

  const flush = (bullet: boolean): void => {
    const text = buf.replace(/\s+/g, ' ').trim();
    if (text) {
      const mostlyBold = total > 0 && bold / total >= 0.9;
      const colonHead = !bullet && text.length <= 60 && /[:：]$/.test(text);
      lines.push({ text, bullet, heading: !bullet && text.length <= 90 && (mostlyBold || colonHead) });
    }
    buf = '';
    total = 0;
    bold = 0;
  };

  const walk = (node: DomNode, inBold: boolean): void => {
    if (node.type === 'text') {
      const t = node.data ?? '';
      buf += t;
      const n = t.replace(/\s/g, '').length;
      total += n;
      if (inBold) bold += n;
      return;
    }
    if (node.type !== 'tag') return;
    const name = (node.name ?? '').toLowerCase();
    if (name === 'br') {
      flush(false);
      return;
    }
    if (name === 'li') {
      flush(false);
      for (const c of node.children ?? []) walk(c, inBold);
      flush(true);
      return;
    }
    const isBlock = BLOCK.has(name);
    if (isBlock) flush(false);
    const nextBold = inBold || BOLD.has(name);
    for (const c of node.children ?? []) walk(c, nextBold);
    if (isBlock) flush(false);
  };

  if (root) for (const c of root.children ?? []) walk(c, false);
  flush(false);
  return lines;
}

const REQ_WORDS =
  /^(?:(?:key|minimum|basic|required|essential|mandatory|core|technical|job)\s+)?(?:requirements?|qualifications?|skills?|experience)(?:\s*(?:&|and|\/)\s*(?:requirements?|qualifications?|skills?|experience))*$/i;
const REQ_PHRASES =
  /^(?:what (?:you(?:'|’)ll|you will) (?:need|bring)|what we(?:'|’)re looking for|what we are looking for|who you are|you have|you will have|must[- ]haves?|about you|your profile|ideal candidate|the ideal candidate|your background|what you(?:'|’)ve got)$/i;

function normHeading(text: string): string {
  return text.replace(/[:：\s]+$/g, '').replace(/^[\s•\-–*]+/, '').trim();
}

export function isRequirementsHeading(text: string): boolean {
  const t = normHeading(text);
  return REQ_WORDS.test(t) || REQ_PHRASES.test(t);
}

const HEURISTIC =
  /\b(\d{1,2}\s*\+?\s*(?:-\s*\d{1,2}\s*)?years?|experience|degree|bachelor|master|proficien|knowledge of|familiar|ability to|certification)\b/i;

const stripBullet = (t: string): string => t.replace(/^[\s•\-–*·]+/, '').trim();

export function extractRequirements(html: string | null): { items: string[]; source: RequirementsSource } {
  if (!html) return { items: [], source: 'none' };
  const lines = toLines(html);
  const items: string[] = [];
  let mode: 'req' | 'other' | null = null;
  for (const line of lines) {
    if (line.heading) {
      mode = isRequirementsHeading(line.text) ? 'req' : 'other';
      continue;
    }
    if (mode === 'req' && line.text.length >= 3 && line.text.length <= 300 && items.length < 25) {
      items.push(stripBullet(line.text));
    }
  }
  if (items.length > 0) return { items: [...new Set(items)], source: 'section' };

  const heuristic = lines
    .filter((l) => l.bullet && HEURISTIC.test(l.text))
    .slice(0, 10)
    .map((l) => stripBullet(l.text));
  return heuristic.length > 0 ? { items: [...new Set(heuristic)], source: 'heuristic' } : { items: [], source: 'none' };
}

// ---------- skills ----------

interface SkillDef {
  name: string;
  re: RegExp;
}
const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const skill = (name: string, src?: string, caseSensitive = false): SkillDef => ({
  name,
  re: new RegExp(`(?<![A-Za-z0-9+#.])(?:${src ?? escapeRe(name)})(?![A-Za-z0-9+#])`, caseSensitive ? '' : 'i'),
});

const SKILLS: SkillDef[] = [
  skill('JavaScript'),
  skill('TypeScript'),
  skill('Python'),
  skill('Java'),
  skill('C#'),
  skill('C++'),
  skill('Golang', 'Golang|Go\\s+lang'),
  skill('Rust', undefined, true),
  skill('Ruby', undefined, true),
  skill('PHP'),
  skill('Swift', undefined, true),
  skill('Kotlin'),
  skill('Scala', undefined, true),
  skill('SQL'),
  skill('NoSQL'),
  skill('PostgreSQL', 'Postgres(?:QL)?'),
  skill('MySQL'),
  skill('MongoDB'),
  skill('Redis'),
  skill('Elasticsearch'),
  skill('GraphQL'),
  skill('REST', 'REST(?:ful)?', true),
  skill('React', 'React(?:\\.js|JS)?', true),
  skill('Angular', undefined, true),
  skill('Vue', 'Vue(?:\\.js)?', true),
  skill('Node.js', 'Node(?:\\.js|JS)', true),
  skill('Next.js', 'Next\\.js', true),
  skill('Django'),
  skill('Flask', undefined, true),
  skill('FastAPI'),
  skill('Spring', 'Spring(?: Boot)?', true),
  skill('.NET', '\\.NET'),
  skill('Laravel'),
  skill('Ruby on Rails', 'Ruby on Rails|Rails', true),
  skill('AWS'),
  skill('Azure'),
  skill('GCP', 'GCP|Google Cloud'),
  skill('Docker'),
  skill('Kubernetes', 'Kubernetes|K8s'),
  skill('Terraform'),
  skill('Ansible'),
  skill('Jenkins'),
  skill('CI/CD', 'CI\\s*/\\s*CD'),
  skill('Git', 'Git(?:Hub|Lab)?'),
  skill('Linux'),
  skill('Kafka'),
  skill('Spark', undefined, true),
  skill('Hadoop'),
  skill('Airflow'),
  skill('dbt', undefined, true),
  skill('Snowflake'),
  skill('BigQuery'),
  skill('Databricks'),
  skill('Redshift'),
  skill('Tableau'),
  skill('Power BI'),
  skill('Looker'),
  skill('Excel', undefined, true),
  skill('Pandas', undefined, true),
  skill('NumPy'),
  skill('TensorFlow'),
  skill('PyTorch'),
  skill('scikit-learn'),
  skill('Machine Learning'),
  skill('Deep Learning'),
  skill('NLP'),
  skill('LLM', 'LLMs?'),
  skill('Data Analysis'),
  skill('ETL'),
  skill('Agile'),
  skill('Scrum'),
  skill('Jira'),
  skill('Figma'),
  skill('SEO'),
  skill('Google Analytics'),
  skill('Salesforce'),
  skill('HubSpot'),
  skill('SAP', undefined, true),
  skill('Oracle', undefined, true),
  skill('Shopify'),
  skill('WordPress'),
  skill('Photoshop'),
  skill('Selenium'),
  skill('Playwright'),
  skill('Cypress'),
  skill('Android', undefined, true),
  skill('iOS', undefined, true),
  skill('Flutter'),
  skill('n8n', undefined, true),
  skill('Zapier'),
];

export function extractSkills(text: string | null): string[] {
  if (!text) return [];
  const found: string[] = [];
  for (const s of SKILLS) {
    if (s.re.test(text)) found.push(s.name);
    if (found.length >= 25) break;
  }
  return found;
}

/** Lowest "N years of experience" figure mentioned (ignores company-age phrases). */
export function extractMinYears(text: string | null): number | null {
  if (!text) return null;
  const re = /(\d{1,2})\s*(?:\+|\s*(?:-|–|to)\s*\d{1,2})?\s*\+?\s*years?/gi;
  let min: number | null = null;
  for (const m of text.matchAll(re)) {
    const n = Number(m[1]);
    if (!Number.isFinite(n) || n > 30) continue;
    const idx = m.index ?? 0;
    const after = text.slice(idx, idx + 90);
    const before = text.slice(Math.max(0, idx - 50), idx);
    if (/experience|exp\./i.test(after) || /experience/i.test(before)) {
      if (min === null || n < min) min = n;
    }
  }
  return min;
}
