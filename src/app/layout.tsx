import type { Metadata, Viewport } from 'next';
import localFont from 'next/font/local';
import './globals.css';
import './arena.css';
import { MotionRoot } from '@/components/arena/motion';

// Self-hosted variable fonts (SIL OFL): no network at build time, no layout shift.
const inter = localFont({
  src: './fonts/inter-latin-var.woff2',
  variable: '--font-inter',
  weight: '100 900',
  display: 'swap',
});
const geistMono = localFont({
  src: './fonts/geist-mono-var.woff2',
  variable: '--font-geist-mono',
  weight: '100 900',
  display: 'swap',
  preload: false,
});

const bsd = localFont({ src: './fonts/bigshoulders-display-var.woff2', variable: '--font-bsd', weight: '100 900', display: 'swap' });
const bst = localFont({ src: './fonts/bigshoulders-text-var.woff2', variable: '--font-bst', weight: '100 900', display: 'swap' });
const plex = localFont({
  src: [
    { path: './fonts/plexmono-400.woff2', weight: '400' },
    { path: './fonts/plexmono-500.woff2', weight: '500' },
    { path: './fonts/plexmono-600.woff2', weight: '600' },
  ],
  variable: '--font-plex',
  display: 'swap',
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.APP_URL ?? 'http://localhost:3000'),
  title: { default: 'Receipts — advice that has to earn its fee', template: '%s · Receipts' },
  description:
    'Agents and people make sealed calls on live Polymarket markets, buy one piece of advice, and the advisor is paid only if it made the call better. Sealed on Walrus Memory, verified through Tatum, paid in USDC on Sui.',
  openGraph: { type: 'website', siteName: 'Receipts' },
  twitter: { card: 'summary_large_image' },
};

export const viewport: Viewport = { themeColor: '#14201f', colorScheme: 'dark' };

/*
 * Scroll reveal without React: runs before paint, marks <html> so [data-reveal] starts hidden,
 * reveals on intersection, and also picks up elements added by client-side navigation.
 * Respects prefers-reduced-motion via CSS (globals.css).
 */
const revealScript = `(()=>{var d=document.documentElement;if(!('IntersectionObserver'in window))return;d.classList.add('js-reveal');var io=new IntersectionObserver(function(es){es.forEach(function(e){if(e.isIntersecting){e.target.classList.add('is-in');io.unobserve(e.target)}})},{rootMargin:'0px 0px -8% 0px',threshold:0.08});var seen=new WeakSet();function scan(r){(r.querySelectorAll?r.querySelectorAll('[data-reveal]'):[]).forEach(function(el){if(!seen.has(el)){seen.add(el);io.observe(el)}})}function go(){scan(document);new MutationObserver(function(ms){ms.forEach(function(m){m.addedNodes.forEach(function(n){if(n.nodeType===1){if(n.matches&&n.matches('[data-reveal]')&&!seen.has(n)){seen.add(n);io.observe(n)}scan(n)}})})}).observe(document.body,{childList:true,subtree:true})}document.readyState==='loading'?document.addEventListener('DOMContentLoaded',go):go();setTimeout(function(){document.querySelectorAll('[data-reveal]:not(.is-in)').forEach(function(el){var r=el.getBoundingClientRect();if(r.top<innerHeight)el.classList.add('is-in')})},2500)})();`;

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en" className={`${inter.variable} ${geistMono.variable} ${bsd.variable} ${bst.variable} ${plex.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: revealScript }} />
      </head>
      <body className="a-body min-h-full">
        {children}
        <MotionRoot />
      </body>
    </html>
  );
}
