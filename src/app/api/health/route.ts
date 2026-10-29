import { connection } from 'next/server';

// Reports which integrations are configured (never their values). Safe to expose.
export async function GET() {
  await connection(); // run at request time, never prerender (env differs per deployment)
  const has = (k: string) => Boolean(process.env[k]);
  return Response.json({
    ok: true,
    configured: {
      tatum: has('TATUM_API_KEY'),
      walrusMemory: has('MEMWAL_PRIVATE_KEY') && has('MEMWAL_ACCOUNT_ID') && has('MEMWAL_OWNER_ADDRESS'),
      memwalMock: process.env.MEMWAL_MOCK === '1',
      database: has('DATABASE_URL'),
      session: has('SESSION_SECRET'),
      cron: has('CRON_SECRET'),
      payments: has('MPP_SECRET_KEY') && has('AGENT_WALLET_PRIVATE_KEY'),
    },
  });
}
