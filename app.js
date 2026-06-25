// ===================================================================
//  app.js — Cash Flow Dashboard (Web version, GitHub Pages ready)
//  Data seedha browser se Google Sheet ke gviz endpoint se aata hai.
//  Sheet "Anyone with the link -> Viewer" honi chahiye.
// ===================================================================

// -------------------------------------------------------------------
//  CONFIG  — agar sheet ka naam/ID/date badle to sirf yahan badlo
// -------------------------------------------------------------------
const SHEET_ID = '1cb_imdfUVHGeaVU5MeCk8Edq0JzFjLDbWUuJR4a12CQ';

const SHEETS = [
  { name: 'CASH IN FLOW VE',    company: 'VE',   type: 'inflow'  },
  { name: 'CASH OUT FLOW VE',   company: 'VE',   type: 'outflow' },
  { name: 'CASH IN FLOW VTPL',  company: 'VTPL', type: 'inflow'  },
  { name: 'CASH OUT FLOW VTPL', company: 'VTPL', type: 'outflow' },
];

const COMPANY_NAMES = { VE: 'Vishal Electricals', VTPL: 'Vishal Technopower' };

// Inter-company transfer detection (apni do company ke beech ka paisa)
const INTERCOMPANY = { VE: ['TECHNOPOWER'], VTPL: ['ELECTRICAL'] };

// App sirf is date se data dikhayega (financial year). 3 = April (0-indexed).
const START_DATE = new Date(2026, 3, 1);   // 1 April 2026

const BIG_THRESHOLD = 100000; // 1 lakh — isse upar wali outflow entry vendor naam se

// ===================================================================
//  DATA FETCHING + PARSING (browser)
// ===================================================================
function gvizUrl(sheetName){
  return `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:json&sheet=${encodeURIComponent(sheetName)}`;
}
function stripWrapper(text){
  const start = text.indexOf('(');
  const end = text.lastIndexOf(')');
  if (start === -1 || end === -1) throw new Error('Bad response — sheet shared nahi hai?');
  return JSON.parse(text.slice(start + 1, end));
}
function parseGvizDate(v){
  if (v == null) return null;
  if (typeof v === 'string'){
    const m = v.match(/Date\((\d+),(\d+),(\d+)(?:,(\d+),(\d+),(\d+))?\)/);
    if (m) return new Date(+m[1], +m[2], +m[3]);
    const d = parseLooseDate(v);
    if (d) return d;
  }
  return null;
}
function parseLooseDate(s){
  s = String(s).trim();
  const months = { jan:0,feb:1,mar:2,apr:3,may:4,jun:5,jul:6,aug:7,sep:8,oct:9,nov:10,dec:11 };
  let m = s.match(/^(\d{1,2})[-\s]([A-Za-z]{3})[A-Za-z]*[-\s](\d{2,4})$/);
  if (m){ const day=+m[1], mon=months[m[2].toLowerCase()], yr=+m[3]<100?2000+ +m[3]:+m[3];
    if (mon!=null) return new Date(yr,mon,day); }
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (m){ const yr=+m[3]<100?2000+ +m[3]:+m[3]; return new Date(yr, +m[2]-1, +m[1]); }
  m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return new Date(+m[1], +m[2]-1, +m[3]);
  return null;
}
function parseAmount(cell){
  if (!cell) return null;
  if (typeof cell.v === 'number') return cell.v;
  if (typeof cell.v === 'string'){
    const n = parseFloat(cell.v.replace(/[^0-9.\-]/g, ''));
    return isNaN(n) ? null : n;
  }
  return null;
}

async function fetchSheet(cfg){
  const res = await fetch(gvizUrl(cfg.name));
  const text = await res.text();
  const data = stripWrapper(text);
  const rows = (data.table && data.table.rows) || [];
  const out = [];
  const otherPatterns = INTERCOMPANY[cfg.company] || [];
  for (const r of rows){
    const c = r.c || [];
    const date = c[0] ? parseGvizDate(c[0].v) : null;
    const vendor = c[1] && c[1].v != null ? String(c[1].v).trim() : '';
    const amount = parseAmount(c[2]);
    const head = c[3] && c[3].v != null ? String(c[3].v).trim() : '';
    if (date && amount != null && amount !== 0){
      if (date < START_DATE) continue;           // April se pehle ka data chhodo
      const vUpper = vendor.toUpperCase();
      const intercompany = otherPatterns.some(p => vUpper.includes(p));
      out.push({
        date: date.toISOString(),
        day: date.getDate(), month: date.getMonth(), year: date.getFullYear(),
        vendor: vendor || '(no name)',
        amount: Math.abs(amount),
        head: head || 'Other',
        company: cfg.company, type: cfg.type, intercompany,
      });
    }
  }
  return out;
}

