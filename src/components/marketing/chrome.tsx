import Link from 'next/link';
import { cn } from '@/components/ui/primitives';
import { Landscape } from './landscape';
import { Parallax } from './parallax';

export function Logo({ className, dark }: { className?: string; dark?: boolean }) {
  return (
    <Link href="/" className={cn('group inline-flex items-center gap-2.5', className)} aria-label="Receipts home">
      <svg width="30" height="30" viewBox="0 0 30 30" fill="none" aria-hidden className="transition-transform duration-500 group-hover:-rotate-6">
        <path d="M6 3h18v22.5l-3-1.8-3 1.8-3-1.8-3 1.8-3-1.8-3 1.8V3Z" fill={dark ? '#fff' : '#0b0b0c'} />
        <path d="M10 9h10M10 13h10M10 17h6" stroke={dark ? '#0b0b0c' : '#fff'} strokeWidth="1.6" />
        <rect x="18.5" y="15.5" width="3.5" height="3.5" fill="#f0b414" />
      </svg>
      <span className={cn('text-[17px] font-semibold tracking-[-0.02em]', dark ? 'text-white' : 'text-ink')}>Receipts</span>
    </Link>
  );
}

const links = [
  { href: '/#proof', label: 'Proof' },
  { href: '/#how', label: 'How it works' },
  { href: '/#advisors', label: 'Advisors' },
  { href: '/#integrity', label: 'Integrity' },
  { href: '/#faq', label: 'FAQ' },
];

export function SiteNav() {
  return (
    <header className="absolute inset-x-0 top-0 z-30">
      <div className="mx-auto flex max-w-[1200px] items-start justify-between px-4 pt-6 sm:px-8 sm:pt-7">
        <Logo className="enter mt-3" />
        <nav className="enter hidden items-center gap-1 bg-[#e9d9a8]/55 p-2 backdrop-blur-md md:flex" style={{ ['--d' as string]: 1 }} aria-label="Main">
          {links.map((l) => (
            <a key={l.href} href={l.href} className="px-4 py-3 text-[14.5px] text-ink-2 transition-colors hover:text-ink">
              {l.label}
            </a>
          ))}
          <Link href="/matchday" className="ml-1 bg-ink px-4 py-3 text-[14.5px] font-medium text-white transition-colors hover:bg-ink-2">
            Open app
          </Link>
        </nav>
        <details className="enter relative md:hidden">
          <summary className="grid size-11 place-items-center bg-white/60 backdrop-blur-md" aria-label="Menu">
            <svg width="18" height="12" viewBox="0 0 18 12" aria-hidden><path d="M0 1h18M0 6h18M0 11h18" stroke="#0b0b0c" strokeWidth="1.6" /></svg>
          </summary>
          <div className="absolute right-0 mt-2 flex w-56 flex-col bg-white p-2 shadow-xl">
            {links.map((l) => (
              <a key={l.href} href={l.href} className="px-3 py-3 text-[15px]">
                {l.label}
              </a>
            ))}
            <Link href="/matchday" className="mt-1 bg-ink px-3 py-3 text-[15px] font-medium text-white">Open app</Link>
          </div>
        </details>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="relative">
      <Parallax className="relative h-[46vw] max-h-[560px] min-h-[260px] overflow-hidden border-t border-line">
        <Landscape variant="footer" className="absolute inset-0 h-full w-full" />
      </Parallax>
      <div className="mx-auto flex max-w-[1200px] flex-col gap-3 px-4 py-6 text-[12.5px] text-muted sm:flex-row sm:items-center sm:justify-between sm:px-8">
        <div className="flex items-center gap-3">
          <Logo className="scale-90" />
          <span>An entry for Total Recall, the Tatum × Walrus Memory hackathon.</span>
        </div>
        <span>18+. Receipts does not take bets or give financial advice.</span>
      </div>
    </footer>
  );
}
