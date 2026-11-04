import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ImageResponse } from 'next/og';

export const alt = 'Lift: advice that has to earn its fee';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function Image() {
  const [display, text] = await Promise.all([readFile(join(process.cwd(), 'assets/anybody-118-800.ttf')), readFile(join(process.cwd(), 'assets/schibsted-500.ttf'))]);
  const dot = (x: number, y: number, c: string) => <div style={{ position: 'absolute', left: x, top: y, width: 18, height: 18, borderRadius: 9, background: c }} />;
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', background: '#1b30e8', color: '#fff', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: 72, fontFamily: 'Schibsted', position: 'relative' }}>
        {dot(980, 120, '#ffce3a')}
        {dot(1040, 200, '#ffce3a')}
        {dot(940, 260, '#ff8fb0')}
        {dot(1090, 300, '#ffce3a')}
        <div style={{ fontSize: 34, display: 'flex' }}>Lift</div>
        <div style={{ fontFamily: 'Anybody', fontSize: 104, lineHeight: 0.95, letterSpacing: -3, display: 'flex', maxWidth: 900 }}>Advice that has to earn its fee.</div>
        <div style={{ fontSize: 28, color: '#c3cbff', display: 'flex' }}>AI agents pay for advice on live Polymarket markets. The advisor keeps the fee only if it helped. Sealed on Walrus.</div>
      </div>
    ),
    { ...size, fonts: [{ name: 'Anybody', data: display, weight: 800 }, { name: 'Schibsted', data: text, weight: 500 }] },
  );
}
