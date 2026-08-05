/* ==========================================================================
   GTA Job Swipe — importador da Rockstar (roda no CONSOLE do navegador)
   --------------------------------------------------------------------------
   COMO USAR:
   1. Abra a página de corridas no site da Rockstar e faça os filtros que quiser.
   2. Abra o DevTools (F12) -> aba Network -> filtro Fetch/XHR.
   3. Role a página um pouco: aparece uma chamada tipo "ugc"/"search"/"mission".
      Clique com o botão direito nela -> Copy -> Copy link address (Request URL).
   4. Cole essa URL em START_URL abaixo.
   5. Cole TODO este script no console (aba Console) e tecle Enter.
   6. Ele percorre todas as páginas e BAIXA um jobs.json pronto.
   ========================================================================== */
(async () => {
  const START_URL = "COLE_A_REQUEST_URL_AQUI";   // <<<<<< cole aqui

  if (START_URL.includes("COLE_A")) { alert("Cole a Request URL em START_URL primeiro."); return; }
  const u = new URL(START_URL);
  const p = u.searchParams;
  const usePage = p.has("page") && !p.has("offset");
  let offset = parseInt(p.get("offset") ?? p.get("skip") ?? "0") || 0;
  let page   = parseInt(p.get("page") ?? "1") || 1;

  const all = [], seen = new Set();
  for (let i = 0; i < 300; i++) {                 // teto de segurança
    if (usePage) p.set("page", page); else p.set("offset", offset);
    let data;
    try {
      const r = await fetch(u.toString(), { credentials: "include", headers: { Accept: "application/json" } });
      if (!r.ok) { console.warn("parou em HTTP", r.status); break; }
      data = await r.json();
    } catch (e) { console.warn("falha de rede:", e); break; }

    const items = (data.content && data.content.items) || data.items || data.results || data.missions || [];
    if (!items.length) break;
    let added = 0;
    for (const it of items) {
      const id = it.id || it.missionId || it.contentId;
      if (!id || seen.has(id)) continue; seen.add(id);
      all.push({
        jobId: id,
        title: it.name || it.missionName || it.title || "",
        creator: (it.user && (it.user.name || it.user.username)) || it.creator || it.publishedBy || "",
        img: it.imgSrc || it.image || it.img || (it.imageUrls && it.imageUrls[0]) || ""
      });
      added++;
    }
    console.log(`página ${i + 1}: +${items.length} itens (novos ${added}) | acumulado ${all.length}`);
    if (added === 0) break;
    offset += items.length; page++;
    await new Promise(r => setTimeout(r, 350));   // educado com o servidor
  }

  const jobs = all.map((j, i) => ({
    id: `job_${String(i + 1).padStart(3, "0")}`,
    img: j.img,
    title: j.title,
    creator: j.creator,
    jobId: j.jobId
  }));
  console.log(`✅ TOTAL: ${jobs.length} corridas`, jobs);
  const blob = new Blob([JSON.stringify(jobs, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = "jobs.json"; a.click();
})();
