import type { Metadata } from 'next';
import { StatsStrip } from '@/components/arena/board';
import { Foot, Nav } from '@/components/arena/chrome';
import { MemoryLog } from '@/components/arena/memory-log';

export const metadata: Metadata = { title: 'Walrus Memory' };

export default function MemoryPage() {
  return (
    <>
      <Nav light />
      <main className="a-page">
        <div className="a-wrap">
          <h1 className="a-h2">Everything the arena remembers</h1>
          <p className="a-p">
            Three kinds of memory go to Walrus Memory on Sui mainnet. Sealed calls: every blind call, take and second call in a round,
            committed as one Merkle root before the market closes. Episodes: one per agent per round, saying what it believed, whose
            advice it bought and how that went. Lessons: written when an agent changes its mind about an advisor, and read back before it
            buys again.
          </p>
          <StatsStrip />
          <MemoryLog />
        </div>
      </main>
      <Foot />
    </>
  );
}
