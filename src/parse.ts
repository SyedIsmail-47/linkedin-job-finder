import * as cheerio from 'cheerio';
import type { ApplyType, JobCard, JobDetail } from './types.js';
import { canonicalJobUrl } from './urls.js';

// NOTE: every selector below follows the public guest-page markup as documented by other open-source
// scrapers. They are UNVERIFIED against live responses from this project. The first platform run must
// confirm them (see HANDOFF.md). All parsers are tolerant: missing parts become null, nothing throws.

const clean = (s: string | undefined | null): string | null => {
  if (s == null) return null;
  const t = s.replace(/\s+/g, ' ').trim();
  return t.length > 0 ? t : null;
};

export function stripQuery(url: string | undefined | null): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    return `${u.origin}${u.pathname}`;
  } catch {
    return url.split('?')[0] ?? null;
  }
}

export function idFromUrn(urn: string | undefined | null): string | null {
  return /urn:li:jobPosting:(\d+)/.exec(urn ?? '')?.[1] ?? null;
}

export function idFromUrl(url: string | undefined | null): string | null {
  return /\/jobs\/view\/(?:[^/?#]*?-)?(\d{6,})/.exec(url ?? '')?.[1] ?? null;
}

function isoDate(value: string | undefined): string | null {
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(value ?? '');
  return m?.[1] ?? null;
}

/** True when a response looks like an auth wall / captcha rather than job content. */
export function looksBlocked(body: string): boolean {
  if (!body.trim()) return false; // empty page = legitimate end of results
  if (/base-search-card|base-card|show-more-less-html|top-card-layout/.test(body)) return false;
  return /authwall|checkpoint\/challenge|captcha|unusual traffic|request denied|join linkedin|sign in to linkedin/i.test(
    body.slice(0, 8000),
  );
}

export function parseSearchCards(html: string): JobCard[] {
  const $ = cheerio.load(html);
  const out: JobCard[] = [];
  const seen = new Set<string>();
  $('li').each((_, li) => {
    const $li = $(li);
    const card = $li.find('div.base-card, div.job-search-card, div.base-search-card').first();
    const urn = card.attr('data-entity-urn') ?? $li.find('[data-entity-urn]').first().attr('data-entity-urn');
    const href =
      $li.find('a.base-card__full-link').first().attr('href') ?? $li.find('a[href*="/jobs/view/"]').first().attr('href');
    const id = idFromUrn(urn) ?? idFromUrl(href);
    if (!id || seen.has(id)) return;
    seen.add(id);
    const time = $li.find('time').first();
    out.push({
      id,
      url: canonicalJobUrl(id),
      title:
        clean($li.find('.base-search-card__title').first().text()) ??
        clean($li.find('a.base-card__full-link .sr-only').first().text()),
      company: clean($li.find('.base-search-card__subtitle').first().text()),
      companyUrl: stripQuery($li.find('.base-search-card__subtitle a').first().attr('href')),
      location: clean($li.find('.job-search-card__location').first().text()),
      postedAt: isoDate(time.attr('datetime')),
      postedAtText: clean(time.text()),
      salaryText: clean($li.find('.job-search-card__salary-info').first().text()),
    });
  });
  return out;
}

export function htmlToText(html: string): string {
  const $ = cheerio.load(`<div id="root">${html}</div>`);
  const root = $('#root');
  root.find('br').replaceWith('\n');
  root.find('li').each((_, el) => {
    $(el).prepend('• ').append('\n');
  });
  root.find('p, div, h1, h2, h3, h4, h5, h6, ul, ol').each((_, el) => {
    $(el).append('\n');
  });
  return root
    .text()
    .replace(/[ \t\u00a0]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Turn a LinkedIn redirect link into the real employer URL. Returns null for LinkedIn-internal links. */
export function resolveExternalApply(raw: string): string | null {
  const decoded = raw.replace(/&amp;/g, '&').trim().replace(/^"+|"+$/g, '');
  let u: URL;
  try {
    u = new URL(decoded);
  } catch {
    return null;
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
  if (/(^|\.)linkedin\.com$/i.test(u.hostname)) {
    const inner = u.searchParams.get('url');
    return inner && /^https?:\/\//i.test(inner) ? inner : null;
  }
  return u.toString();
}

export function parseApply(html: string, $: cheerio.CheerioAPI, jobUrl: string): { applyType: ApplyType; applyUrl: string } {
  const m = /<code[^>]*id=["']applyUrl["'][^>]*>\s*<!--\s*"?([^"]*?)"?\s*-->/i.exec(html);
  let external = m?.[1] ? resolveExternalApply(m[1]) : null;
  if (!external) {
    const hrefs = $('a.apply-button--link, a[data-tracking-control-name*="apply-link-offsite"], a[href*="externalApply"]')
      .map((_, a) => $(a).attr('href') ?? '')
      .get();
    for (const h of hrefs) {
      external = resolveExternalApply(h);
      if (external) break;
    }
  }
  if (external) return { applyType: 'EXTERNAL', applyUrl: external };

  // Guest pages often gate the real employer URL behind a sign-in modal. Offsite vs Easy Apply
  // still leave detectable markup (icon class / tracking / impression id).
  const offsiteGated =
    /apply-link-offsite|offsite-apply-icon|apply-button__offsite/i.test(html) ||
    $('[data-impression-id*="apply-link-offsite"], [data-tracking-control-name*="apply-link-offsite"]').length > 0;
  if (offsiteGated) return { applyType: 'EXTERNAL', applyUrl: jobUrl };

  const easy =
    $('[data-tracking-control-name*="easy-apply"]').length > 0 ||
    $('[data-impression-id*="easy-apply"]').length > 0 ||
    $('.apply-button__text').filter((_, el) => /easy apply/i.test($(el).text())).length > 0 ||
    /easy apply/i.test($('button.top-card-layout__cta, button[data-modal*="apply"]').first().text());
  return { applyType: easy ? 'EASY_APPLY' : 'UNKNOWN', applyUrl: jobUrl };
}

export function parseJobDetail(html: string, jobUrl: string): JobDetail {
  const $ = cheerio.load(html);
  const orgLink = $('a.topcard__org-name-link').first();
  const descEl = $('.show-more-less-html__markup').first();
  const descriptionHtml = descEl.length > 0 ? (descEl.html() ?? null) : null;

  const criteria: Record<string, string> = {};
  $('li.description__job-criteria-item').each((_, li) => {
    const key = clean($(li).find('.description__job-criteria-subheader').text())?.toLowerCase();
    const val = clean($(li).find('.description__job-criteria-text').text());
    if (key && val) criteria[key] = val;
  });

  const apply = parseApply(html, $, jobUrl);
  return {
    title: clean($('h2.top-card-layout__title').first().text()) ?? clean($('h1').first().text()),
    company: clean(orgLink.text()) ?? clean($('.topcard__flavor').first().text()),
    companyUrl: stripQuery(orgLink.attr('href')),
    location: clean($('.topcard__flavor--bullet').first().text()),
    postedAtText: clean($('.posted-time-ago__text').first().text()),
    applicantsText: clean($('.num-applicants__caption').first().text()),
    salaryText: clean($('.compensation__salary, .salary').first().text()),
    seniorityLevel: criteria['seniority level'] ?? null,
    employmentType: criteria['employment type'] ?? null,
    jobFunction: criteria['job function'] ?? null,
    industries: criteria['industries'] ?? null,
    description: descriptionHtml ? htmlToText(descriptionHtml) : null,
    descriptionHtml,
    applyType: apply.applyType,
    applyUrl: apply.applyUrl,
  };
}