async function fetchAll(){
  const results = await Promise.all(SHEETS.map(fetchSheet));
  return results.flat();
}

// ===================================================================
//  STATE
// ===================================================================
let ALL = [];
const state = {
  company: 'BOTH', period: 'monthly', month: 'ALL', week: 'ALL', includeInter: false,
};

// ---------- Indian number formatting ----------
function inrFull(n){
  const neg = n < 0; n = Math.abs(Math.round(n));
  let s = n.toString();
  if (s.length > 3){
    const last3 = s.slice(-3);
    let rest = s.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',');
    s = rest + ',' + last3;
  }
  return (neg ? '-₹' : '₹') + s;
}
function inrShort(n){
  const neg = n < 0; const a = Math.abs(n); const sign = neg ? '-' : '';
  if (a >= 1e7) return sign + '₹' + (a/1e7).toFixed(2) + ' Cr';
  if (a >= 1e5) return sign + '₹' + (a/1e5).toFixed(2) + ' L';
  return inrFull(n);
}

// ---------- helpers ----------
function weekOf(day){ return day<=7?1:day<=14?2:day<=21?3:4; }
function monthKey(r){ return r.year + '-' + r.month; }
function monthLabel(year, month){
  const names = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return names[month] + ' ' + year;
}
function fmtDate(iso){
  const d = new Date(iso);
  const names = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return d.getDate() + ' ' + names[d.getMonth()] + ' ' + String(d.getFullYear()).slice(2);
}
function sum(arr){ return arr.reduce((s,r)=>s+r.amount, 0); }

// ---------- filtering ----------
function inPeriod(r){
  if (state.month !== 'ALL' && monthKey(r) !== state.month) return false;
  if (state.period === 'weekly' && state.week !== 'ALL' && weekOf(r.day) !== +state.week) return false;
  return true;
}

// ---------- breakdown builders ----------
function outflowBreakdown(records){
  const big = {}, small = {};
  for (const r of records){
    if (r.amount >= BIG_THRESHOLD){
      (big[r.vendor] ||= { amount:0, entries:[] });
      big[r.vendor].amount += r.amount; big[r.vendor].entries.push(r);
    } else {
      (small[r.head] ||= { amount:0, entries:[] });
      small[r.head].amount += r.amount; small[r.head].entries.push(r);
    }
  }
  const rows = [];
  for (const [name,v] of Object.entries(big))   rows.push({ name, amount:v.amount, type:'vendor', entries:v.entries });
  for (const [name,v] of Object.entries(small)) rows.push({ name, amount:v.amount, type:'head',   entries:v.entries });
  return rows.sort((a,b)=>b.amount-a.amount);
}
function inflowBreakdown(records){
  const g = {};
  for (const r of records){
    (g[r.head] ||= { amount:0, entries:[] });
    g[r.head].amount += r.amount; g[r.head].entries.push(r);
  }
  return Object.entries(g)
    .map(([name,v]) => ({ name, amount:v.amount, type:'head', entries:v.entries }))
    .sort((a,b)=>b.amount-a.amount);
}

// ===================================================================
//  RENDERING
// ===================================================================
const $ = sel => document.querySelector(sel);

