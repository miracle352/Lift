'use client';

/** Share a sealed call on X: the link opens /c/<hash>, whose preview image shows the call. */
export function ShareCall({ hash, text = 'I sealed my call on Walrus before the market closed. Check it:' }: { hash: string; text?: string }) {
  const url = typeof window === 'undefined' ? `https://lift-arena.vercel.app/c/${hash}` : `${window.location.origin}/c/${hash}`;
  return (
    <a className="a-btn a-btn-line" href={`https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`} target="_blank" rel="noreferrer">
      Share on X
    </a>
  );
}
