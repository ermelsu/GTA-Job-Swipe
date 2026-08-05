/* ==========================================================================
   GTA Job Swipe — importador da Rockstar (roda no CONSOLE do navegador)
   --------------------------------------------------------------------------
   COMO USAR:
   1. Faça login e abra a lista de corridas em socialclub.rockstargames.com/jobs
      (aplique os filtros/ordenação que quiser — ele respeita os mesmos).
   2. Abra o Console (F12 -> Console).
   3. (opcional) Ajuste MAX abaixo = quantas corridas puxar (as mais curtidas
      primeiro). Se quiser outra ordenação/plataforma, troque a URL.
   4. Cole TODO este script e tecle Enter. Ele percorre as páginas e BAIXA um
      jobs.json pronto (imagens apontando direto pro CDN da Rockstar).
   5. Suba esse jobs.json no repositório (Add file -> Upload files).

   Se der erro 401/403: no Network, botão direito no "mission?..." ->
   "Copiar como fetch" e me manda — eu embuto os cabeçalhos certos.
   ========================================================================== */
(async () => {
  const MAX = 100;   // <<< quantas corridas puxar (top-curtidas). Aumente se quiser.

  const START_URL = "https://scapi.rockstargames.com/search/mission" +
    "?dateRangeCreated=any&sort=likes&platform=pcalt&title=gtav" +
    "&includeCommentCount=true&pageSize=30&searchTerm=";

  const url = new URL(START_URL);
  const all = [], seen = new Set();
  let page = 0;

  while (all.length < MAX) {
    url.searchParams.set("page", page);
    let data;
    try {
      const r = await fetch(url.toString(), {
        credentials: "include",
        headers: { "Accept": "application/json", "X-Requested-With": "XMLHttpRequest" }
      });
      if (!r.ok) { console.warn("HTTP", r.status, "— parando. Use 'Copiar como fetch' se for 401/403."); break; }
      data = await r.json();
    } catch (e) { console.warn("falha de rede:", e); break; }

    const items = (data.content && data.content.items) || [];
    if (!items.length) break;

    for (const it of items) {
      if (all.length >= MAX) break;
      if (!it.id || seen.has(it.id)) continue;
      seen.add(it.id);
      all.push({
        id: "job_" + String(all.length + 1).padStart(3, "0"),
        img: it.imgSrc,
        title: it.name || "",
        type: it.type || "",
        jobId: it.id
      });
    }
    console.log(`página ${page}: acumulado ${all.length}/${MAX}`);
    if (!data.hasMore) break;
    page++;
    await new Promise(res => setTimeout(res, 300));   // educado com o servidor
  }

  console.log(`✅ ${all.length} corridas prontas`, all);
  const blob = new Blob([JSON.stringify(all, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = "jobs.json"; a.click();
})();
