export interface SearchQuery {
  keywords: string;
  location: string;
}

/** One result card from the guest search endpoint. */
export interface JobCard {
  id: string;
  url: string;
  title: string | null;
  company: string | null;
  companyUrl: string | null;
  location: string | null;
  /** ISO date (YYYY-MM-DD) taken from the <time datetime> attribute, if present. */
  postedAt: string | null;
  postedAtText: string | null;
  salaryText: string | null;
}

/** EXTERNAL = resolved employer URL; EXTERNAL_HIDDEN = off-site apply gated (LinkedIn job URL only). */
export type ApplyType = 'EXTERNAL' | 'EXTERNAL_HIDDEN' | 'EASY_APPLY' | 'UNKNOWN';
export type RequirementsSource = 'section' | 'heuristic' | 'none';

/** Parsed from the guest job detail endpoint. */
export interface JobDetail {
  title: string | null;
  company: string | null;
  companyUrl: string | null;
  location: string | null;
  postedAtText: string | null;
  applicantsText: string | null;
  salaryText: string | null;
  seniorityLevel: string | null;
  employmentType: string | null;
  jobFunction: string | null;
  industries: string | null;
  description: string | null;
  descriptionHtml: string | null;
  applyType: ApplyType;
  applyUrl: string | null;
}

export interface JobItem {
  id: string;
  url: string;
  title: string | null;
  company: string | null;
  companyUrl: string | null;
  location: string | null;
  workplaceType: 'remote' | 'hybrid' | null;
  postedAt: string | null;
  postedAtText: string | null;
  salaryText: string | null;
  seniorityLevel: string | null;
  employmentType: string | null;
  jobFunction: string | null;
  industries: string | null;
  applicantsText: string | null;
  applyType: ApplyType;
  applyUrl: string | null;
  description: string | null;
  requirements: string[];
  requirementsSource: RequirementsSource;
  skills: string[];
  minYearsExperience: number | null;
  detailsFetched: boolean;
  searchKeyword: string;
  searchLocation: string;
  scrapedAt: string;
}

export interface HttpStats {
  requests: number;
  retries: number;
  blocked: number;
  networkErrors: number;
  sessionsRetired: number;
  statusHistogram: Record<string, number>;
  bytesReceived: number;
  requestsByKind: { search: number; detail: number };
  totalBackoffMs: number;
}

export interface RunStats {
  searchPages: number;
  cardsSeen: number;
  duplicatesInRun: number;
  skippedSeen: number;
  filteredOut: number;
  jobsPushed: number;
  detailsOk: number;
  detailFailures: number;
  stoppedByChargeLimit: boolean;
  abortedReason: string | null;
  durationMs: number;
  http: HttpStats;
}

export function newHttpStats(): HttpStats {
  return {
    requests: 0,
    retries: 0,
    blocked: 0,
    networkErrors: 0,
    sessionsRetired: 0,
    statusHistogram: {},
    bytesReceived: 0,
    requestsByKind: { search: 0, detail: 0 },
    totalBackoffMs: 0,
  };
}

export function newRunStats(http: HttpStats = newHttpStats()): RunStats {
  return {
    searchPages: 0,
    cardsSeen: 0,
    duplicatesInRun: 0,
    skippedSeen: 0,
    filteredOut: 0,
    jobsPushed: 0,
    detailsOk: 0,
    detailFailures: 0,
    stoppedByChargeLimit: false,
    abortedReason: null,
    durationMs: 0,
    http,
  };
}

export interface Logger {
  info(msg: string): void;
  warning(msg: string): void;
  debug(msg: string): void;
}
