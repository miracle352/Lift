import { PlayError } from './humans';
import { liveArenaDeps } from './runtime';
import type { ArenaDeps } from './deps';

/** Arena deps for API routes (no migrations, no payments client: the worker owns those). */
let cached: Promise<ArenaDeps> | null = null;
export function webDeps(): Promise<ArenaDeps> {
  return (cached ??= liveArenaDeps().then((d) => ({ ...d, pay: undefined })));
}

/** Maps PlayError → HTTP status; anything else → 500 without internals. */
export async function handle(fn: () => Promise<unknown>): Promise<Response> {
  try {
    return Response.json(await fn());
  } catch (err) {
    if (err instanceof PlayError) return Response.json({ error: err.message }, { status: err.status });
    console.error('arena api error', err);
    return Response.json({ error: 'internal error' }, { status: 500 });
  }
}

export async function jsonBody(req: Request): Promise<Record<string, unknown>> {
  try {
    const b = await req.json();
    if (b && typeof b === 'object') return b as Record<string, unknown>;
  } catch {}
  throw new PlayError('JSON body required');
}
