/* ==========================================================================
   GTA Job Swipe — importador Rockstar (cole no Console do navegador).
   --------------------------------------------------------------------------
   Estratégia dupla, sem colar token:
   1) Procura o token de sessão no próprio navegador -> baixa NA HORA.
   2) Se não achar, "escuta" a requisição da página (fetch/XHR) -> role a
      página pra disparar uma busca e ele captura o token e baixa.

   USO: logado em socialclub.rockstargames.com/jobs, F12 -> Console -> cola
   tudo -> Enter. O jobs.json baixa. Suba no GitHub (Add file -> Upload files).
   ========================================================================== */
(() => {
  const MAX = 100;   // quantas corridas puxar (as mais curtidas). Aumente se quiser.

  // Lista de corridas (ajuste sort/platform/searchTerm se quiser outra):
  const API_BASE = "https://scapi.rockstargames.com/search/mission" +
    "?dateRangeCreated=any&sort=likes&platform=pcalt&title=gtav" +
    "&includeCommentCount=true&pageSize=15&searchTerm=";

  const orig = window.fetch.bind(window);
  let done = false;

  async function paginate(url, auth) {
    if (done) return; done = true;
    const H = { "accept": "*/*", "authorization": auth, "x-requested-with": "XMLHttpRequest",
                "x-cache-ver": "1", "x-lang": "en-US" };
    const all = [], seen = new Set();
    let mode = "page", pageNum = 0;   // detecta sozinho: 'page' ou 'offset'
    console.log("%c✅ Baixando as corridas…", "color:#2ecc71;font-weight:bold");
    while (all.length < MAX) {
      const u = new URL(url, location.origin);
      u.searchParams.delete("page"); u.searchParams.delete("offset");
      u.searchParams.set(mode, mode === "page" ? pageNum : all.length);
      let data;
      try {
        const r = await orig(u.toString(), { headers: H, credentials: "include" });
        if (!r.ok) { console.warn("HTTP", r.status, "— parando (token pode ter expirado)."); break; }
        data = await r.json();
      } catch (e) { console.warn("falha:", e); break; }
      const items = (data.content && data.content.items) || [];
      if (!items.length) break;
      const before = all.length;
      for (const it of items) {
        if (all.length >= MAX) break;
        if (!it.id || seen.has(it.id)) continue; seen.add(it.id);
        all.push({ id: "job_" + String(all.length + 1).padStart(3, "0"),
                   img: it.imgSrc, title: it.name || "", type: it.type || "", jobId: it.id });
      }
      const added = all.length - before;
      console.log(`${mode}=${mode === "page" ? pageNum : before}: +${added} (total ${all.length})`);
      if (added === 0) {                         // não avançou
        if (mode === "page") { mode = "offset"; continue; }   // troca a estratégia
        break;                                                // offset também parou
      }
      if (mode === "page") pageNum++;
      if (data.hasMore === false) break;
      await new Promise(r => setTimeout(r, 250));
    }
    console.log(`%c✅ ${all.length} corridas prontas`, "color:#2ecc71;font-size:14px;font-weight:bold", all);
    if (!all.length) { console.warn("Nada baixado. Me avise o que apareceu aqui."); done = false; return; }
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([JSON.stringify(all, null, 2)], { type: "application/json" }));
    a.download = "jobs.json"; a.click();
    console.log("⬇️ jobs.json baixado! Suba no GitHub (Add file -> Upload files).");
  }

  // ---- 1) tenta achar o token de sessão no navegador ----
  function b64(s) { s = s.replace(/-/g, "+").replace(/_/g, "/"); while (s.length % 4) s += "="; return atob(s); }
  function findToken() {
    const vals = [];
    try { for (let i = 0; i < localStorage.length; i++) vals.push(localStorage.getItem(localStorage.key(i))); } catch (e) {}
    try { for (let i = 0; i < sessionStorage.length; i++) vals.push(sessionStorage.getItem(sessionStorage.key(i))); } catch (e) {}
    vals.push(document.cookie);
    const re = /eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g;
    const found = [];
    for (const v of vals) { if (v) { const m = String(v).match(re); if (m) found.push(...m); } }
    for (const t of found) {
      try { const p = JSON.parse(b64(t.split(".")[1]));
        if ((p.scope && ("" + p.scope).includes("scapi")) || JSON.stringify(p.aud || "").includes("scapi")) return t;
      } catch (e) {}
    }
    return found[0] || null;
  }

  const tok = findToken();
  if (tok) {
    console.log("%c🔑 Token achado no navegador — baixando sem precisar rolar!", "color:#2ecc71;font-size:14px;font-weight:bold");
    paginate(API_BASE, "Bearer " + tok);
    return;
  }

  // ---- 2) fallback: captura a requisição da página ----
  const getAuth = (h) => { for (const k in h) { if (k.toLowerCase() === "authorization") return h[k]; } return null; };
  window.fetch = function (input, init) {
    try {
      const url = typeof input === "string" ? input : (input && input.url);
      if (url && url.includes("/search/mission")) {
        const h = {};
        if (init && init.headers) new Headers(init.headers).forEach((v, k) => h[k] = v);
        else if (input && input.headers && input.headers.forEach) input.headers.forEach((v, k) => h[k] = v);
        const a = getAuth(h); if (a) paginate(url, a);
      }
    } catch (e) {}
    return orig.apply(this, arguments);
  };
  const XO = XMLHttpRequest.prototype.open, XS = XMLHttpRequest.prototype.setRequestHeader, XSe = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (m, u) { this.__u = u; this.__h = {}; return XO.apply(this, arguments); };
  XMLHttpRequest.prototype.setRequestHeader = function (k, v) { if (this.__h) this.__h[k] = v; return XS.apply(this, arguments); };
  XMLHttpRequest.prototype.send = function () {
    try { if (this.__u && this.__u.includes("/search/mission")) { const a = getAuth(this.__h || {}); if (a) paginate(this.__u, a); } } catch (e) {}
    return XSe.apply(this, arguments);
  };
  console.log("%c🔎 Não achei o token salvo. ROLE a página pra baixo (ou mude a ordenação) pra eu capturar. Se nada acontecer, me manda o que apareceu aqui.",
              "color:#f5b942;font-size:14px;font-weight:bold");
})();
