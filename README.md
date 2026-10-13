# LinkedIn Job Finder: apply links, requirements & new-job alerts

Search **public LinkedIn job listings** by keyword and location and get clean, automation-ready rows: the **application link**, the **extracted requirements**, detected **skills** and the **minimum years of experience**. Run it on a schedule with **incremental mode** and get a Telegram, Slack, Discord or webhook alert only when there are *new* jobs.

No LinkedIn login, cookies or browser extension. Public job pages only.

## What you get for every job

| Field | Example |
|---|---|
| `title`, `company`, `location`, `postedAt` | Senior Data Engineer, Acme Analytics, Berlin, 2026-10-11 |
| `applyUrl` + `applyType` | `EXTERNAL` = resolved employer URL; `EXTERNAL_HIDDEN` = off-site apply but LinkedIn hid the employer URL (you get the LinkedIn job URL); `EASY_APPLY` / `UNKNOWN` = LinkedIn job URL |
| `requirements` | `["5+ years of experience in data engineering", "Strong Python and SQL skills", ...]` |
| `skills` | `["Python", "SQL", "Airflow", "Snowflake", "AWS"]` |
| `minYearsExperience` | `5` |
| `salaryText`, `seniorityLevel`, `employmentType`, `jobFunction`, `industries`, `applicantsText` | as shown by LinkedIn |
| `description` | Full plain-text description |

No recruiter or poster names. Company-level data only.

## Built for automations

- **Incremental mode.** Remembers every job already delivered and returns only new ones, so daily runs cost a fraction of a full re-scrape. The memory is keyed to your search settings, so different searches never interfere.
- **Alerts.** Telegram, Slack, Discord, or any webhook (n8n, Make, Zapier, custom). Alert failures never fail your run.
- **Compact mode** for AI agents and token-sensitive pipelines: core fields only, no description.
- **Exclude empty fields** for leaner payloads.
- **Cheap filters first.** Title and company filters run before details are fetched, so rejected jobs cost nothing.
- **Honest failures.** If LinkedIn blocks every request, the run fails with a clear message and nothing is charged. If it blocks partway, you keep what was collected.

## Input

```json
{
  "keywords": ["data engineer", "analytics engineer"],
  "locations": ["Berlin", "Remote"],
  "datePosted": "week",
  "workTypes": ["remote", "hybrid"],
  "titleExclude": ["intern", "junior"],
  "maxJobsPerSearch": 50,
  "incrementalMode": true,
  "telegramToken": "123456:ABC...",
  "telegramChatId": "-100123456789"
}
```

Every keyword is searched in every location. Set `fetchDetails` to `false` for a fast, cheaper pass without descriptions, apply links and requirements.

## Output example

```json
{
  "id": "1000000001",
  "url": "https://www.linkedin.com/jobs/view/1000000001",
  "title": "Senior Data Engineer",
  "company": "Acme Analytics",
  "location": "Berlin, Berlin, Germany",
  "postedAt": "2026-10-11",
  "applyType": "EXTERNAL",
  "applyUrl": "https://careers.example.com/jobs/42",
  "requirements": ["5+ years of experience in data engineering", "Strong Python and SQL skills"],
  "requirementsSource": "section",
  "skills": ["Python", "SQL", "Airflow", "Snowflake", "AWS"],
  "minYearsExperience": 5,
  "detailsFetched": true
}
```

## Pricing

This Actor uses pay-per-event pricing, so you pay only for results. Platform usage is included. See the **Pricing** tab for current prices per event:

| Event | Charged when |
|---|---|
| Actor start | A run begins |
| Job listed | A job is delivered to your dataset |
| Job enriched | Its details (apply link, requirements, skills) were fetched successfully |

You are never charged for jobs that were filtered out, duplicates, or jobs you already received in incremental mode. A failed detail fetch is not charged as enriched. Set a maximum cost per run in the run options and the Actor stops cleanly when it is reached.

## Limitations (please read)

- **Public data only.** Jobs that need a LinkedIn login are not visible.
- **About 1,000 results per search.** LinkedIn's public search stops there. Use more specific keywords and locations to go deeper.
- **Requirements are extracted, not guaranteed.** They come from headings like "Requirements" or "Qualifications"; when none exist, bullet points that look like requirements are used (`requirementsSource: "heuristic"`). Always check the original posting.
- **Skills** are matched against a built-in list of common technical and business tools, anywhere in the description.
- **Employer apply URLs are not available for every job.** Guest pages often hide the real employer link behind a sign-in wall. Those jobs are tagged `EXTERNAL_HIDDEN` and `applyUrl` is the LinkedIn job page — not an employer career site.
- **LinkedIn can change its pages at any time**, which can temporarily affect results. Report problems in the Issues tab, ideally with the sample HTML option enabled.
- If you see blocked requests, switch the proxy group to **RESIDENTIAL** or raise the delay between requests.

## Is it legal?

The Actor reads only information that LinkedIn shows to logged-out visitors and does not log in or use cookies. You remain responsible for how you use the data, for complying with LinkedIn's terms and with applicable law, including data-protection rules. This Actor is an independent tool and is not affiliated with, endorsed by, or sponsored by LinkedIn.

## FAQ

**Can I use it with n8n, Make or Zapier?** Yes: use the Apify integrations, call the API, or set a webhook URL so each run posts the new jobs to your workflow.

**How do I get only new jobs every day?** Turn on incremental mode and schedule the Actor. Use the same search settings (or the same state key) each time.

**Why is `applyUrl` a LinkedIn link?** Check `applyType`: `EASY_APPLY`, `EXTERNAL_HIDDEN` (off-site apply gated on the guest page), or `UNKNOWN`. Only `EXTERNAL` means a real employer URL was resolved.
