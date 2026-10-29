import { connection } from 'next/server';
import { eventsSince } from '@/arena/queries';
import { getDb } from '@/db/client';

export const runtime = 'nodejs';
export const maxDuration = 300;

/**
 * Live arena feed as Server-Sent Events: seals, purchases, payments, resolutions, lessons.
 * `?after=<id>` resumes; the stream polls the DB every 2 s and closes after ~4.5 min (EventSource reconnects).
 */
export async function GET(req: Request) {
  await connection();
  let after = Number(new URL(req.url).searchParams.get('after') ?? req.headers.get('last-event-id') ?? 0) || 0;
  const db = getDb();
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
  return new Response(stream, { headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-cache, no-transform', connection: 'keep-alive' } });
}
