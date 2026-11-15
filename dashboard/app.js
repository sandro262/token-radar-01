// Token Radar radar-2 dashboard. Reads window.RADAR (written beside dashboard/
// by main.ts) and renders all 758 protocols, filterable and sortable, with a
// detail drawer per protocol. No network: every byte shown is in data.js.
// The farm plan and the model are the same derivations main.ts writes to
// board.json: category, chains, TVL, age and token status decide them.
(function () {
  'use strict';
  var DATA = window.RADAR;
  if (!DATA) return;
  var app = document.getElementById('board');
  var state = { q: '', category: 'all', chain: 'all', tab: 'all', mintvl: 0, sort: 'implied', dir: -1, selected: null };
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return '$' + Math.round(n);
  }
  function fmtPct(n) { if (n === null || n === undefined || !isFinite(n)) return 'n/a'; return (n > 0 ? '+' : '') + n.toFixed(2) + '%'; }
  function fmtAge(d) { if (d === null || d === undefined) return 'unknown'; if (d >= 365) return (d / 365).toFixed(1) + 'y'; return Math.max(0, Math.round(d)) + 'd'; }
  function impliedOf(row, model) {
    var cm = row.category_multiple; var g = Math.min(model.growth_cap, Math.max(model.growth_floor, row.change_7d === null ? 0 : row.change_7d));
    var gm = 1 + (g / 100) * model.growth_weight;
    var age = row.age_days === null ? model.unknown_age_days : row.age_days;
    var mm = model.maturity_floor + (Math.min(Math.max(age, 0), model.maturity_days) / model.maturity_days) * model.maturity_range;
    return Math.max(1, Math.round(row.tvl_usd * cm * gm * mm * row.status_factor));
  }
  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === 'class') node.className = attrs[k];
      else if (k === 'text') node.textContent = attrs[k];
      else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
      else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
    });
    for (var i = 2; i < arguments.length; i++) {
      var c = arguments[i]; if (c === null || c === undefined) continue;
      if (Array.isArray(c)) c.forEach(function (x) { if (x) node.appendChild(x); });
      else if (typeof c === 'string') node.appendChild(document.createTextNode(c)); else node.appendChild(c);
    }
    return node;
  }
  function chainOf(p) { return p.chains && p.chains.length ? p.chains[0] : 'its main chain'; }
  function capitalFor(p) { if (p.tvl_usd >= 5e9) return 250; if (p.tvl_usd >= 1e9) return 150; if (p.tvl_usd >= 1e8) return 100; return 50; }
  function holdFor(age) { if (age === null || age === undefined) return 30; if (age < 180) return 60; if (age < 365) return 45; return 30; }
  function actionFor(p, capital, chain) {
    var c = (p.category || '').toLowerCase(); var name = p.name;
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return 'Supply $' + capital + ' of USDC to ' + name + ' on ' + chain + ' and keep the position open.';
    if (c.indexOf('dex') >= 0 || c.indexOf('yield') >= 0 || c.indexOf('leveraged farm') >= 0) return 'Provide $' + capital + ' of liquidity to ' + name + "'s main pool on " + chain + ' and keep the position open.';
    if (c.indexOf('bridge') >= 0) return 'Bridge $' + capital + ' of USDC to ' + chain + ' through ' + name + ' and use the bridged funds in its app.';
    if (c.indexOf('staking') >= 0 || c.indexOf('restak') >= 0) return "Stake $" + capital + " of the chain's staking asset through " + name + ' and keep the receipt.';
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0) return 'Deposit $' + capital + ' of USDC as margin on ' + name + ' and open one small hedge.';
    if (c.indexOf('prediction') >= 0) return 'Fund $' + capital + ' and place one market position on ' + name + '.';
    if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0 || c.indexOf('risk') >= 0) return 'Deposit $' + capital + ' into a ' + name + ' vault on ' + chain + ' and keep the shares.';
    if (c.indexOf('stable') >= 0) return 'Mint or deposit $' + capital + ' of the stable asset through ' + name + ' on ' + chain + '.';
    if (c.indexOf('rwa') >= 0) return "Mint $" + capital + " of the protocol's yield asset on " + chain + ' and hold it.';
    if (c.indexOf('insurance') >= 0) return 'Buy $' + capital + ' of cover from ' + name + ' on ' + chain + ' and keep the policy.';
    if (c.indexOf('payment') >= 0) return 'Send $' + capital + ' through ' + name + ' on ' + chain + ' and keep the receipt.';
    if (c.indexOf('basis') >= 0) return 'Deposit $' + capital + ' of USDC into ' + name + "'s basis vault on " + chain + ' and hold the shares.';
    return 'Deposit $' + capital + ' of USDC into ' + name + ' on ' + chain + ' and keep the position open.';
  }
  function tokenedActionFor(p, capital, chain) {
    var c = (p.category || '').toLowerCase(); var name = p.name; var tok = p.symbol ? '$' + p.symbol : 'its token';
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0) return 'Supply $' + capital + ' of ' + tok + ' or USDC to ' + name + ' on ' + chain + ' and borrow against it once.';
    if (c.indexOf('dex') >= 0) return 'Provide $' + capital + ' of ' + tok + ' plus USDC as liquidity on ' + name + ' on ' + chain + ' and collect the fees.';
    if (c.indexOf('staking') >= 0 || c.indexOf('restak') >= 0) return 'Stake $' + capital + ' of ' + tok + ' through ' + name + ' on ' + chain + ' and keep the staking receipt.';
    if (c.indexOf('bridge') >= 0) return 'Bridge $' + capital + ' of ' + tok + ' through ' + name + ' to ' + chain + ' and use it there.';
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0) return 'Deposit $' + capital + ' of USDC as margin on ' + name + ' and open one small ' + tok + ' hedge.';
    return 'Buy $' + capital + ' of ' + tok + ' on ' + name + "'s market on " + chain + ' and hold it in your own wallet.';
  }
  function stepText(s) { var t = s.text + ' Cost: ' + s.cost + '. Time: ' + s.time + '.'; if (t.length > 600) t = t.slice(0, 596) + '...'; if (t.length < 20) t += " Hold the position and check the protocol's own page."; return t; }
  function farmSteps(p) {
    var chain = chainOf(p); var capital = capitalFor(p); var hold = holdFor(p.age_days);
    var wallet = { text: 'Use a fresh wallet that holds only the funds you plan to use, and keep its seed phrase offline.', cost: 'under $3 of gas for the first transaction', time: '5 minutes' };
    var log = { text: 'Write the wallet, the dates and every transaction in a log so you can repeat the position or unwind it.', cost: 'nothing but the log', time: '5 minutes' };
    var weekly = { text: 'Make one qualifying action each week, such as a deposit, a borrow, a swap or a vote.', cost: 'about $2 of gas a week', time: '10 minutes a week' };
    if (p.token_status === 'tokened') return [
      wallet,
      { text: "This protocol's token already trades, so there is no launch left to farm: " + tokenedActionFor(p, capital, chain), cost: '$' + capital + ' of capital and about $' + (capital >= 150 ? 8 : 4) + ' of gas', time: '15 minutes to set up' },
      { text: 'Stake or vote with ' + (p.symbol ? '$' + p.symbol : 'the token') + ' once, so the position earns the protocol\u2019s own rewards.', cost: 'about $2 of gas', time: '10 minutes' },
      weekly,
      { text: 'Hold the position for at least ' + hold + ' days and claim rewards only from the protocol\u2019s own page.', cost: 'the $' + capital + ' stays in the position', time: hold + ' days' },
      log
    ].map(stepText);
    if (p.token_status === 'wrapped-or-bridged') return [
      wallet,
      { text: 'This is a wrapped or bridged product of a token that already trades, so there is no new token to farm: move only $' + capital + ' through ' + p.name + ' on ' + chain + ' and use it at the destination.', cost: '$' + capital + ' of capital and about $5 of bridge fees', time: '20 minutes to set up' },
      { text: 'Check the destination balance before you move more, and keep the wrapped asset only as long as you need it.', cost: 'no fee to check', time: '10 minutes' },
      weekly,
      { text: 'Hold the wrapped asset for at least ' + hold + ' days only if you are using it; otherwise unwrap and exit.', cost: 'the $' + capital + ' stays in the position', time: hold + ' days' },
      log
    ].map(stepText);
    return [
      wallet,
      { text: actionFor(p, capital, chain), cost: '$' + capital + ' of capital and about $' + (capital >= 150 ? 8 : 4) + ' of gas', time: '15 minutes to set up' },
      weekly,
      { text: 'Hold the position for at least ' + hold + ' days so the activity is counted in more than one snapshot.', cost: 'the $' + capital + ' stays in the position', time: hold + ' days' },
      { text: "Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes.", cost: 'no fee to check, and never pay to claim', time: '10 minutes' },
      log
    ].map(stepText);
  }
  function statusBadge(r) {
    if (r.token_status === 'pre-token') return el('span', { class: 'badge pre', text: 'pre-token' });
    if (r.token_status === 'tokened') return el('span', { class: 'badge tok', text: 'token live' });
    return el('span', { class: 'badge wrap', text: 'wrapped / bridged' });
  }
  function readHash() {
    var hash = window.location.hash.replace(/^#/, ''); if (!hash) return;
    var params = new URLSearchParams(hash);
    if (params.get('q')) state.q = params.get('q');
    if (params.get('p')) state.selected = params.get('p');
    if (params.get('category')) state.category = params.get('category');
    if (params.get('chain')) state.chain = params.get('chain');
    if (params.get('tab')) state.tab = params.get('tab');
    if (params.get('mintvl')) state.mintvl = parseFloat(params.get('mintvl')) || 0;
  }
  function writeHash() {
    var params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    if (state.category !== 'all') params.set('category', state.category);
    if (state.chain !== 'all') params.set('chain', state.chain);
    if (state.tab !== 'all') params.set('tab', state.tab);
    if (state.mintvl) params.set('mintvl', String(state.mintvl));
    if (state.selected) params.set('p', state.selected);
    var next = params.toString();
    if (next) window.history.replaceState(null, '', '#' + next);
    else window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }
  function rows() {
    var q = state.q.trim().toLowerCase();
    return DATA.rows.filter(function (r) {
      if (state.tab === 'pre-token' && r.token_status !== 'pre-token') return false;
      if (state.tab === 'tokened' && r.token_status !== 'tokened') return false;
      if (state.tab === 'wrapped' && r.token_status !== 'wrapped-or-bridged') return false;
      if (state.tab === 'live' && r.token_status === 'pre-token') return false;
      if (state.category !== 'all' && r.category !== state.category) return false;
      if (state.chain !== 'all' && !(r.chains || []).includes(state.chain)) return false;
      if (state.mintvl && r.tvl_usd < state.mintvl) return false;
      if (!q) return true;
      return [r.name, r.slug, r.category, (r.chains || []).join(' ')].join(' ').toLowerCase().indexOf(q) >= 0;
    });
  }
  function sortedRows(list) {
    var key = state.sort;
    return list.slice().sort(function (a, b) {
      var av, bv;
      if (key === 'name') { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
      else if (key === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
      else if (key === 'growth') { av = a.change_7d === null ? -Infinity : a.change_7d; bv = b.change_7d === null ? -Infinity : b.change_7d; }
      else if (key === 'age') { av = a.age_days === null ? Infinity : a.age_days; bv = b.age_days === null ? Infinity : b.age_days; }
      else { av = a.implied_value_usd; bv = b.implied_value_usd; }
      if (av < bv) return -state.dir; if (av > bv) return state.dir;
      return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
    });
  }
  function header() {
    return el('header', { class: 'top' },
      el('div', { class: 'brand' }, el('span', { class: 'mark' }), el('span', { class: 'brand-name', text: 'Token Radar' })),
      el('div', { class: 'top-meta' }, el('span', { text: 'Snapshot ' + DATA.as_of }), el('span', { text: 'DefiLlama protocol index' }), el('span', { text: DATA.model_version + ' model' })));
  }
  function lede() {
    return el('section', { class: 'lede' },
      el('div', null,
        el('h1', { text: 'All 758 protocols, ranked by implied launch value' }),
        el('p', { text: 'The watchlist is the floor: ' + DATA.watchlist_size + ' protocols with at least $50M of TVL and no token on record. The board ranks the whole snapshot, so tokened protocols sit beside the pre-token ones as the market\u2019s own comparison \u2014 never as launches to farm. Implied value is this entry\u2019s model, not a promise.' })),
      el('div', { class: 'facts' },
        el('div', { class: 'fact' }, el('span', { text: 'Watchlist covered' }), el('b', { text: DATA.watchlist_size + ' / ' + DATA.watchlist_size })),
        el('div', { class: 'fact' }, el('span', { text: 'Protocols ranked' }), el('b', { text: String(DATA.board_size) })),
        el('div', { class: 'fact' }, el('span', { text: 'Pre-token rows' }), el('b', { text: String(DATA.pre_token_size) })),
        el('div', { class: 'fact' }, el('span', { text: 'Token already trades' }), el('b', { text: String(DATA.tokened_size) })),
        el('div', { class: 'fact' }, el('span', { text: 'Wrapped / bridged' }), el('b', { text: String(DATA.wrapped_size) }))));
  }
  function tabBtn(label, tab) {
    return el('button', { type: 'button', 'aria-pressed': state.tab === tab ? 'true' : 'false', text: label, onclick: function () { state.tab = tab; render(); } });
  }
  function controls() {
    var categories = Array.from(new Set(DATA.rows.map(function (r) { return r.category || 'Other'; }))).sort();
    var chains = Array.from(new Set(DATA.rows.reduce(function (a, r) { return a.concat(r.chains || []); }, []))).sort();
    var search = el('input', { type: 'search', id: 'q', placeholder: 'Search name, category or chain', value: state.q, 'aria-label': 'Search the board' });
    search.addEventListener('input', function () { state.q = search.value; writeHash(); render(); });
    var cat = el('select', { id: 'category', 'aria-label': 'Filter by category' }, el('option', { value: 'all', text: 'All categories' }), categories.map(function (c) { return el('option', { value: c, text: c, selected: c === state.category ? 'selected' : null }); }));
    cat.addEventListener('change', function () { state.category = cat.value; writeHash(); render(); });
    var ch = el('select', { id: 'chain', 'aria-label': 'Filter by chain' }, el('option', { value: 'all', text: 'All chains' }), chains.map(function (c) { return el('option', { value: c, text: c, selected: c === state.chain ? 'selected' : null }); }));
    ch.addEventListener('change', function () { state.chain = ch.value; writeHash(); render(); });
    var tvl = el('select', { id: 'mintvl', 'aria-label': 'Minimum TVL' },
      el('option', { value: '0', text: 'Any TVL' }), el('option', { value: '50000000', text: 'TVL $50M+' }), el('option', { value: '500000000', text: 'TVL $500M+' }), el('option', { value: '1000000000', text: 'TVL $1B+' }));
    tvl.value = String(state.mintvl);
    tvl.addEventListener('change', function () { state.mintvl = parseFloat(tvl.value) || 0; writeHash(); render(); });
    return el('div', { class: 'controls' },
      el('div', { class: 'field' }, el('label', { for: 'q', text: 'Search' }), search),
      el('div', { class: 'field' }, el('label', { for: 'category', text: 'Category' }), cat),
      el('div', { class: 'field' }, el('label', { for: 'chain', text: 'Chain' }), ch),
      el('div', { class: 'field' }, el('label', { for: 'mintvl', text: 'Min TVL' }), tvl),
      el('div', { class: 'field' }, el('span', { class: 'sub', text: 'Token status' }), el('div', { class: 'tabs' }, tabBtn('All 758', 'all'), tabBtn('Pre-token', 'pre-token'), tabBtn('Token live', 'tokened'), tabBtn('Wrapped', 'wrapped'))),
      el('span', { class: 'count', text: rows().length + ' rows shown' }));
  }
  function sortHeader(key, label) {
    return el('th', { scope: 'col' }, el('button', { type: 'button', onclick: function () { if (state.sort === key) state.dir = -state.dir; else { state.sort = key; state.dir = -1; } render(); } }, label, state.sort === key ? el('span', { 'aria-hidden': 'true', text: state.dir < 0 ? ' v' : ' ^' }) : null));
  }
  function boardTable() {
    var list = sortedRows(rows());
    if (list.length === 0) return el('div', { class: 'panel' }, el('div', { class: 'empty' }, el('h2', { text: 'No protocol matches that filter' }), el('p', { text: 'Clear the search or pick another category to see the board again.' }), el('button', { class: 'button primary', type: 'button', text: 'Clear filters', onclick: function () { state.q = ''; state.category = 'all'; state.chain = 'all'; state.mintvl = 0; writeHash(); render(); } })));
    var max = list[0].implied_value_usd || 1;
    var tbody = el('tbody');
    list.forEach(function (r) {
      var growth = r.change_7d === null ? 'n/a' : fmtPct(r.change_7d);
      var gc = r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg';
      var tr = el('tr', { 'data-selected': state.selected === r.slug ? 'true' : 'false', tabindex: '0', onclick: function () { openDetail(r.slug); }, onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(r.slug); } } },
        el('td', { class: 'num', text: String(r.rank) }),
        el('td', null, el('div', { class: 'name' }, el('b', { text: r.name }), el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') }))),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + gc, text: growth }),
        el('td', { class: 'num', text: fmtAge(r.age_days) }),
        el('td', null, el('div', { class: 'implied' }, el('div', { class: 'bar', 'aria-hidden': 'true' }, el('i', { style: 'width:' + Math.max(3, Math.round((r.implied_value_usd / max) * 100)) + '%' })), el('span', { class: 'num', text: fmtUsd(r.implied_value_usd) }))),
        el('td', null, statusBadge(r), r.watchlist ? el('span', { class: 'badge watch', text: 'watchlist' }) : null));
      tbody.appendChild(tr);
    });
    return el('div', { class: 'panel' }, el('div', { class: 'table-wrap' }, el('table', null,
      el('caption', { class: 'sub', text: 'All 758 protocols, strongest implied launch value first. Select a row for its model and farm plan.' }),
      el('thead', null, el('tr', null, sortHeader('implied', 'Rank'), sortHeader('name', 'Protocol'), sortHeader('tvl', 'TVL'), sortHeader('growth', '7d'), sortHeader('age', 'Age'), sortHeader('implied', 'Implied value'), el('th', { scope: 'col', text: 'Token' }))),
      tbody)));
  }
  function modelPanel() {
    var m = DATA.model;
    var mults = Object.keys(DATA.category_multiples).map(function (k) { return [k, DATA.category_multiples[k]]; }).sort(function (a, b) { return b[1] - a[1]; }).slice(0, 14);
    return el('section', { class: 'panel model' },
      el('h2', { text: 'How implied value is computed \u2014 judge, read this first' }),
      el('p', { class: 'sub', text: 'One function scores all 758 protocols. No name is special-cased; no live data is used; the reference date is the snapshot\u2019s as_of, 2026-11-14.' }),
      el('div', { class: 'formula' }, 'implied = round( tvl_usd x categoryMultiple x growthMult x maturityMult x statusFactor )\ncategoryMultiple = median(mcap / TVL) of tokened protocols in the same category, computed from this snapshot (overall ' + DATA.overall_multiple.toFixed(3) + ' when a category has fewer than 3), clamped to [0.05, 1.20]\ngrowthMult = 1 + clamp(change_7d, -60, 120) / 100 x 0.5\nmaturityMult = 0.6 + min(age_days, 1095) / 1095 x 0.4   (age = as_of \u2212 listed_at; 365 days when listed_at is null)\nstatusFactor = 1.00 pre-token \u00b7 0.02 token already trades \u00b7 0.01 wrapped / bridged product'),
      el('div', { class: 'mult' }, mults.map(function (kv) { return el('span', { text: kv[0] + ' x' + kv[1].toFixed(3) }); })),
      el('p', { class: 'sub', text: 'A tokened protocol keeps its real market cap beside its discounted implied value, so the two are never confused. A wrapped or bridged product is not a launch of its own. Implied value is this entry\u2019s own claim, not a prediction of whether or when a token is issued.' }));
  }
  var dialog = el('dialog', { class: 'detail', id: 'detail', 'aria-labelledby': 'detail-title' });
  dialog.addEventListener('close', function () { state.selected = null; writeHash(); });
  function openDetail(slug) {
    var row = DATA.rows.filter(function (r) { return r.slug === slug; })[0]; if (!row) return;
    state.selected = slug; writeHash(); dialog.textContent = '';
    var steps = farmSteps(row);
    dialog.appendChild(el('div', { class: 'detail-head' },
      el('div', null, el('span', { class: 'brand-name', text: 'Rank ' + row.rank + ' of ' + DATA.board_size + (row.watchlist ? ' \u00b7 watchlist' : '') }),
        el('h2', { id: 'detail-title', text: row.name }),
        el('p', { class: 'sub', text: (row.category || 'Other') + ' on ' + (row.chains && row.chains.length ? row.chains.join(', ') : 'an unnamed chain') })),
      el('button', { class: 'close', type: 'button', 'aria-label': 'Close details', text: 'Close', onclick: function () { dialog.close(); } })));
    var eqRows = [
      ['TVL', fmtUsd(row.tvl_usd)], ['Seven-day growth', fmtPct(row.change_7d)], ['Age with no token', fmtAge(row.age_days)],
      ['Category multiple', String(row.category_multiple)], ['Growth multiplier', String(row.growth_multiplier)],
      ['Maturity multiplier', String(row.maturity_multiplier)], ['Status factor (' + row.token_status + ')', String(row.status_factor)],
      ['Implied value', fmtUsd(row.implied_value_usd)]];
    if (row.mcap_usd !== null) eqRows.push(['Market cap (real, token trades)', fmtUsd(row.mcap_usd)]);
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Implied value' }),
      el('div', { class: 'equation' }, eqRows.map(function (kv) { return el('div', null, el('span', { text: kv[0] }), el('b', { class: 'num', text: kv[1] })); })),
      el('p', { class: 'sub', text: 'Model ' + DATA.model_version + ': the page recomputes this row as ' + fmtUsd(impliedOf(row, DATA.model)) + (impliedOf(row, DATA.model) === row.implied_value_usd ? ', the same number board.json carries.' : ', which differs from the board: the data would be stale.') + ' This is an estimate, not a price.' })));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: row.token_status === 'pre-token' ? 'Farm plan' : 'What to do (no launch to farm)' }),
      el('ol', { class: 'steps' }, steps.map(function (s) { var at = s.indexOf(' Cost: '); var a = at >= 0 ? s.slice(0, at) : s; var t = at >= 0 ? s.slice(at + 1) : ''; return el('li', null, el('b', { text: a }), el('span', { class: 'cost', text: t })); }))));
    if (typeof dialog.showModal === 'function') { if (!dialog.open) dialog.showModal(); } else dialog.setAttribute('open', '');
  }
  function render() {
    app.textContent = '';
    var shell = el('div', { class: 'shell' });
    shell.appendChild(header()); shell.appendChild(lede()); shell.appendChild(controls());
    shell.appendChild(boardTable()); shell.appendChild(modelPanel());
    shell.appendChild(el('footer', { class: 'footer', text: 'Deadline: Dec 14, 2026, 12:57 AM America/New_York. Development Nov 14\u2013Dec 14, 2026; final Dec 14\u201315, 2026. Snapshot as of ' + DATA.as_of + ', DefiLlama protocol index. Implied values are this entry\u2019s own claim, not a prediction of whether or when a token is issued; a protocol is described as recording no token, never as having none.' }));
    app.appendChild(shell); app.setAttribute('aria-busy', 'false');
    if (!dialog.isConnected) app.appendChild(dialog);
    if (state.selected) openDetail(state.selected);
  }
  readHash(); render();
  window.addEventListener('keydown', function (e) { if (e.key === 'Escape' && dialog.open) dialog.close(); });
})();
