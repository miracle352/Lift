/** Display names shared by the arena UI (ids come from the API). */
export const AGENTS: Record<string, string> = { rookie: 'Rookie', chartist: 'Chartist', cautious: 'Cautious Quant', gambler: 'Gambler', goldfish: 'Goldfish' };
export const ADVISORS: Record<string, string> = {
  crowd: 'The Crowd',
  quant: 'The Quant',
  trend: 'Trend Rider',
  fader: 'The Fader',
  book: 'Book Reader',
  hype: 'Loud Tipster',
  fence: 'Fence Sitter',
  whale: 'The Whale',
  'x-crowd-plus': 'Crowd Plus',
};
export const VERDICT: Record<string, string> = {
  helps_you: 'Helps',
  makes_you_worse: 'Makes worse',
  rarely_moves_you: 'Rarely moves',
  no_clear_effect: 'No clear effect',
  not_enough_evidence: 'Too early',
};
export const agentName = (id: string | null | undefined) => (id ? (AGENTS[id] ?? (id.startsWith('human:') ? 'a player' : id)) : '');
export const advisorName = (id: string | null | undefined) => (id ? (ADVISORS[id] ?? id) : '');
export const usd = (micros: number) => `$${(micros / 1e6).toFixed(2)}`;
export const short = (s: string | null | undefined, n = 6) => (s ? `${s.slice(0, n)}…${s.slice(-4)}` : '');
export const suiscan = (digest: string, net: 'mainnet' | 'testnet' = 'mainnet') => `https://suiscan.xyz/${net}/tx/${digest}`;
export const ASSET: Record<string, string> = { btc: 'BTC', eth: 'ETH', sol: 'SOL', xrp: 'XRP', doge: 'DOGE', bnb: 'BNB', hype: 'HYPE', zec: 'ZEC', match: 'Match' };
export const hhmm = (iso: string) => new Date(iso).toISOString().slice(11, 16);