function renderContent(){
  const content = $('#content');
  const companies = state.company === 'BOTH' ? ['VE','VTPL'] : [state.company];
  const grid = document.createElement('div');
  grid.className = 'company-grid' + (state.company === 'BOTH' ? ' both' : '');

  for (const co of companies){
    const coAll = ALL.filter(r => r.company === co && inPeriod(r));
    const recs = coAll.filter(r => state.includeInter || !r.intercompany);
    const inter = coAll.filter(r => r.intercompany);
    const inflow  = recs.filter(r => r.type === 'inflow');
    const outflow = recs.filter(r => r.type === 'outflow');
    const inTot = sum(inflow), outTot = sum(outflow), net = inTot - outTot;

    const interTot = sum(inter);
    let noteHtml = '';
    if (inter.length){
      noteHtml = state.includeInter
        ? `<div class="exclude-note"><span class="ic">⚠</span>
             <span><b>${inter.length}</b> inter-company transfer included
             (<b class="num">${inrShort(interTot)}</b>) — uncheck the box to exclude.</span></div>`
        : `<div class="exclude-note"><span class="ic">✓</span>
             <span><b>${inter.length}</b> inter-company transfer excluded
             (<b class="num">${inrShort(interTot)}</b>) — apni dono company ke beech ka paisa, count nahi hua.</span></div>`;
    }

    const block = document.createElement('div');
    block.className = 'company-block';
    block.innerHTML = `
      <div class="company-title"><span class="dot"></span>${COMPANY_NAMES[co] || co}</div>
      <div class="cards">
        <div class="card in">
          <div class="label"><span class="tick"></span>Cash In</div>
          <div class="value num">${inrShort(inTot)}</div>
          <div class="approx num">${inrFull(inTot)}</div>
        </div>
        <div class="card out">
          <div class="label"><span class="tick"></span>Cash Out</div>
          <div class="value num">${inrShort(outTot)}</div>
          <div class="approx num">${inrFull(outTot)}</div>
        </div>
        <div class="card net">
          <div class="label"><span class="tick"></span>Net Flow</div>
          <div class="value num ${net>=0?'val-pos':'val-neg'}">${inrShort(net)}</div>
          <div class="approx num">${inrFull(net)}</div>
        </div>
      </div>
      ${noteHtml}
    `;

    block.appendChild(buildPanel({
      title: 'Outflow — head-wise',
      hint: '1 lakh+ entries vendor naam se · neeche head total',
      total: outTot, totalColor: 'var(--out)',
      rows: outflowBreakdown(outflow), barColor: 'var(--out)',
      allEntries: outflow, allLabel: 'all outflow entries', company: co, kind: 'Outflow',
    }));
    block.appendChild(buildPanel({
      title: 'Inflow — head-wise',
      hint: 'Sales, deposit, transfers…',
      total: inTot, totalColor: 'var(--in)',
      rows: inflowBreakdown(inflow), barColor: 'var(--in)',
      allEntries: inflow, allLabel: 'all inflow entries', company: co, kind: 'Inflow',
    }));

    grid.appendChild(block);
  }
  content.innerHTML = '';
  content.appendChild(grid);
}

function buildPanel(opt){
  const panel = document.createElement('div');
  panel.className = 'panel';
  const maxAmt = opt.rows.length ? opt.rows[0].amount : 1;

  const head = document.createElement('div');
  head.className = 'panel-head';
  head.innerHTML = `
    <div><h4>${opt.title}</h4><div class="hint">${opt.hint}</div></div>
    <div class="panel-total num" style="color:${opt.totalColor}">${inrShort(opt.total)}</div>`;
  panel.appendChild(head);

  if (!opt.rows.length){
    const e = document.createElement('div');
    e.className = 'empty'; e.textContent = 'Is period mein koi entry nahi.';
    panel.appendChild(e); return panel;
  }

  for (const row of opt.rows){
    const el = document.createElement('div');
    el.className = 'row';
    const pct = Math.max(4, (row.amount / maxAmt) * 100);
    el.innerHTML = `
      <div class="rname" title="${escapeHtml(row.name)}">${escapeHtml(row.name)}</div>
      <span class="tag ${row.type}">${row.type === 'vendor' ? 'vendor' : 'head'}</span>
      <div class="rbar"><i style="width:${pct}%;background:${opt.barColor}"></i></div>
      <div class="rcount">${row.entries.length}×</div>
      <div class="ramt num">${inrShort(row.amount)}</div>`;
    el.onclick = () => openDetail(row.name + '  ·  ' + COMPANY_NAMES[opt.company], row.entries);
    panel.appendChild(el);
  }

  const foot = document.createElement('div');
  foot.className = 'row'; foot.style.justifyContent = 'center';
  foot.innerHTML = `<div class="rname" style="flex:0;color:var(--accent);font-weight:700">
    See ${opt.allLabel} (${opt.allEntries.length}) →</div>`;
  foot.onclick = () => openDetail(opt.kind + ' — ' + COMPANY_NAMES[opt.company], opt.allEntries);
  panel.appendChild(foot);
  return panel;
}

