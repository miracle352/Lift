import type { Metadata } from 'next';
import { Suspense } from 'react';
import { Foot, Nav } from '@/components/arena/chrome';
import { VerifyApp } from '@/components/arena/verify-app';

export const metadata: Metadata = { title: 'Verify a call' };

export default function VerifyPage() {
  return (
    <>
      <Nav />
      <main className="a-page">
        <div className="a-wrap">
          <h1 className="a-h2">Check any call yourself</h1>
          <p className="a-p">
            Paste a call’s receipt hash. After its market closes, the call is read fresh from Sui mainnet through Tatum. Then change one
            number and watch the check fail.
          </p>
          <Suspense>
            <VerifyApp />
          </Suspense>
        </div>
      </main>
      <Foot />
    </>
  );
}
