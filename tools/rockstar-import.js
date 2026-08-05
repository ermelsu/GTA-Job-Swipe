/* ==========================================================================
   GTA Job Swipe — importador da Rockstar (roda no CONSOLE do navegador)
   --------------------------------------------------------------------------
   A API scapi exige um TOKEN de sessão (Bearer) que expira em ~5 minutos.
   Por isso o token NÃO fica salvo aqui — você cola um token fresco cada vez.

   COMO USAR:
   1. Logado em socialclub.rockstargames.com/jobs, abra F12 -> Network -> Fetch/XHR.
   2. Role a página; ache a chamada "mission?...". Botão direito -> Copiar como fetch.
   3. No texto copiado, pegue o valor de "authorization" (começa com "Bearer eyJ...")
      e cole em TOKEN abaixo. Ajuste MAX se quiser mais/menos corridas.
   4. Cole este script todo no Console e Enter. Ele baixa um jobs.json pronto.
   5. Suba o jobs.json no repositório (Add file -> Upload files), substituindo o atual.

   OBS: as imagens (imgSrc) apontam direto pro CDN da Rockstar — sem baixar nada.
   ========================================================================== */
(async () => {
  const MAX = 100;                       // quantas corridas puxar (top-curtidas)
  const TOKEN = "Bearer COLE_O_TOKEN_AQUI";

  if (TOKEN.includes("COLE_O_TOKEN")) { alert("Cole um token fresco em TOKEN (Copiar como fetch -> authorization)."); return; }

  // Troque sort/platform/searchTerm aqui se quiser outra lista.
  const base = "https://scapi.rockstargames.com/search/mission" +
    "?dateRangeCreated=any&sort=likes&platform=pcalt&title=gtav" +
    "&includeCommentCount=true&pageSize=15&searchTerm=";
  const H = { "accept": "*/*", "authorization": TOKEN, "x-requested-with": "XMLHttpRequest",
              "x-cache-ver": "1", "x-lang": "en-US" };

  const url = new URL(base), all = [], seen = new Set(); let page = 0;
  while (all.length < MAX) {
    url.searchParams.set("page", page);
    let data;
    try {
      const r = await fetch(url.toString(), { headers: H,
        referrer: "https://socialclub.rockstargames.com/", method: "GET", mode: "cors", credentials: "include" });
      if (!r.ok) { console.warn("HTTP", r.status, "- parando (token expirado? copie um fetch novo)"); break; }
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
    console.log(`página ${page}: acumulado ${all.length}/${MAX}`);
    if (!data.hasMore) break;
    page++;
    await new Promise(res => setTimeout(res, 250));
  }

  console.log(`✅ ${all.length} corridas prontas`, all);
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([JSON.stringify(all, null, 2)], { type: "application/json" }));
  a.download = "jobs.json"; a.click();
})();
