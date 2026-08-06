/* ==========================================================================
   GTA Job Swipe — importador Rockstar (cole no Console do navegador).
   --------------------------------------------------------------------------
   • Acha o token de sessão sozinho (ou capture ao rolar a página).
   • ACUMULA tudo no navegador e junta sozinho (dedup por corrida) — rode
     quantas vezes quiser; ele exporta UM jobs.json só (sem juntar arquivo).
   • Se tomar 429 (limite da Rockstar), espera e tenta de novo (backoff).

   Comandos no console:
     gjsTotal()   -> quantas corridas já tem no acúmulo
     gjsExport()  -> re-baixa o jobs.json com tudo
     gjsReset()   -> zera o acúmulo pra começar do zero

   Passou de ~240 e travou no 429? Rode de novo (mantém o que já tem). Pra
   variar além do limite de uma busca, troque sort=likes por sort=plays (ou
   ponha um searchTerm) na URL abaixo entre as rodadas — tudo junta no mesmo.
   ========================================================================== */
(() => {
  const MAX = 2000;                          // teto total acumulado
  const KEY = "gjs_import_store";
  const API_BASE = "https://scapi.rockstargames.com/search/mission" +
    "?dateRangeCreated=any&sort=likes&platform=pcalt&title=gtav" +
    "&includeCommentCount=true&pageSize=15&searchTerm=";

  const orig = window.fetch.bind(window); let running = false;
  const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; } };
  const save = (s) => localStorage.setItem(KEY, JSON.stringify(s));

  function exportAll() {
    const out = Object.values(load()).map((j, i) => ({
      id: "job_" + String(i + 1).padStart(3, "0"),
      img: j.img, title: j.title, type: j.type, desc: j.desc, rockstar: j.rockstar, jobId: j.jobId,
    }));
    if (!out.length) { console.warn("nada acumulado ainda"); return 0; }
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([JSON.stringify(out, null, 2)], { type: "application/json" }));
    a.download = "jobs.json"; a.click();
    console.log("%c⬇️ jobs.json com " + out.length + " corridas (total acumulado)", "color:#2ecc71;font-weight:bold");
    return out.length;
  }
  window.gjsExport = exportAll;
  window.gjsReset = () => { localStorage.removeItem(KEY); console.log("🗑️ acúmulo zerado"); };
  window.gjsTotal = () => Object.keys(load()).length;

  async function paginate(url, auth) {
    if (running) return; running = true;
    const H = { "accept": "*/*", "authorization": auth, "x-requested-with": "XMLHttpRequest", "x-cache-ver": "1", "x-lang": "en-US" };
    const base = new URL(url, location.origin);
    const ps = parseInt(base.searchParams.get("pageSize") || "15") || 15;
    const PARAMS = ["page", "offset", "currentPage", "pageIndex", "skip", "start", "pageNumber", "p"];
    const CANDS = [["page", c => c / ps + 1], ["offset", c => c], ["currentPage", c => c / ps], ["pageIndex", c => c / ps], ["skip", c => c], ["start", c => c], ["pageNumber", c => c / ps + 1], ["p", c => c / ps + 1]];
    const store = load(); const startCount = Object.keys(store).length; let locked = null;
    function add(items) {
      let a = 0;
      for (const it of items) {
        if (!it.id || store[it.id]) continue;
        store[it.id] = { img: it.imgSrc, title: it.name || "", type: it.type || "", desc: it.desc || "", rockstar: it.category === "rstar", jobId: it.id };
        a++;
      }
      save(store); return a;
    }
    async function F(param, val) {
      const u = new URL(base.toString()); PARAMS.forEach(k => u.searchParams.delete(k)); if (param) u.searchParams.set(param, val);
      for (let t = 0; t < 6; t++) {
        let r; try { r = await orig(u.toString(), { headers: H, credentials: "include" }); } catch (e) { return null; }
        if (r.status === 429) { const w = 1500 * Math.pow(1.8, t); console.warn("⏳ 429 — esperando " + Math.round(w / 1000) + "s e tentando de novo…"); await new Promise(x => setTimeout(x, w)); continue; }
        if (!r.ok) { console.warn("HTTP", r.status, "(token expirou? rode de novo)"); return null; }
        const d = await r.json(); return (d && d.content && d.content.items) || [];
      }
      console.warn("desisti dessa página após vários 429"); return null;
    }
    const first = await F(null, null); if (first) add(first);
    let total = Object.keys(store).length; console.log("total", total);
    while (first && total < MAX) {
      let progressed = false;
      if (locked) { const it = await F(locked[0], locked[1](total)); if (it && it.length && add(it) > 0) progressed = true; }
      else { for (const [p, fn] of CANDS) { const it = await F(p, fn(total)); if (it && it.length && add(it) > 0) { locked = [p, fn]; progressed = true; console.log("✅ paginação:", p); break; } } }
      if (!progressed) break;
      total = Object.keys(store).length; console.log("total", total);
      await new Promise(r => setTimeout(r, 500));
    }
    console.log("%c✅ +" + (total - startCount) + " novas nesta rodada · " + total + " no total", "color:#2ecc71;font-size:14px;font-weight:bold");
    exportAll(); running = false;
  }

  const getAuth = h => { for (const k in h) { if (k.toLowerCase() === "authorization") return h[k]; } return null; };
  window.fetch = function (i, n) { try { const u = typeof i === "string" ? i : (i && i.url); if (u && u.includes("/search/mission")) { const h = {}; if (n && n.headers) new Headers(n.headers).forEach((v, k) => h[k] = v); else if (i && i.headers && i.headers.forEach) i.headers.forEach((v, k) => h[k] = v); const a = getAuth(h); if (a) paginate(u, a); } } catch (e) {} return orig.apply(this, arguments); };
  const XO = XMLHttpRequest.prototype.open, XS = XMLHttpRequest.prototype.setRequestHeader, XSe = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (m, u) { this.__u = u; this.__h = {}; return XO.apply(this, arguments); };
  XMLHttpRequest.prototype.setRequestHeader = function (k, v) { if (this.__h) this.__h[k] = v; return XS.apply(this, arguments); };
  XMLHttpRequest.prototype.send = function () { try { if (this.__u && this.__u.includes("/search/mission")) { const a = getAuth(this.__h || {}); if (a) paginate(this.__u, a); } } catch (e) {} return XSe.apply(this, arguments); };
  function b64(s) { s = s.replace(/-/g, "+").replace(/_/g, "/"); while (s.length % 4) s += "="; return atob(s); }
  function findToken() {
    const v = []; try { for (let i = 0; i < localStorage.length; i++) v.push(localStorage.getItem(localStorage.key(i))); } catch (e) {}
    try { for (let i = 0; i < sessionStorage.length; i++) v.push(sessionStorage.getItem(sessionStorage.key(i))); } catch (e) {}
    v.push(document.cookie);
    const re = /eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, f = [];
    for (const x of v) { if (x) { const m = String(x).match(re); if (m) f.push(...m); } }
    for (const t of f) { try { const p = JSON.parse(b64(t.split(".")[1])); if (p.exp && p.exp * 1000 < Date.now()) continue; if ((p.scope && ("" + p.scope).includes("scapi")) || JSON.stringify(p.aud || "").includes("scapi")) return t; } catch (e) {} }
    return f[0] || null;
  }
  const tok = findToken(); if (tok) { console.log("🔑 tentando token salvo…"); paginate(API_BASE, "Bearer " + tok); }
  console.log("%c🔎 Se não baixar, ROLE a página. gjsTotal() vê o total · gjsExport() re-baixa · gjsReset() zera.", "color:#f5b942;font-size:14px;font-weight:bold");
})();
