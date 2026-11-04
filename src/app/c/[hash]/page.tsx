import type { Metadata } from 'next';
import { Suspense } from 'react';
import { Foot, Nav } from '@/components/arena/chrome';
import { SharedCall } from '@/components/arena/shared-call';

export const metadata: Metadata = { title: 'A sealed call', description: 'A call sealed on Walrus Memory before its market closed. Check it yourself.' };

export default function CallPage() {
  return (
    <>
      <Nav light />
      <main className="a-page">
        <div className="a-wrap">
          <Suspense fallback={<p className="a-p">Loading the call…</p>}>
            <SharedCall />
          </Suspense>
        </div>
      </main>
      <Foot />
    </>
  );
}
