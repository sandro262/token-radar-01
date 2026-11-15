// Token Radar model v2 ("radar-2"): all 758 snapshot protocols, one formula, no names.
//
// A protocol's implied launch value is the entry's own claim, never a prediction
// of whether or when a token is issued. It is computed only from the snapshot:
//   implied = round( tvl_usd x categoryMultiple x growthMult x maturityMult x statusFactor )
//
// categoryMultiple -- the median market-cap / TVL ratio of the tokened protocols
//   in the SAME category, computed from this snapshot by categoryMultiples().
//   At least 3 tokened protocols with a market cap are needed, else the overall
//   median (0.2049 on this snapshot) is used. Clamped to [0.05, 1.20]. A category
//   whose tokens trade richly against TVL (bridges, basis trading) therefore
//   implies a richer launch than one whose tokens trade thinly (liquid staking).
//   No protocol name is ever looked up: the multiple is a category statistic.
// growthMult -- 1 + clamp(change_7d, -60, 120) / 100 * 0.5. A protocol growing
//   +20% in 7 days scores 1.10x; one shrinking -20% scores 0.90x. Null growth = 0.
// maturityMult -- 0.6 + min(age_days, 1095) / 1095 * 0.4. age_days is as_of minus
//   listed_at (365 when listed_at is null). Longer with no token = more mature,
//   up to 1.00 at 3 years; a 45-day-old protocol scores ~0.62.
// statusFactor -- the launch is what is left to happen. Pre-token (no market
//   cap, no CoinGecko id, no symbol recorded, and not a wrapped / staked /
//   bridged product, not a CEX, not a versioned pool) scores 1.00. A protocol
//   whose token already trades scores 0.02: its launch already happened, so only
//   2% of the modelled value is left as launch value -- it is kept on the board
//   as the market's own comparison, with its real market cap shown beside it.
//   A wrapped / staked / bridged product of a token that already trades (the
//   watchlist's own exclusion rule: Bridge / Canonical Bridge / Liquid Staking /
//   Liquid Restaking / Restaked BTC / CEX categories, a version marker in the
//   name, a whole word wrapped / staked / staking, or an exchange name at the
//   start) scores 0.01: it is not a launch of its own at all.
//
// The board ranks ALL 758 protocols by that one number, so the watchlist (40)
// is the floor, never the ceiling, and the reader can see exactly where every
// tokened protocol sits against the pre-token ones.

