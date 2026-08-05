/* ==========================================================================
   GTA Job Swipe — importador Rockstar (AUTO-CAPTURA o token). Cole no Console.
   --------------------------------------------------------------------------
   Não precisa colar token nenhum. O script "escuta" a própria requisição que a
   página faz (fetch OU XHR), reaproveita os cabeçalhos reais (token válido) e
   pagina sozinho, baixando um jobs.json pronto.

   USO:
   1. Logado em socialclub.rockstargames.com/jobs (com os filtros que quiser).
   2. F12 -> Console -> cole este script todo -> Enter.
   3. ROLE a página pra baixo (ou mude a ordenação) pra disparar uma busca.
   4. O jobs.json baixa sozinho. Suba no GitHub (Add file -> Upload files).
   ========================================================================== */
(() => {
  const MAX = 100;  // quantas corridas puxar (as mais curtidas primeiro). Aumente se quiser.

  const orig = window.fetch.bind(window);
  let done = false;
  const STRIP = ["host","content-length","cookie","origin","referer","referrer",
    "user-agent","connection","accept-encoding","sec-fetch-dest","sec-fetch-mode",
    "sec-fetch-site","sec-ch-ua","sec-ch-ua-mobile","sec-ch-ua-platform"];

  function go(url, headers) {
    if (done) return; done = true;
    (async () => {
      const u = new URL(url, location.origin);
      const H = {}; Object.keys(headers || {}).forEach(k => { if (!STRIP.includes(k.toLowerCase())) H[k] = headers[k]; });
      const all = [], seen = new Set(); let page = 0;
      console.log("%c✅ Requisição capturada! Baixando páginas…", "color:#2ecc71;font-weight:bold");
      while (all.length < MAX) {
        u.searchParams.set("page", page);
        let data;
        try {
          const r = await orig(u.toString(), { headers: H, credentials: "include" });
          if (!r.ok) { console.warn("HTTP", r.status, "— parando"); break; }
          data = await r.json();
        } catch (e) { console.warn("falha:", e); break; }
        const items = (data.content && data.content.items) || [];
        if (!items.length) break;
        for (const it of items) {
          if (all.length >= MAX) break;
          if (!it.id || seen.has(it.id)) continue; seen.add(it.id);
          all.push({ id: "job_" + String(all.length + 1).padStart(3, "0"),
                     img: it.imgSrc, title: it.name || "", type: it.type || "", jobId: it.id });
        }
        console.log(`página ${page}: ${all.length}/${MAX}`);
        if (!data.hasMore) break;
        page++; await new Promise(r => setTimeout(r, 250));
      }
      console.log(`%c✅ ${all.length} corridas prontas`, "color:#2ecc71;font-size:14px;font-weight:bold", all);
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([JSON.stringify(all, null, 2)], { type: "application/json" }));
      a.download = "jobs.json"; a.click();
      console.log("⬇️ jobs.json baixado! Suba no GitHub (Add file -> Upload files).");
    })();
  }

  // hook do fetch
  window.fetch = function (input, init) {
    try {
      const url = typeof input === "string" ? input : (input && input.url);
      if (url && url.includes("/search/mission")) {
        const h = {};
        if (init && init.headers) new Headers(init.headers).forEach((v, k) => h[k] = v);
        else if (input && input.headers && input.headers.forEach) input.headers.forEach((v, k) => h[k] = v);
        if (h.authorization) go(url, h);
      }
    } catch (e) {}
    return orig.apply(this, arguments);
  };

  // hook do XMLHttpRequest (caso a página use XHR/axios)
  const XO = XMLHttpRequest.prototype.open, XS = XMLHttpRequest.prototype.setRequestHeader, XSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (m, u) { this.__u = u; this.__h = {}; return XO.apply(this, arguments); };
  XMLHttpRequest.prototype.setRequestHeader = function (k, v) { if (this.__h) this.__h[k] = v; return XS.apply(this, arguments); };
  XMLHttpRequest.prototype.send = function () {
    try { if (this.__u && this.__u.includes("/search/mission") && this.__h && this.__h.authorization) go(this.__u, this.__h); } catch (e) {}
    return XSend.apply(this, arguments);
  };

  console.log("%c✅ Coletor ligado! Agora ROLE a página pra baixo (ou mude a ordenação) pra disparar uma busca. O jobs.json baixa sozinho.",
              "color:#5b9dff;font-size:14px;font-weight:bold");
})();
