// Chain Spread Radar — plain dashboard, no network, no framework.
//
// Reads window.RADAR (written beside dashboard/ by main.ts) and renders three views
// chosen by the URL: ?view=board (default), ?view=detail&slug=<slug> and
// ?view=filtered&f=<text>. The board is a sortable, filterable table; a row click
// opens that protocol's detail view with the model's inputs and its farm plan.
// Farm steps come from data.js, computed by lib/model.ts from the snapshot figures.
(function () {
  'use strict';
  var DATA = window.RADAR;
  var app = document.getElementById('app');
  if (!DATA || !app) return;

  var params = new URLSearchParams(window.location.search);
  var view = params.get('view') || 'board';
  var slugParam = params.get('slug') || '';
  var fParam = params.get('f') || '';

  var state = {
    q: view === 'filtered' ? fParam : '',
    category: 'all',
    chain: 'all',
    sort: 'implied',
    dir: -1,
  };

  var usd0 = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return usd0.format(n);
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function fmtAge(d) {
    if (d === null || d === undefined) return 'unknown';
    if (d >= 365) return (d / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(d)) + 'd';
  }
  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // The model, recomputed in the page so the code and the board agree:
  // implied = round(tvl x 0.24 x sqrt(chains) x (1 + clamp(7d,-60,120)/100 x 0.55)
  //           x (0.6 + 0.4 x min(age,1095)/1095)), unknown age = 365 days.
  function impliedOf(row) {
    var m = DATA.model;
    var g = Math.min(m.growth_cap, Math.max(m.growth_floor, row.change_7d === null ? 0 : row.change_7d));
    var age = row.age_days === null ? m.unknown_age_days : row.age_days;
    return Math.max(1, Math.round(row.tvl_usd * m.base_multiple * Math.sqrt(Math.max(1, row.chains.length)) * (1 + (g / 100) * m.growth_weight) * (m.maturity_floor + (Math.min(Math.max(age, 0), m.maturity_days) / m.maturity_days) * m.maturity_range)));
  }

  function filteredRows() {
    var q = state.q.trim().toLowerCase();
    return DATA.rows.filter(function (r) {
      if (state.category !== 'all' && (r.category || 'Other') !== state.category) return false;
      if (state.chain !== 'all' && r.chains.indexOf(state.chain) < 0) return false;
      if (!q) return true;
      var hay = [r.name, r.slug, r.category, r.chains.join(' ')].join(' ').toLowerCase();
      return hay.indexOf(q) >= 0;
    });
  }
  function sortedRows(list) {
    var key = state.sort;
    return list.slice().sort(function (a, b) {
      var av, bv;
      if (key === 'name') { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
      else if (key === 'category') { av = (a.category || '').toLowerCase(); bv = (b.category || '').toLowerCase(); }
      else if (key === 'chains') { av = a.chains.length; bv = b.chains.length; }
      else if (key === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
      else if (key === 'growth') { av = a.change_7d === null ? -Infinity : a.change_7d; bv = b.change_7d === null ? -Infinity : b.change_7d; }
      else if (key === 'rank') { av = a.rank; bv = b.rank; }
      else { av = a.implied_value_usd; bv = b.implied_value_usd; }
      if (av < bv) return -state.dir;
      if (av > bv) return state.dir;
      return a.slug < b.slug ? -1 : 1;
    });
  }

  function go(url) { window.location.href = url; }
  function boardUrl() { return 'index.html?view=board'; }

  function headerHtml() {
    return '<header class="top"><div class="brand">Chain Spread <b>Radar</b></div>' +
      '<div class="meta"><span>Snapshot ' + esc(DATA.as_of) + '</span><span>DefiLlama protocol index</span><span>Model ' + esc(DATA.model_version) + '</span></div></header>';
  }

  function ledeHtml() {
    return '<h1>' + DATA.watchlist_size + ' watchlist protocols, ranked by implied value</h1>' +
      '<p class="lede">The watchlist is the floor: every protocol with at least <b>$' + Math.round(DATA.floor_usd / 1e6) + 'M TVL</b> and no token on record. ' +
      'The early radar adds <b>' + DATA.early_size + ' pre-token protocols below that floor</b>, by TVL. ' +
      'Implied value rewards size, seven-day growth, time running with no token — and spread: a protocol live on more chains earns a higher multiple. ' +
      'It is a model, not a promise, and it never predicts whether or when a token is issued.</p>' +
      '<div class="facts">' +
      '<div class="fact"><span>Watchlist covered</span><b>' + DATA.watchlist_size + ' / ' + DATA.watchlist_size + '</b></div>' +
      '<div class="fact"><span>Rows ranked</span><b>' + DATA.board_size + '</b></div>' +
      '<div class="fact"><span>Early rows</span><b>' + DATA.early_size + '</b></div>' +
      '<div class="fact"><span>Live-token set aside</span><b>' + DATA.live_size + '</b></div></div>';
  }

  function chipsHtml() {
    var out = '<div class="chips" role="group" aria-label="Filter by chain">';
    out += '<button type="button" class="chip' + (state.chain === 'all' ? ' on' : '') + '" data-chain="all">All chains</button>';
    DATA.top_chains.forEach(function (c) {
      out += '<button type="button" class="chip' + (state.chain === c ? ' on' : '') + '" data-chain="' + esc(c) + '">' + esc(c) + '</button>';
    });
    return out + '</div>';
  }

  function controlsHtml() {
    var cats = Array.from(new Set(DATA.rows.map(function (r) { return r.category || 'Other'; }))).sort();
    var out = '<div class="controls">' +
      '<input type="search" id="q" placeholder="Search name, category or chain" value="' + esc(state.q) + '" aria-label="Search the board">' +
      '<select id="cat" aria-label="Filter by category"><option value="all">All categories</option>';
    cats.forEach(function (c) {
      out += '<option value="' + esc(c) + '"' + (state.category === c ? ' selected' : '') + '>' + esc(c) + '</option>';
    });
    return out + '</select></div>';
  }

  function sortTh(key, label, cls) {
    var arrow = state.sort === key ? (state.dir < 0 ? ' &#9660;' : ' &#9650;') : '';
    return '<th scope="col" class="' + (cls || '') + '"><button type="button" class="thbtn" data-sort="' + key + '">' + label + arrow + '</button></th>';
  }

  function boardHtml(list) {
    var max = (list[0] && list[0].implied_value_usd) || 1;
    var html = '<div class="panel"><table><caption>' + list.length + ' of ' + DATA.board_size +
      ' pre-token protocols. Click a column to sort; click a row for its model and farm plan.</caption><thead><tr>' +
      sortTh('rank', 'Rank', 'num') + sortTh('name', 'Protocol') + sortTh('category', 'Category') +
      sortTh('chains', 'Chains', 'num') + sortTh('tvl', 'TVL', 'num') + sortTh('growth', '7d', 'num') +
      sortTh('implied', 'Implied value', 'num') + '</tr></thead><tbody>';
    list.forEach(function (r) {
      var g = r.change_7d === null ? 'n/a' : fmtPct(r.change_7d);
      var gc = r.change_7d === null ? '' : (r.change_7d >= 0 ? 'pos' : 'neg');
      var pct = Math.max(3, Math.round((r.implied_value_usd / max) * 100));
      html += '<tr data-slug="' + esc(r.slug) + '" tabindex="0">' +
        '<td class="num">' + r.rank + '</td>' +
        '<td><div class="name"><b>' + esc(r.name) + '</b><span class="sub">' + esc(r.slug) + '</span></div></td>' +
        '<td>' + esc(r.category || 'Other') + '</td>' +
        '<td class="num">' + r.chains.length + '<span class="sub">' + esc(r.chains.slice(0, 2).join(', ')) + '</span></td>' +
        '<td class="num">' + fmtUsd(r.tvl_usd) + '</td>' +
        '<td class="num ' + gc + '">' + g + '</td>' +
        '<td><div class="bar" aria-hidden="true"><i style="width:' + pct + '%"></i></div><span class="num">' + fmtUsd(r.implied_value_usd) + '</span></td></tr>';
    });
    return html + '</tbody></table></div>';
  }

  function modelHtml() {
    var m = DATA.model;
    return '<h2>How implied value is computed</h2>' +
      '<div class="formula">implied = round( tvl_usd x ' + m.base_multiple + ' x sqrt(chains) x (1 + clamp(change_7d, ' + m.growth_floor + ', ' + m.growth_cap + ') / 100 x ' + m.growth_weight + ') x (' + m.maturity_floor + ' + min(age_days, ' + m.maturity_days + ') / ' + m.maturity_days + ' x ' + m.maturity_range + ') )</div>' +
      '<p class="note">TVL, seven-day growth, chain count and age all come from the snapshot. Age is days since first listing; an unlisted age counts as ' + m.unknown_age_days + ' days. ' +
      'No protocol name is special-cased. Protocols whose token already trades are set aside at their recorded market cap — they are never ranked here.</p>';
  }

  function renderBoard() {
    var list = sortedRows(filteredRows());
    var html = '<div class="wrap">' + headerHtml() + ledeHtml() + chipsHtml() + controlsHtml();
    if (view === 'filtered') {
      html += '<div class="banner">Filtered view — showing rows matching <b>' + esc(state.q || state.category) + '</b>. ' + list.length + ' of ' + DATA.board_size + ' rows.</div>';
    }
    html += list.length ? boardHtml(list) : '<div class="panel empty"><h2>No protocol matches that filter</h2><p>Clear the search or pick another category or chain.</p></div>';
    html += modelHtml() + '</div>';
    app.innerHTML = html;
    bindBoard();
  }

  function bindBoard() {
    var q = document.getElementById('q');
    if (q) q.addEventListener('input', function () { state.q = q.value; refreshTable(); });
    var cat = document.getElementById('cat');
    if (cat) cat.addEventListener('change', function () { state.category = cat.value; refreshTable(); });
    Array.prototype.forEach.call(document.querySelectorAll('.chip'), function (chip) {
      chip.addEventListener('click', function () {
        state.chain = chip.getAttribute('data-chain');
        Array.prototype.forEach.call(document.querySelectorAll('.chip'), function (c) { c.classList.toggle('on', c === chip); });
        refreshTable();
      });
    });
    bindTable();
  }

  function refreshTable() {
    var list = sortedRows(filteredRows());
    var old = document.querySelector('.panel');
    if (!old) return;
    var tmp = document.createElement('div');
    tmp.innerHTML = list.length ? boardHtml(list) : '<div class="panel empty"><h2>No protocol matches that filter</h2><p>Clear the search or pick another category or chain.</p></div>';
    old.replaceWith(tmp.firstChild);
    var cap = document.querySelector('.banner');
    if (cap && view === 'filtered') cap.innerHTML = 'Filtered view — showing rows matching <b>' + esc(state.q || state.category) + '</b>. ' + list.length + ' of ' + DATA.board_size + ' rows.';
    bindTable();
  }

  function bindTable() {
    Array.prototype.forEach.call(document.querySelectorAll('th .thbtn'), function (btn) {
      btn.addEventListener('click', function () {
        var key = btn.getAttribute('data-sort');
        if (state.sort === key) state.dir = -state.dir;
        else { state.sort = key; state.dir = key === 'name' || key === 'category' ? 1 : -1; }
        refreshTable();
      });
    });
    Array.prototype.forEach.call(document.querySelectorAll('tbody tr'), function (tr) {
      tr.addEventListener('click', function () { go('index.html?view=detail&slug=' + encodeURIComponent(tr.getAttribute('data-slug'))); });
      tr.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go('index.html?view=detail&slug=' + encodeURIComponent(tr.getAttribute('data-slug'))); }
      });
    });
  }

  function renderDetail() {
    var row = null;
    DATA.rows.forEach(function (r) { if (r.slug === slugParam) row = r; });
    if (!row) {
      app.innerHTML = '<div class="wrap">' + headerHtml() + '<div class="panel empty"><h2>Protocol not found</h2><p>No ranked protocol has the slug ' + esc(slugParam) + '.</p><p><a class="btn" href="' + boardUrl() + '">Back to the board</a></p></div></div>';
      app.setAttribute('aria-busy', 'false');
      return;
    }
    var recomputed = impliedOf(row);
    var match = recomputed === row.implied_value_usd;
    var steps = row.farm_steps.map(function (s) {
      var at = s.indexOf(' Cost: ');
      var action = at >= 0 ? s.slice(0, at) : s;
      var tail = at >= 0 ? s.slice(at + 1) : '';
      return '<li><b>' + esc(action) + '</b><span class="cost">' + esc(tail) + '</span></li>';
    }).join('');
    app.innerHTML = '<div class="wrap">' + headerHtml() +
      '<div class="detail-head"><div><span class="tag gold">Rank ' + row.rank + ' of ' + DATA.board_size + '</span> ' +
      '<span class="tag">no token on record</span>' +
      '<h1>' + esc(row.name) + '</h1><p class="lede">' + esc(row.category || 'Other') + ' on ' + esc(row.chains.join(', ')) + ' — ' + row.chains.length + ' chain' + (row.chains.length === 1 ? '' : 's') + '.</p></div>' +
      '<a class="btn ghost" href="' + boardUrl() + '">&larr; Back to the board</a></div>' +
      '<div class="grid">' +
      '<div class="cell"><span>TVL</span><b>' + fmtUsd(row.tvl_usd) + '</b></div>' +
      '<div class="cell"><span>Seven-day change</span><b class="' + (row.change_7d !== null && row.change_7d >= 0 ? 'pos' : 'neg') + '">' + fmtPct(row.change_7d) + '</b></div>' +
      '<div class="cell"><span>Age with no token</span><b>' + fmtAge(row.age_days) + '</b></div>' +
      '<div class="cell"><span>Chain spread &radic;chains</span><b>&times;' + row.spread_multiplier.toFixed(2) + '</b></div>' +
      '<div class="cell"><span>Growth multiplier</span><b>&times;' + row.growth_multiplier.toFixed(2) + '</b></div>' +
      '<div class="cell"><span>Maturity multiplier</span><b>&times;' + row.maturity_multiplier.toFixed(2) + '</b></div></div>' +
      '<div class="cell" style="margin-bottom:18px"><span>Implied value</span><b style="font-size:26px">' + fmtUsd(row.implied_value_usd) + '</b>' +
      '<span style="text-transform:none;letter-spacing:0">The page recomputes this row as ' + fmtUsd(recomputed) + (match ? ' — the same number board.json carries.' : ' — which differs from the board; the data would be stale.') + ' An estimate, not a price.</span></div>' +
      '<h2>Farm plan — 5 steps</h2><ol class="steps">' + steps + '</ol>' +
      modelHtml() + '</div>';
    app.setAttribute('aria-busy', 'false');
  }

  if (view === 'detail') renderDetail();
  else renderBoard();
  app.setAttribute('aria-busy', 'false');
})();
