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
    const base = new URL(url, location.origin);
    const ps = parseInt(base.searchParams.get("pageSize") || "15") || 15;
    const PARAMS = ["page", "offset", "currentPage", "pageIndex", "skip", "start", "pageNumber", "p"];
    // cada candidato: dado o total já coletado (c), qual valor mandar
    const CANDS = [
      ["page",       c => c / ps + 1],   // page 1-indexado: 2,3,...
      ["offset",     c => c],            // offset: 15,30,...
      ["currentPage",c => c / ps],       // 0-indexado: 1,2,...
      ["pageIndex",  c => c / ps],
      ["skip",       c => c],
      ["start",      c => c],
      ["pageNumber", c => c / ps + 1],
      ["p",          c => c / ps + 1],
    ];
    const all = [], seen = new Set();
    let locked = null;
    console.log("%c✅ Baixando as corridas…", "color:#2ecc71;font-weight:bold");

    async function fetchItems(param, val) {
      const u = new URL(base.toString());
      PARAMS.forEach(k => u.searchParams.delete(k));
      if (param) u.searchParams.set(param, val);
      let r; try { r = await orig(u.toString(), { headers: H, credentials: "include" }); }
      catch (e) { console.warn("falha:", e); return null; }
      if (!r.ok) { console.warn("HTTP", r.status); return null; }
      const d = await r.json();
      return (d && d.content && d.content.items) || [];
    }
    function addNew(items) {
      let added = 0;
      for (const it of items) {
        if (all.length >= MAX) break;
        if (!it.id || seen.has(it.id)) continue; seen.add(it.id); added++;
        all.push({ id: "job_" + String(all.length + 1).padStart(3, "0"),
                   img: it.imgSrc, title: it.name || "", type: it.type || "", jobId: it.id });
      }
      return added;
    }

    // 1ª página (URL como veio)
    const first = await fetchItems(null, null);
    if (!first) { done = false; return; }
    addNew(first);
    console.log(`1ª página: ${all.length}`);

    while (all.length < MAX && first.length) {
      let added = 0;
      if (locked) {
        const items = await fetchItems(locked[0], locked[1](all.length));
        if (!items || !items.length) break;
        added = addNew(items);
        if (added === 0) break;
      } else {
        let ok = false;
        for (const [param, fn] of CANDS) {                 // descobre qual paginação avança
          const items = await fetchItems(param, fn(all.length));
          if (items && items.length && addNew(items) > 0) {
            locked = [param, fn]; ok = true;
            console.log(`✅ paginação detectada: ${param}`);
            break;
          }
        }
        if (!ok) { console.warn("Não achei o parâmetro de paginação — ficando com", all.length); break; }
      }
      console.log(`total ${all.length}`);
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
