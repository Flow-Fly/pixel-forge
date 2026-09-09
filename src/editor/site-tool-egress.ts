import { INSPECT_OBSERVATION_CLASSES, type InspectObservationClass } from './automation-session';

export interface SiteContentGrant {
  readonly runId: string;
  readonly sessionId: string;
  readonly targetId: string;
  readonly categories: readonly InspectObservationClass[];
  readonly expiresAt: number;
}
export interface SiteContentRecord {
  readonly version: 1;
  readonly runId: string;
  readonly targetId: string;
  readonly categories: readonly InspectObservationClass[];
  readonly revision: number;
  readonly timestamp: number;
  readonly byteLength: number;
  readonly digest: string;
}
import {
  matchesSiteSchema,
  siteArray,
  siteEnum,
  siteInteger,
  siteObject,
  siteString,
} from './site-tool-schema';
import { siteDigestSchema } from './site-tool-command-schemas';

const recordSchema = siteObject({
  version: { const: 1 },
  runId: siteString(),
  targetId: siteString(),
  categories: siteArray(siteEnum(INSPECT_OBSERVATION_CLASSES), 6, 1),
  revision: siteInteger(),
  timestamp: siteInteger(),
  byteLength: siteInteger(0, 49152),
  digest: siteDigestSchema,
});
const RECORD_KEY = 'pixel-forge.site-content-egress.v1';
const MAX_RECORDS = 200;

/** Separate additive audit key; existing project and recovery records are untouched. */
export function recordSiteContent(record: SiteContentRecord): void {
  const raw = localStorage.getItem(RECORD_KEY);
  if (raw && raw.length > 256 * 1024) throw new Error('egress_record_unavailable');
  const existing: unknown = raw ? JSON.parse(raw) : [];
  if (
    !Array.isArray(existing) ||
    !matchesSiteSchema(existing, siteArray(recordSchema, MAX_RECORDS)) ||
    !matchesSiteSchema(record, recordSchema)
  )
    throw new Error('egress_record_unavailable');
  localStorage.setItem(RECORD_KEY, JSON.stringify([...existing.slice(-(MAX_RECORDS - 1)), record]));
}