export interface SnapshotProtocol {
  slug: string; name: string; category: string | null; chains: string[];
  tvl_usd: number; change_7d: number | null; mcap_usd: number | null;
  listed_at: string | null; gecko_id: string | null; symbol: string | null;
}
export interface Snapshot {
  as_of: string; source: string; floor_usd: number;
  protocols: SnapshotProtocol[]; watchlist: string[];
}
export interface ModelConstants {
  growth_weight: number; growth_floor: number; growth_cap: number;
  maturity_floor: number; maturity_range: number; maturity_days: number;
  unknown_age_days: number; pre_token_factor: number;
  tokened_factor: number; wrapped_factor: number;
  multiple_floor: number; multiple_cap: number; min_category_samples: number;
}
export const MODEL: ModelConstants = {
  growth_weight: 0.5, growth_floor: -60, growth_cap: 120,
  maturity_floor: 0.6, maturity_range: 0.4, maturity_days: 1095,
  unknown_age_days: 365, pre_token_factor: 1.0,
  tokened_factor: 0.02, wrapped_factor: 0.01,
  multiple_floor: 0.05, multiple_cap: 1.2, min_category_samples: 3,
};
export const MODEL_VERSION = 'radar-2';
export type TokenStatus = 'pre-token' | 'tokened' | 'wrapped-or-bridged';
export interface FarmStep { text: string; cost: string; time: string; }
export interface BoardRow {
  rank: number; slug: string; name: string; category: string | null;
  chains: string[]; tvl_usd: number; change_7d: number | null;
  mcap_usd: number | null; listed_at: string | null;
  gecko_id: string | null; symbol: string | null;
  token_status: TokenStatus; watchlist: boolean; age_days: number | null;
  implied_value_usd: number;
  model: { category_multiple: number; growth_pct: number; growth_multiplier: number;
    maturity_multiplier: number; status_factor: number; age_days: number | null; };
  farm_steps: string[];
}
export interface RadarRow {
  rank: number; slug: string; name: string; category: string | null;
  chains: string[]; tvl_usd: number; change_7d: number | null;
  mcap_usd: number | null; listed_at: string | null; age_days: number | null;
  implied_value_usd: number; token_status: TokenStatus; watchlist: boolean;
  category_multiple: number; growth_multiplier: number;
  maturity_multiplier: number; status_factor: number;
}
export interface LiveRow {
  slug: string; name: string; category: string | null; chains: string[];
  tvl_usd: number; mcap_usd: number | null; change_7d: number | null;
}
export interface RadarData {
  as_of: string; source: string; floor_usd: number; model: ModelConstants;
  model_version: string; watchlist_size: number; board_size: number;
  pre_token_size: number; tokened_size: number; wrapped_size: number;
  category_multiples: Record<string, number>; overall_multiple: number;
  rows: RadarRow[]; live: LiveRow[];
}
export class SnapshotError extends Error {
  constructor(message: string) { super(message); this.name = 'SnapshotError'; }
}
const DAY_MS = 86_400_000;
function finite(v: unknown, f: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : f;
}
function clamp(n: number, lo: number, hi: number): number { return Math.min(hi, Math.max(lo, n)); }
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`); const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}
/** Median of a sorted array. */
function median(sorted: number[]): number {
  const n = sorted.length; if (n === 0) return 0;
  return n % 2 === 1 ? sorted[(n - 1) / 2]! : (sorted[n / 2 - 1]! + sorted[n / 2]!) / 2;
}
/**
 * The category multiples, computed from the snapshot alone: for each category,
 * the median mcap_usd / tvl_usd of its tokened protocols that record a market
 * cap, clamped to [multiple_floor, multiple_cap]; categories with fewer than
 * min_category_samples such protocols fall back to the overall median.
 */
export function categoryMultiples(snapshot: Snapshot, model: ModelConstants = MODEL): { byCategory: Record<string, number>; overall: number } {
  const byCat = new Map<string, number[]>();
  const all: number[] = [];
  for (const p of snapshot.protocols) {
    if (p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0) {
      const r = p.mcap_usd / p.tvl_usd; all.push(r);
      const key = p.category ?? 'Other';
      if (!byCat.has(key)) byCat.set(key, []);
      byCat.get(key)!.push(r);
    }
  }
  const overall = clamp(median(all.sort((a, b) => a - b)), model.multiple_floor, model.multiple_cap);
  const byCategory: Record<string, number> = {};
  for (const [cat, rs] of byCat) {
    byCategory[cat] = rs.length >= model.min_category_samples
      ? clamp(median(rs.sort((a, b) => a - b)), model.multiple_floor, model.multiple_cap)
      : overall;
  }
  return { byCategory, overall };
}
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;
const EXCLUDED_CATEGORIES = new Set(['Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC', 'CEX']);
const EXCHANGE_NAMES = ['Binance', 'Coinbase', 'Bybit', 'Kraken', 'Bitget', 'OKX', 'Bitfinex', 'Gemini'];
/** Whether the record is a wrapped / staked / bridged product or an exchange: the watchlist's own exclusion rule. */
export function isWrappedOrBridged(p: SnapshotProtocol): boolean {
  if (p.category !== null && EXCLUDED_CATEGORIES.has(p.category)) return true;
  if (VERSIONED.test(p.name)) return true;
  const words = p.name.toLowerCase().split(/[^a-z]+/);
  if (words.includes('wrapped') || words.includes('staked') || words.includes('staking')) return true;
  return EXCHANGE_NAMES.some((e) => p.name.startsWith(e));
}
/** Whether the record carries no token at all. */
export function isPreTokenRecord(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}
/** The board's token status: pre-token, already-tokened, or a wrapped/bridged product. */
export function tokenStatus(p: SnapshotProtocol): TokenStatus {
  if (isPreTokenRecord(p)) return isWrappedOrBridged(p) ? 'wrapped-or-bridged' : 'pre-token';
  return 'tokened';
}
export function impliedValue(p: SnapshotProtocol, asOf: string, multiples: { byCategory: Record<string, number>; overall: number }, model: ModelConstants = MODEL): { implied: number; growthPct: number; growthMult: number; maturityMult: number; age: number | null; catMultiple: number; statusFactor: number; status: TokenStatus } {
  const age = ageDays(asOf, p.listed_at);
  const growthPct = clamp(finite(p.change_7d, 0), model.growth_floor, model.growth_cap);
  const growthMult = 1 + (growthPct / 100) * model.growth_weight;
  const ageForModel = age ?? model.unknown_age_days;
  const maturityMult = model.maturity_floor + (Math.min(Math.max(ageForModel, 0), model.maturity_days) / model.maturity_days) * model.maturity_range;
  const catMultiple = multiples.byCategory[p.category ?? 'Other'] ?? multiples.overall;
  const status = tokenStatus(p);
  const statusFactor = status === 'pre-token' ? model.pre_token_factor : status === 'tokened' ? model.tokened_factor : model.wrapped_factor;
  const implied = Math.max(1, Math.min(100_000_000_000_000, Math.round(p.tvl_usd * catMultiple * growthMult * maturityMult * statusFactor)));
  return { implied, growthPct, growthMult, maturityMult, age, catMultiple, statusFactor, status };
}
const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;
/** The board: every protocol in the snapshot, scored by the one formula, ranks 1..N. */
export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): BoardRow[] {
  const multiples = categoryMultiples(snapshot, model);
  const watch = new Set(snapshot.watchlist);
  const scored = snapshot.protocols.map((p) => ({ p, v: impliedValue(p, snapshot.as_of, multiples, model) }));
  scored.sort((a, b) => b.v.implied - a.v.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  return scored.map((s, i) => ({
    rank: i + 1, slug: s.p.slug, name: s.p.name, category: s.p.category, chains: s.p.chains,
    tvl_usd: s.p.tvl_usd, change_7d: s.p.change_7d, mcap_usd: s.p.mcap_usd,
    listed_at: s.p.listed_at, gecko_id: s.p.gecko_id, symbol: s.p.symbol,
    token_status: s.v.status, watchlist: watch.has(s.p.slug), age_days: s.v.age,
    implied_value_usd: s.v.implied,
    model: { category_multiple: round4(s.v.catMultiple), growth_pct: s.v.growthPct, growth_multiplier: round4(s.v.growthMult), maturity_multiplier: round4(s.v.maturityMult), status_factor: s.v.statusFactor, age_days: s.v.age },
    farm_steps: farmSteps(s.p, s.v.age, s.v.status).map(stepText),
  }));
}
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}
function chainOf(p: SnapshotProtocol): string { return p.chains.length > 0 ? p.chains[0]! : 'its main chain'; }
function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 250;
  if (p.tvl_usd >= 1_000_000_000) return 150;
  if (p.tvl_usd >= 100_000_000) return 100;
  return 50;
}
function holdDaysFor(age: number | null): number {
  if (age === null) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}
function actionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase(); const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Supply $${capital} of USDC to ${name} on ${chain} and keep the position open.`;
  if (c.includes('dex') || c.includes('yield') || c.includes('leveraged farm')) return `Provide $${capital} of liquidity to ${name}'s main pool on ${chain} and keep the position open.`;
  if (c.includes('bridge')) return `Bridge $${capital} of USDC to ${chain} through ${name} and use the bridged funds in its app.`;
  if (c.includes('staking') || c.includes('restak')) return `Stake $${capital} of the chain's staking asset through ${name} and keep the receipt.`;
  if (c.includes('perpetual') || c.includes('derivative')) return `Deposit $${capital} of USDC as margin on ${name} and open one small hedge.`;
  if (c.includes('prediction')) return `Fund $${capital} and place one market position on ${name}.`;
  if (c.includes('curator') || c.includes('allocator') || c.includes('risk')) return `Deposit $${capital} into a ${name} vault on ${chain} and keep the shares.`;
  if (c.includes('stable')) return `Mint or deposit $${capital} of the stable asset through ${name} on ${chain}.`;
  if (c.includes('rwa')) return `Mint $${capital} of the protocol's yield asset on ${chain} and hold it.`;
  if (c.includes('insurance')) return `Buy $${capital} of cover from ${name} on ${chain} and keep the policy.`;
  if (c.includes('payment')) return `Send $${capital} through ${name} on ${chain} and keep the receipt.`;
  if (c.includes('basis')) return `Deposit $${capital} of USDC into ${name}'s basis vault on ${chain} and hold the shares.`;
  return `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open.`;
}
/** The token's own action for a protocol whose token already trades: use it, never farm a launch. */
function tokenedActionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase(); const name = p.name;
  const tok = p.symbol ? `$${p.symbol}` : 'its token';
  if (c.includes('lend') || c.includes('cdp')) return `Supply $${capital} of ${tok} or USDC to ${name} on ${chain} and borrow against it once.`;
  if (c.includes('dex')) return `Provide $${capital} of ${tok} plus USDC as liquidity on ${name} on ${chain} and collect the fees.`;
  if (c.includes('staking') || c.includes('restak')) return `Stake $${capital} of ${tok} through ${name} on ${chain} and keep the staking receipt.`;
  if (c.includes('bridge')) return `Bridge $${capital} of ${tok} through ${name} to ${chain} and use it there.`;
  if (c.includes('perpetual') || c.includes('derivative')) return `Deposit $${capital} of USDC as margin on ${name} and open one small ${tok} hedge.`;
  return `Buy $${capital} of ${tok} on ${name}'s market on ${chain} and hold it in your own wallet.`;
}
/**
 * A protocol's farm plan, derived only from its own record (category, chains,
 * TVL, age, token status). Pre-token rows farm a possible launch; tokened rows
 * say so plainly and farm the token that already trades; wrapped / bridged
 * rows say the product is a wrapped or bridged asset and farm nothing new.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null, status: TokenStatus): FarmStep[] {
  const chain = chainOf(p); const capital = capitalFor(p); const hold = holdDaysFor(age);
  const wallet: FarmStep = { text: 'Use a fresh wallet that holds only the funds you plan to use, and keep its seed phrase offline.', cost: 'under $3 of gas for the first transaction', time: '5 minutes' };
  const log: FarmStep = { text: 'Write the wallet, the dates and every transaction in a log so you can repeat the position or unwind it.', cost: 'nothing but the log', time: '5 minutes' };
  const weekly: FarmStep = { text: 'Make one qualifying action each week, such as a deposit, a borrow, a swap or a vote.', cost: 'about $2 of gas a week', time: '10 minutes a week' };
  if (status === 'tokened') {
    return [
      wallet,
      { text: `This protocol's token already trades, so there is no launch left to farm: ${tokenedActionFor(p, capital, chain)}`, cost: `$${capital} of capital and about $${capital >= 150 ? 8 : 4} of gas`, time: '15 minutes to set up' },
      { text: `Stake or vote with ${p.symbol ? `$${p.symbol}` : 'the token'} once, so the position earns the protocol's own rewards.`, cost: 'about $2 of gas', time: '10 minutes' },
      weekly,
      { text: `Hold the position for at least ${hold} days and claim rewards only from the protocol's own page.`, cost: `the $${capital} stays in the position`, time: `${hold} days` },
      log,
    ];
  }
  if (status === 'wrapped-or-bridged') {
    return [
      wallet,
      { text: `This is a wrapped or bridged product of a token that already trades, so there is no new token to farm: move only $${capital} through ${p.name} on ${chain} and use it at the destination.`, cost: `$${capital} of capital and about $5 of bridge fees`, time: '20 minutes to set up' },
      { text: `Check the destination balance before you move more, and keep the wrapped asset only as long as you need it.`, cost: 'no fee to check', time: '10 minutes' },
      weekly,
      { text: `Hold the wrapped asset for at least ${hold} days only if you are using it; otherwise unwrap and exit.`, cost: `the $${capital} stays in the position`, time: `${hold} days` },
      log,
    ];
  }
  return [
    wallet,
    { text: actionFor(p, capital, chain), cost: `$${capital} of capital and about $${capital >= 150 ? 8 : 4} of gas`, time: '15 minutes to set up' },
    weekly,
    { text: `Hold the position for at least ${hold} days so the activity is counted in more than one snapshot.`, cost: `the $${capital} stays in the position`, time: `${hold} days` },
    { text: `Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes.`, cost: 'no fee to check, and never pay to claim', time: '10 minutes' },
    log,
  ];
}
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreTokenRecord(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, 24)
    .map((p) => ({ slug: p.slug, name: p.name, category: p.category, chains: p.chains, tvl_usd: p.tvl_usd, mcap_usd: p.mcap_usd, change_7d: p.change_7d }));
}
export function radarRow(row: BoardRow): RadarRow {
  return {
    rank: row.rank, slug: row.slug, name: row.name, category: row.category, chains: row.chains,
    tvl_usd: row.tvl_usd, change_7d: row.change_7d, mcap_usd: row.mcap_usd, listed_at: row.listed_at,
    age_days: row.age_days, implied_value_usd: row.implied_value_usd, token_status: row.token_status,
    watchlist: row.watchlist, category_multiple: row.model.category_multiple,
    growth_multiplier: row.model.growth_multiplier, maturity_multiplier: row.model.maturity_multiplier,
    status_factor: row.model.status_factor,
  };
}
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const board = buildBoard(snapshot, model);
  const multiples = categoryMultiples(snapshot, model);
  const live = liveRows(snapshot);
  const radar: RadarData = {
    as_of: snapshot.as_of, source: snapshot.source, floor_usd: snapshot.floor_usd, model,
    model_version: MODEL_VERSION, watchlist_size: snapshot.watchlist.length, board_size: board.length,
    pre_token_size: board.filter((r) => r.token_status === 'pre-token').length,
    tokened_size: board.filter((r) => r.token_status === 'tokened').length,
    wrapped_size: board.filter((r) => r.token_status === 'wrapped-or-bridged').length,
    category_multiples: multiples.byCategory, overall_multiple: multiples.overall,
    rows: board.map(radarRow), live,
  };
  return { board, radar };
}
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { throw new SnapshotError('snapshot.json is not JSON'); }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    return {
      slug: p.slug, name: p.name, category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd, change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return { as_of: o.as_of, source: o.source, floor_usd: o.floor_usd, protocols, watchlist: o.watchlist as string[] };
}
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slugs: ${missing.slice(0, 5).join(', ')}`;
  if (board.length !== snapshot.protocols.length) return `the board holds ${board.length} rows, not all ${snapshot.protocols.length} protocols`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) return `all ${board.length} rows share the same implied value`;
  for (const r of board) {
    if (r.farm_steps.length < 3 || r.farm_steps.length > 12) return `${r.slug} has ${r.farm_steps.length} farm steps`;
    for (const s of r.farm_steps) if (s.trim().length < 20 || s.trim().length > 600) return `${r.slug} has a farm step of ${s.trim().length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0 || r.implied_value_usd > 100_000_000_000_000) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
