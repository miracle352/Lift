import { connection } from 'next/server';
import { eventsSince, tailStart } from '@/arena/queries';
import { getDb } from '@/db/client';

export const maxDuration = 300;

/**
 * Live arena feed as Server-Sent Events: seals, purchases, payments, resolutions, lessons.
 * `?after=<id>` resumes; the stream polls the DB every 2 s and closes after ~4.5 min (EventSource reconnects).
 */
export async function GET(req: Request) {
  await connection();
  const url = new URL(req.url);
  const db = getDb();
  let after = Number(url.searchParams.get('after') ?? req.headers.get('last-event-id') ?? 0) || 0;
  // ?tail=N starts N events before the newest one (skipping the noisy per-purchase events)
  const tail = Math.min(200, Number(url.searchParams.get('tail') ?? 0) || 0);
  if (!after && tail) after = await tailStart(db, tail);
  const enc = new TextEncoder();
  const started = Date.now();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (s: string) => controller.enqueue(enc.encode(s));
      send('retry: 3000\n\n');
      while (!req.signal.aborted && Date.now() - started < 270_000) {
        const events = await eventsSince(db, after, 100);
        for (const e of events) {
          send(`id: ${e.id}\nevent: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`);
          after = e.id;
        }
        if (!events.length) send(': ping\n\n');
        await new Promise((r) => setTimeout(r, 2000));
      }
      controller.close();
    },
  });
  return new Response(stream, { headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-cache, no-transform', connection: 'keep-alive', 'access-control-allow-origin': '*' } });
}
