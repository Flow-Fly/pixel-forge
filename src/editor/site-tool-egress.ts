import type { InspectObservationClass } from './automation-session';

export interface SiteContentGrant {
  readonly runId: string;
  readonly sessionId: string;
  readonly targetId: string;
  readonly categories: readonly InspectObservationClass[];
  readonly expiresAt: number;
}
export interface SiteContentRecord {
  readonly version: 1;
  readonly categories: readonly InspectObservationClass[];
  readonly revision: number;
  readonly timestamp: number;
  readonly byteLength: number;
  readonly digest: string;
}
const RECORD_KEY = 'pixel-forge.site-content-egress.v1';
const MAX_RECORDS = 200;

/** Separate additive audit key; existing project and recovery records are untouched. */
export function recordSiteContent(record: SiteContentRecord): void {
  const raw = localStorage.getItem(RECORD_KEY);
  const existing: unknown = raw ? JSON.parse(raw) : [];
  if (!Array.isArray(existing)) throw new Error('egress_record_unavailable');
  localStorage.setItem(RECORD_KEY, JSON.stringify([...existing.slice(-(MAX_RECORDS - 1)), record]));
}
