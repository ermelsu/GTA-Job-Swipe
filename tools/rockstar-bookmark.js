/* ==========================================================================
   GTA Job Swipe — RUN: adiciona as corridas da playlist aos "Bookmarked"
   da sua conta Rockstar.
   --------------------------------------------------------------------------
   Como funciona (o painel gera este script com os IDs da sua lista):
     1. Você entra logado em socialclub.rockstargames.com (mesma conta do jogo).
     2. Cola este script no Console e dá Enter.
     3. Clica no ⭐ (bookmark/salvar) de UMA corrida DESTA lista.
     4. O script "aprende" essa requisição e repete pras outras corridas.
   Assim funciona mesmo sem saber o endpoint exato da Rockstar, e continua
   funcionando se a Rockstar mudar a API. (Roda no site da Rockstar porque o
   navegador bloqueia chamadas externas de outros sites.)
   ========================================================================== */
(() => {
  const JOBS = __JOBS__;                       // IDs das corridas (injetado pelo painel)
  if (!Array.isArray(JOBS) || !JOBS.length) { console.warn("Lista vazia."); return; }

  const orig = window.fetch.bind(window);
  const XO = XMLHttpRequest.prototype.open,
        XS = XMLHttpRequest.prototype.setRequestHeader,
        XSe = XMLHttpRequest.prototype.send;
  let auth = null, learning = true, template = null;

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const getAuth = (h) => { for (const k in h) if (k.toLowerCase() === "authorization") return h[k]; return null; };
  const isWrite = (m) => m && /^(POST|PUT|PATCH|DELETE)$/i.test(m);
  const bodyToStr = (b) => { if (b == null) return ""; if (typeof b === "string") return b; try { return JSON.stringify(b); } catch (e) { return ""; } };

  // Observa as requisições: guarda o token e "aprende" o clique de bookmark.
  function maybeLearn(url, method, headers, body) {
    const a = getAuth(headers); if (a) auth = a;
    if (!learning || template || !url || !isWrite(method)) return;
    const hay = url + " " + bodyToStr(body);
    const hit = JOBS.find((id) => hay.indexOf(id) !== -1);
    if (!hit) return;                          // é um write, mas sem ID da lista -> ignora
    template = { url, method, headers: Object.assign({}, headers), body, id: hit };
    learning = false;
    console.log("%c✅ Bookmark capturado! Replicando pras outras corridas…", "color:#2ecc71;font-weight:bold");
    runAll();
  }

  window.fetch = function (input, init) {
    try {
      const url = typeof input === "string" ? input : (input && input.url);
      const method = (init && init.method) || (input && input.method) || "GET";
      const headers = {};
      if (init && init.headers) new Headers(init.headers).forEach((v, k) => headers[k] = v);
      else if (input && input.headers && input.headers.forEach) input.headers.forEach((v, k) => headers[k] = v);
      maybeLearn(url, method, headers, init && init.body);
    } catch (e) {}
    return orig.apply(this, arguments);
  };
  XMLHttpRequest.prototype.open = function (m, u) { this.__m = m; this.__u = u; this.__h = {}; return XO.apply(this, arguments); };
  XMLHttpRequest.prototype.setRequestHeader = function (k, v) { if (this.__h) this.__h[k] = v; return XS.apply(this, arguments); };
  XMLHttpRequest.prototype.send = function (body) { try { maybeLearn(this.__u, this.__m, this.__h || {}, body); } catch (e) {} return XSe.apply(this, arguments); };

  async function runAll() {
    const t = template; let ok = 0, fail = 0;
    console.log("Corridas na lista:", JOBS.length);
    for (const id of JOBS) {
      if (id === t.id) { ok++; console.log("⭐ " + id + "  (você já fez esta)  " + ok + "/" + JOBS.length); continue; }
      const url = String(t.url).split(t.id).join(id);
      const body = (typeof t.body === "string") ? t.body.split(t.id).join(id) : t.body;
      const headers = Object.assign({}, t.headers);
      if (auth && !getAuth(headers)) headers["authorization"] = auth;
      let done = false;
      for (let a = 0; a < 5 && !done; a++) {
        try {
          const r = await orig(url, { method: t.method, headers, body, credentials: "include" });
          if (r.status === 429) { const w = 1500 * Math.pow(1.8, a); console.warn("⏳ 429 (limite) — esperando " + Math.round(w / 1000) + "s"); await sleep(w); continue; }
          if (r.ok) { ok++; done = true; console.log("⭐ " + id + "  (" + ok + "/" + JOBS.length + ")"); }
          else { fail++; done = true; console.warn("✗ " + id + " → HTTP " + r.status); }
        } catch (e) { fail++; done = true; console.warn("✗ " + id + " erro", e); }
      }
      await sleep(800);                        // respira entre uma e outra
    }
    console.log("%c🏁 Pronto! " + ok + " adicionada(s), " + fail + " falhou(aram). Abra o jogo em ‘Bookmarked’.", "color:#2ecc71;font-size:14px;font-weight:bold");
  }

  console.log("%c🔖 Ouvindo… agora clique no BOOKMARK (⭐) de UMA corrida DESTA lista aqui no site.", "color:#f5b942;font-size:14px;font-weight:bold");
})();
