import type { Metadata } from 'next';
import { Foot, Nav } from '@/components/arena/chrome';
import { PlayApp } from '@/components/arena/play-app';

export const metadata: Metadata = { title: 'Play a round' };

export default function PlayPage() {
  return (
    <>
      <Nav />
      <main className="a-page">
        <div className="a-wrap">
          <h1 className="a-h2">Call it, read one take, call it again</h1>
          <p className="a-p">
            Your first call is sealed before you see any price or advice. Then you read one take, from an advisor picked at random unless
            you choose, and call again. When the market settles you see whether that advice helped you.
          </p>
          <PlayApp />
        </div>
      </main>
      <Foot />
    </>
  );
}
