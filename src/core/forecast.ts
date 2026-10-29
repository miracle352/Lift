import { z } from 'zod';
import { RECEIPTS } from './constants';
import { hashJson, randomSaltHex, sha256Hex } from './hash';

/**
 * A sealed forecast (docs/PROOF.md). Every field is covered by the hash, so the
 * JSON that gets revealed must be byte-for-byte what was sealed (after JCS).
 *
 * kind:
 *  - "blind":    the user's probability BEFORE seeing any advice
 *  - "informed": the user's probability AFTER seeing exactly one piece of advice (links to the blind seal via `prev`)
 *  - "take":     a tipster's published forecast (the advice other people can read or buy)
 */
export const ForecastKind = z.enum(['blind', 'informed', 'take']);
export type ForecastKind = z.infer<typeof ForecastKind>;

const hex64 = z.string().regex(/^[0-9a-f]{64}$/, 'expected 64 lowercase hex chars');
const isoInstant = z.string().datetime({ offset: true });

export const MarketRef = z.object({
  platform: z.enum(['polymarket', 'kalshi']),
  /** Platform-native market id (Polymarket condition id, Kalshi ticker), exactly as Tatum returns it. */
  id: z.string().min(1).max(128),
  question: z.string().min(1).max(500),
  /** sha256 of the market's resolution text (Tatum `description`), so the rules you forecast against are pinned. */
  rulesHash: hex64,
  /** Market close time as reported by Tatum at seal time. */
  closeTime: isoInstant,
});
export type MarketRef = z.infer<typeof MarketRef>;

export const AdviceRef = z.object({
  advisorId: z.string().min(1).max(128),
  advisorKind: z.enum(['market', 'whale', 'tipster', 'pundit', 'crew']),
  /** sha256 of the canonical JSON of exactly what was shown to the user (see adviceContentHash). */
  contentHash: hex64,
  /** true when the app chose the advisor at random ("fair test"), false when the user picked it. */
  fairTest: z.boolean(),
});
export type AdviceRef = z.infer<typeof AdviceRef>;

export const ForecastV1 = z
  .object({
    schema: z.literal(RECEIPTS.forecastSchema),
    kind: ForecastKind,
    /** Stable app user id (opaque string, e.g. a UUID). */
    user: z.string().min(1).max(128),
    market: MarketRef,
    /** The outcome this probability is about, matching a Tatum `outcomes[].name` (usually "Yes"). */
    outcome: z.string().min(1).max(64),
    /** Probability in basis points (integer, 1..9999). Integers keep the canonical JSON unambiguous. */
    probabilityBps: z.number().int().min(1).max(9999),
    /** Hash of the blind seal this informed seal follows; null for blind seals and takes. */
    prev: hex64.nullable(),
    /** The single piece of advice seen between blind and informed; null for blind seals and takes. */
    advice: AdviceRef.nullable(),
    /** Client-side creation time (informational; the Sui checkpoint time is what counts). */
    createdAt: isoInstant,
    salt: hex64,
  })
  .strict()
  .superRefine((f, ctx) => {
    if (f.kind === 'informed') {
      if (!f.prev) ctx.addIssue({ code: 'custom', path: ['prev'], message: 'informed seals must reference the blind seal' });
      if (!f.advice) ctx.addIssue({ code: 'custom', path: ['advice'], message: 'informed seals must record the advice seen' });
    } else {
      if (f.prev !== null) ctx.addIssue({ code: 'custom', path: ['prev'], message: `${f.kind} seals must have prev = null` });
      if (f.advice !== null) ctx.addIssue({ code: 'custom', path: ['advice'], message: `${f.kind} seals must have advice = null` });
    }
  });
export type ForecastV1 = z.infer<typeof ForecastV1>;

export interface BuildForecastInput {
  kind: ForecastKind;
  user: string;
  market: MarketRef;
  outcome: string;
  probabilityBps: number;
  prev?: string | null;
  advice?: AdviceRef | null;
  /** Injected for tests; defaults to now. */
  createdAt?: string;
  /** Injected for tests; defaults to 32 random bytes. */
  salt?: string;
}

/** Validates and returns a forecast ready to seal. Throws a ZodError on bad input. */
export function buildForecast(input: BuildForecastInput): ForecastV1 {
  return ForecastV1.parse({
    schema: RECEIPTS.forecastSchema,
    kind: input.kind,
    user: input.user,
    market: input.market,
    outcome: input.outcome,
    probabilityBps: input.probabilityBps,
    prev: input.prev ?? null,
    advice: input.advice ?? null,
    createdAt: input.createdAt ?? new Date().toISOString(),
    salt: input.salt ?? randomSaltHex(),
  });
}

/** The seal hash: sha256 over the JCS canonical JSON of the full forecast (salt included). */
export function forecastHash(forecast: ForecastV1): string {
  return hashJson(ForecastV1.parse(forecast));
}

/** Hash of the market's resolution text, for MarketRef.rulesHash. */
export function rulesHash(description: string | null | undefined): string {
  return sha256Hex((description ?? '').trim());
}

/** Hash of exactly what the user was shown as advice (any JSON payload: tweet text, whale position, take...). */
export function adviceContentHash(shown: unknown): string {
  return hashJson(shown);
}
