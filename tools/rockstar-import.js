/* GTA Job Swipe — importador Rockstar (AUTO-CAPTURA o token). Cole no Console. */
(() => {
  const MAX = 100;                      // quantas corridas puxar
  const orig = window.fetch;
  if (window.__gjsHook) { console.log("Hook já ativo. Role a página."); return; }
  window.__gjsHook = true;
  console.log("%c⏳ Pronto! Agora ROLE a página pra baixo (ou mude a ordenação) pra disparar uma busca…",
              "color:#5b9dff;font-size:14px;font-weight:bold");

  window.fetch = function (input, init) {
    const u = typeof input === "string" ? input : (input && input.url);
    const res = orig.apply(this, arguments);
    if (u && u.includes("/search/mission") && !window.__gjsRan) {
      window.__gjsRan = true;
      window.fetch = orig;
      const headers = {};
      try { if (init && init.headers) new Headers(init.headers).forEach((v, k) => headers[k] = v); } catch (e) {}
      try { if (input && input.headers && input.headers.forEach) input.headers.forEach((v, k) => headers[k] = v); } catch (e) {}
      runAll(u, headers);
    }
    return res;
  };

  async function runAll(sampleUrl, headers) {
    console.log("✅ Requisição capturada. Baixando todas as páginas…");
    const url = new URL(sampleUrl), all = [], seen = new Set(); let page = 0;
    while (all.length < MAX) {
      url.searchParams.set("page", page);
      let data;
      try {
        const r = await orig(url.toString(), { headers, credentials: "include", method: "GET",
          mode: "cors", referrer: "https://socialclub.rockstargames.com/" });
        if (!r.ok) { console.warn("HTTP", r.status, "- parando"); break; }
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
      page++;
      await new Promise(r => setTimeout(r, 250));
    }
    console.log(`✅ ${all.length} corridas prontas`, all);
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([JSON.stringify(all, null, 2)], { type: "application/json" }));
    a.download = "jobs.json"; a.click();
    console.log("⬇️ jobs.json baixado!");
  }
})();
