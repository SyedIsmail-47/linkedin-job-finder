import { Actor } from 'apify';
import type { Logger } from './types.js';

export type ChargeEvent = 'job-listed' | 'job-enriched';

/**
 * Pay-per-event charging. Charge only AFTER the item was pushed successfully.
 * limitReached becomes true when the user's max charge (or event limit) is hit, so the pipeline can stop cleanly.
 */
export class Billing {
  limitReached = false;
  readonly charged: Record<string, number> = {};
  private warned = false;

  constructor(private readonly log: Logger) {}

  async charge(eventName: ChargeEvent): Promise<void> {
    try {
      const res = await Actor.charge({ eventName });
      this.charged[eventName] = (this.charged[eventName] ?? 0) + (res.chargedCount ?? 0);
      if (res.eventChargeLimitReached) this.limitReached = true;
    } catch (err) {
      if (!this.warned) {
        this.warned = true;
        this.log.warning(`Charging "${eventName}" failed (${err instanceof Error ? err.message : 'unknown error'}); continuing without charge.`);
      }
    }
  }
}
