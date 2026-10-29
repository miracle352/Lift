import { RECEIPTS } from './constants';
import type { ForecastKind, ForecastV1 } from './forecast';
import { forecastHash } from './forecast';
import { sha256Hex } from './hash';

/**
 * Seal namespaces are public on Sui (they are stored as a Blob attribute), so they carry only
 * short one-way tags plus the seal hash. Format (docs/PROOF.md):
 *
 *   rcpt1:<userTag>:<marketTag>:<kindChar>:<sha256hex>
 *
 * kindChar: b = blind, i = informed, t = take
 */
const KIND_CHAR: Record<ForecastKind, string> = { blind: 'b', informed: 'i', take: 't' };
const CHAR_KIND: Record<string, ForecastKind> = { b: 'blind', i: 'informed', t: 'take' };

export function userTag(userId: string): string {
  return sha256Hex(`receipts:user:${userId}`).slice(0, RECEIPTS.tagHexLength);
}

export function marketTag(platform: string, marketId: string): string {
  return sha256Hex(`receipts:market:${platform}:${marketId}`).slice(0, RECEIPTS.tagHexLength);
}

export interface SealNamespace {
  userTag: string;
  marketTag: string;
  kind: ForecastKind;
  hash: string;
}

export function formatSealNamespace(parts: SealNamespace): string {
  const ns = [RECEIPTS.sealNamespacePrefix, parts.userTag, parts.marketTag, KIND_CHAR[parts.kind], parts.hash].join(':');
  if (new TextEncoder().encode(ns).length > RECEIPTS.maxNamespaceBytes) throw new Error('namespace exceeds 255 bytes');
  return ns;
}

/** Returns null for anything that is not a well-formed v1 seal namespace. */
export function parseSealNamespace(ns: string): SealNamespace | null {
  const tag = `[0-9a-f]{${RECEIPTS.tagHexLength}}`;
  const m = new RegExp(`^${RECEIPTS.sealNamespacePrefix}:(${tag}):(${tag}):([bit]):([0-9a-f]{64})$`).exec(ns);
  if (!m) return null;
  return { userTag: m[1], marketTag: m[2], kind: CHAR_KIND[m[3]], hash: m[4] };
}

/** The namespace a forecast must be sealed under. */
export function sealNamespaceFor(forecast: ForecastV1): string {
  return formatSealNamespace({
    userTag: userTag(forecast.user),
    marketTag: marketTag(forecast.market.platform, forecast.market.id),
    kind: forecast.kind,
    hash: forecastHash(forecast),
  });
}

/** Private, per-user namespaces for learning memories (not seals). Exact-match strings; never parse them. */
export const memoryNamespace = {
  episodes: (userId: string) => `ep1:${userTag(userId)}`,
  lessons: (userId: string) => `lesson1:${userTag(userId)}`,
};