function escapeHtml(s){
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

// ---------- detail modal ----------
function openDetail(title, entries){
  $('#modalTitle').textContent = title;
  const sorted = [...entries].sort((a,b)=> new Date(b.date) - new Date(a.date));
  const total = sum(entries);
  $('#modalBody').innerHTML = `
    <div class="detail-row" style="font-weight:700;border-bottom:2px solid var(--line)">
      <div class="ddate">Date</div><div class="dname">Vendor / Party</div>
      <div class="dhead">Head</div><div class="damt num">${inrFull(total)}</div>
    </div>
    ${sorted.map(r => `
      <div class="detail-row">
        <div class="ddate num">${fmtDate(r.date)}</div>
        <div class="dname">${escapeHtml(r.vendor)}</div>
        <div class="dhead">${escapeHtml(r.head)}</div>
        <div class="damt num">${inrFull(r.amount)}</div>
      </div>`).join('')}`;
  $('#modalOverlay').style.display = 'flex';
}
$('#modalClose').onclick = () => $('#modalOverlay').style.display = 'none';
$('#modalOverlay').onclick = e => { if (e.target.id === 'modalOverlay') $('#modalOverlay').style.display = 'none'; };

// ---------- month dropdown ----------
function populateMonths(){
  const keys = [...new Set(ALL.map(monthKey))].sort((a,b)=>{
    const [ay,am]=a.split('-').map(Number), [by,bm]=b.split('-').map(Number);
    return ay!==by ? ay-by : am-bm;
  });
  const sel = $('#monthSelect');
  sel.innerHTML = '<option value="ALL">All months</option>' +
    keys.map(k=>{ const [y,m]=k.split('-').map(Number); return `<option value="${k}">${monthLabel(y,m)}</option>`; }).join('');
  if (keys.length){ state.month = keys[keys.length-1]; sel.value = state.month; }
}

// ===================================================================
//  CONTROLS
// ===================================================================
$('#companySeg').addEventListener('click', e=>{
  const b = e.target.closest('.seg-btn'); if(!b) return;
  [...e.currentTarget.children].forEach(x=>x.classList.remove('active'));
  b.classList.add('active'); state.company = b.dataset.company; renderContent();
});
$('#periodSeg').addEventListener('click', e=>{
  const b = e.target.closest('.seg-btn'); if(!b) return;
  [...e.currentTarget.children].forEach(x=>x.classList.remove('active'));
  b.classList.add('active'); state.period = b.dataset.period;
  $('#weekField').style.display = state.period === 'weekly' ? 'flex' : 'none';
  renderContent();
});
$('#monthSelect').addEventListener('change', e=>{ state.month = e.target.value; renderContent(); });
$('#weekSelect').addEventListener('change', e=>{ state.week = e.target.value; renderContent(); });
$('#interCheck').addEventListener('change', e=>{ state.includeInter = e.target.checked; renderContent(); });
$('#refreshBtn').addEventListener('click', loadData);

// ===================================================================
//  LOAD
// ===================================================================
async function loadData(){
  const btn = $('#refreshBtn');
  btn.classList.add('loading'); btn.disabled = true;
  $('#errorBox').style.display = 'none';
  if (!ALL.length){ $('#loadingBox').style.display = 'block'; $('#content').style.display='none'; }

  try {
    const records = await fetchAll();
    ALL = records;
    populateMonths();
    $('#updatedAt').textContent = 'Updated ' + new Date().toLocaleTimeString() + '  ·  ' + ALL.length + ' entries';
    $('#loadingBox').style.display = 'none';
    $('#content').style.display = 'block';
    renderContent();
  } catch (err){
    $('#loadingBox').style.display = 'none';
    $('#errorBox').style.display = 'block';
    $('#errorBox').innerHTML = `<b>Data load nahi hua</b>
      1) Sheet ko <b>Share → "Anyone with the link" → Viewer</b> karo.<br>
      2) Sheet tab names code ke config se match hone chahiye.<br><br>
      <span style="opacity:.7">Technical: ${escapeHtml(err.message || String(err))}</span>`;
  } finally {
    btn.classList.remove('loading'); btn.disabled = false;
  }
}

loadData();
