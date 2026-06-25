<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Cash Flow Dashboard</title>
  <link rel="stylesheet" href="styles.css" />
</head>
<body>

  <!-- ============ TOP BAR ============ -->
  <header class="topbar">
    <div class="brand">
      <div class="brand-mark">₹</div>
      <div>
        <h1>Cash Flow Dashboard</h1>
        <p class="sub" id="updatedAt">Loading…</p>
      </div>
    </div>
    <button class="refresh-btn" id="refreshBtn">
      <span class="spin-icon">⟳</span> Refresh data
    </button>
  </header>

  <!-- ============ CONTROLS ============ -->
  <section class="controls">
    <div class="seg" id="companySeg">
      <button class="seg-btn active" data-company="BOTH">Both</button>
      <button class="seg-btn" data-company="VE">Vishal Electricals</button>
      <button class="seg-btn" data-company="VTPL">Vishal Technopower</button>
    </div>

    <div class="seg" id="periodSeg">
      <button class="seg-btn active" data-period="monthly">Monthly</button>
      <button class="seg-btn" data-period="weekly">Weekly</button>
    </div>

    <label class="field">
      <span>Month</span>
      <select id="monthSelect"></select>
    </label>

    <label class="field" id="weekField" style="display:none">
      <span>Week</span>
      <select id="weekSelect">
        <option value="ALL">All weeks</option>
        <option value="1">Week 1 (1–7)</option>
        <option value="2">Week 2 (8–14)</option>
        <option value="3">Week 3 (15–21)</option>
        <option value="4">Week 4 (22–end)</option>
      </select>
    </label>

    <label class="toggle" id="interToggle">
      <input type="checkbox" id="interCheck" />
      <span>Include inter-company transfers</span>
    </label>
  </section>

  <!-- ============ MAIN ============ -->
  <main id="main">
    <div class="loading" id="loadingBox">
      <div class="loader"></div>
      <p>Fetching your Google Sheet…</p>
    </div>

    <div id="errorBox" class="errorbox" style="display:none"></div>

    <div id="content" style="display:none"></div>
  </main>

  <!-- ============ DETAIL MODAL ============ -->
  <div class="modal-overlay" id="modalOverlay" style="display:none">
    <div class="modal">
      <div class="modal-head">
        <h3 id="modalTitle">Details</h3>
        <button class="close-btn" id="modalClose">✕</button>
      </div>
      <div class="modal-body" id="modalBody"></div>
    </div>
  </div>

  <script src="app.js"></script>

  <!-- ================================================================= -->
  <!--  PAGE AGENT — AI assistant (natural language se dashboard chalao)  -->
  <!--  Library: https://github.com/alibaba/page-agent  (MIT License)     -->
  <!-- ================================================================= -->
  <script>
  /* -------------------------------------------------------------------
     CONFIG — sirf yahan badalna padega
     -------------------------------------------------------------------
       mode: 'demo'   -> Alibaba ka FREE testing LLM. Koi API key nahi.
                         SIRF test / evaluation ke liye.
                         ⚠️ Screen pe jo numbers dikh rahe hain wo LLM ko
                            bheje jaate hain — asli daily use ke liye apna
                            proxy laga ke 'custom' mode use karna.

       mode: 'custom' -> Apna model (Qwen/OpenAI/etc.).
                         apiKey browser mein MAT daalo. baseURL ko apne
                         PROXY (Render / Apps Script) pe point karo jo key
                         server-side rakhe. Tab key public source mein
                         expose nahi hogi.
     ------------------------------------------------------------------- */
  const PA_CONFIG = {
    mode: 'demo',                       // 'demo'  ya  'custom'

    // FREE testing LLM — test ke liye aise hi rehne do
    demo: {
      model:   'qwen3.5-plus',
      baseURL: 'https://page-ag-testing-ohftxirgbn.cn-shanghai.fcapp.run',
      apiKey:  'NA',
    },

    // Production — apna proxy URL daalo, key SERVER pe rakho
    custom: {
      model:   'qwen3.5-plus',
      baseURL: 'https://YOUR-PROXY.onrender.com/v1',  // <- apna proxy (… ke aage /chat/completions lagega)
      apiKey:  '',                                    // <- KHAALI rakho! key proxy ke andar
    },

    language: 'en-US',                  // 'en-US' ya 'zh-CN'
  };

  /* Agent ko is dashboard ke controls samjha do — taaki sahi navigate kare */
  const DASHBOARD_INSTRUCTIONS = `
You are an assistant embedded inside the "Cash Flow Dashboard" of
Vishal Electricals (VE) and Vishal Technopower (VTPL).

Operate this page by clicking and selecting — do NOT compute numbers yourself,
just set the right filters and then read the figures already shown on screen.

Controls on this page:
- Company filter (top buttons): "Both", "Vishal Electricals" (= VE),
  "Vishal Technopower" (= VTPL).
- Period filter: "Monthly" / "Weekly" buttons. Choosing Weekly reveals a
  "Week" dropdown — Week 1 = days 1–7, Week 2 = 8–14, Week 3 = 15–21,
  Week 4 = 22–end.
- "Month" dropdown selects the month.
- "Include inter-company transfers" checkbox toggles VE↔VTPL transfers.
- "Refresh data" button reloads from the Google Sheet.
- Clicking a table row opens an entry-wise detail popup; close it with ✕.

All amounts are INR (shown in Cr / Lakh). Data starts 1 April 2026 (FY).
Reply briefly in the user's language.
`.trim();

  /* -------------------------------------------------------------------
     LOADER — script ko 3 CDN se try karta hai. jsDelivr block/slow ho
     (India ke kuch network pe hota hai) to apne aap unpkg / npmmirror
     try karega. Agar teeno fail ho to console mein clear message aayega.
     ------------------------------------------------------------------- */
  (function loadPageAgent(){
    const VER    = '1.10.0';
    const FILE   = 'dist/iife/page-agent.demo.js?autoInit=false';
    const isFile = location.protocol === 'file:';

    // file:// pe query string file-naam ka hissa ban jaata hai → locally query mat lagao.
    // Isliye http server (localhost / GitHub Pages) se kholna sabse saaf rehta hai.
    const LOCAL = isFile ? 'page-agent.demo.js' : 'page-agent.demo.js?autoInit=false';

    const CDNS = [
      LOCAL,                                                             // 1) local copy pehle
      'https://cdn.jsdelivr.net/npm/page-agent@' + VER + '/' + FILE,     // 2) fallback CDNs
      'https://unpkg.com/page-agent@' + VER + '/' + FILE,
      'https://registry.npmmirror.com/page-agent/' + VER + '/files/' + FILE,
    ];

    function init(){
      // agar bundle ne khud (auto-init se) agent bana diya ho to use hata do
      try { if (window.pageAgent && window.pageAgent.dispose) window.pageAgent.dispose(); } catch(e){}
      const c = PA_CONFIG[PA_CONFIG.mode];
      window.pageAgent = new window.PageAgent({
        model:    c.model,
        baseURL:  c.baseURL,
        apiKey:   c.apiKey,
        language: PA_CONFIG.language,
        instructions: { system: DASHBOARD_INSTRUCTIONS },
      });
      window.pageAgent.panel.show();
      console.log('[PageAgent] ready ✓  (mode: ' + PA_CONFIG.mode + ')');
    }

    function onReady(src){
      if (!window.PageAgent) return false;       // script load to hua par class nahi mili
      if (src.indexOf('autoInit=false') !== -1) {
        init();                                  // http: manual init (en-US + instructions)
      } else {
        // file://: bundle khud auto-init karega (default), thoda ruk ke apni config se replace
        setTimeout(init, 100);
      }
      return true;
    }

    function tryCdn(i){
      if (window.PageAgent) return;              // pehle hi load ho chuka
      if (i >= CDNS.length){
        console.error('[PageAgent] Load nahi hua. Sabse saaf: is folder mein ' +
          '`python -m http.server` chala ke http://localhost:8000 kholo (file:// se nahi).');
        return;
      }
      const s = document.createElement('script');
      s.src = CDNS[i];
      s.onload  = function(){ if (!onReady(this.src)) tryCdn(i + 1); };
      s.onerror = function(){ console.warn('[PageAgent] fail:', CDNS[i], '→ agla try…'); tryCdn(i + 1); };
      document.head.appendChild(s);
    }

    tryCdn(0);
  })();
  </script>

</body>
</html>
