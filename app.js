// ===========================================================================
// GTA Job Swipe — front (vanilla JS, sem dependências)
// Abas: Deslizar (swipe) · Grade · Curtidas · Listas (playlists)
// ===========================================================================
(() => {
  "use strict";

  const CFG = window.CONFIG || {};
  const CLOUD = Boolean(CFG.SUPABASE_URL && CFG.SUPABASE_ANON_KEY);
  const ADMIN_NAME = (CFG.ADMIN_NAME || "Emerson-admin");
  const isAdmin = (n) => (n || "").trim().toLowerCase() === ADMIN_NAME.toLowerCase();
  const MAX_LIST = 16;   // máximo de corridas por playlist
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => [...document.querySelectorAll(s)];

  // ------------------------------- estado --------------------------------
  let jobs = [];
  let voter = null;                 // {id, name}
  let votes = {};                   // { jobId: 'like'|'dislike'|'skip' }
  let lists = [];                   // [{ name, jobs:[jobId,...] }]
  let theme = "classic";            // visual escolhido pela pessoa
  let pickedTheme = "classic";      // seleção provisória na tela de escolha
  const jobById = {};

  // swipe
  let queue = [], qi = 0;
  const history = [];               // [{ jobId, prev }]

  // modais
  let sheetJob = null;              // jobId aberto no sheet
  let openListIdx = -1;             // lista aberta no detalhe
  let pickerMode = false;           // detalhe da lista em modo "adicionar corridas"
  let activeListIdx = -1;           // lista "ativa" que recebe as corridas com 1 toque

  // -------------------------- localStorage keys --------------------------
  // NS = "namespace" dos dados locais. Mudar o NS = marco zero pra todo mundo:
  // os dados antigos ficam órfãos e cada pessoa recomeça do zero (re-cadastro).
  const NS = "r2";
  const K = {
    voter: `gjs_${NS}_voter`,
    votes: () => `gjs_${NS}_votes_${voter.id}`,
    lists: () => `gjs_${NS}_lists_${voter.id}`,
    seenTut: `gjs_${NS}_seen_tut`,
    retry: `gjs_${NS}_retry`,
    adminOk: `gjs_${NS}_admin_ok`,
    theme: () => `gjs_${NS}_theme_${voter.id}`,
  };
  const uid = () => "v_" + Math.random().toString(36).slice(2) + Date.now().toString(36);

  // ------------------------------ util -----------------------------------
  let toastTimer;
  function toast(msg) {
    const t = $("#toast"); t.textContent = msg; t.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(() => (t.hidden = true), 1700);
  }
  function showScreen(id) {
    $$(".screen").forEach((s) => s.classList.remove("active"));
    $("#" + id).classList.add("active");
  }
  function saveVotes() { localStorage.setItem(K.votes(), JSON.stringify(votes)); }
  function saveLists() { localStorage.setItem(K.lists(), JSON.stringify(lists)); syncLists(); }

  // ------------------------- Supabase (votos) ----------------------------
  function postVotes(payload) {
    return fetch(`${CFG.SUPABASE_URL}/rest/v1/votes`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": CFG.SUPABASE_ANON_KEY,
        "Authorization": `Bearer ${CFG.SUPABASE_ANON_KEY}`,
        "Prefer": "resolution=merge-duplicates,return=minimal",
      },
      body: JSON.stringify(payload),
    });
  }
  async function sendVote(jobId, vote) {
    if (!CLOUD) return;
    const row = { voter_id: voter.id, voter_name: voter.name, job_id: jobId, vote };
    try { const r = await postVotes(row); if (!r.ok) throw new Error(await r.text()); }
    catch (e) { console.warn("voto falhou:", e); queueRetry(row); }
  }
  function queueRetry(row) {
    const q = JSON.parse(localStorage.getItem(K.retry) || "[]");
    q.push(row); localStorage.setItem(K.retry, JSON.stringify(q));
  }
  async function flushRetry() {
    if (!CLOUD) return;
    const q = JSON.parse(localStorage.getItem(K.retry) || "[]");
    if (!q.length) return; const kept = [];
    for (const row of q) { try { const r = await postVotes(row); if (!r.ok) throw 0; } catch { kept.push(row); } }
    localStorage.setItem(K.retry, JSON.stringify(kept));
  }

  // ---------------------- Supabase (playlists) ---------------------------
  async function syncLists() {
    if (!CLOUD) return;
    try {
      await fetch(`${CFG.SUPABASE_URL}/rest/v1/playlists`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "apikey": CFG.SUPABASE_ANON_KEY,
          "Authorization": `Bearer ${CFG.SUPABASE_ANON_KEY}`,
          "Prefer": "resolution=merge-duplicates,return=minimal",
        },
        body: JSON.stringify({ voter_id: voter.id, voter_name: voter.name, data: lists }),
      });
    } catch (e) { console.warn("sync de listas falhou:", e); }
  }

  // ------------------------------ votar ----------------------------------
  function setVote(jobId, vote) {
    votes[jobId] = vote; saveVotes(); sendVote(jobId, vote);
  }

  // =======================================================================
  // TUTORIAL
  // =======================================================================
  let tut = 0;
  function renderTut() {
    const slides = $$(".tut-slide"), dots = $$(".tut-dots i");
    slides.forEach((s, i) => s.classList.toggle("active", i === tut));
    dots.forEach((d, i) => d.classList.toggle("active", i === tut));
    $("#tut-next").textContent = tut === slides.length - 1 ? "Começar" : "Próximo";
  }
  let afterTut = "picker";   // pra onde ir ao terminar o tutorial: "picker" ou "app"
  function startTutorial(mode) { afterTut = mode || "picker"; tut = 0; renderTut(); showScreen("screen-tutorial"); }
  function finishTutorial() {
    localStorage.setItem(K.seenTut, "1");
    if (afterTut === "picker") showThemePicker();   // 1ª vez: tutorial -> escolha do tema
    else enterApp();                                 // rever tutorial: volta pro app
  }

  // =======================================================================
  // TEMA (visual escolhido pela pessoa)
  // =======================================================================
  const VALID_THEMES = ["classic", "vice", "asphalt", "day"];
  function applyTheme(name) {
    if (!VALID_THEMES.includes(name)) name = "classic";
    const b = document.body;
    [...b.classList].forEach((c) => { if (c.startsWith("theme-")) b.classList.remove(c); });
    b.classList.add("theme-" + name);
  }
  function markThemeSel() {
    $$("#screen-theme .sw-card").forEach((c) => c.classList.toggle("sel", c.dataset.theme === pickedTheme));
  }
  function showThemePicker() {
    pickedTheme = VALID_THEMES.includes(theme) ? theme : "classic";
    applyTheme(pickedTheme); markThemeSel();
    showScreen("screen-theme");
  }

  // =======================================================================
  // NAVEGAÇÃO ENTRE ABAS
  // =======================================================================
  function switchView(name) {
    $$(".view").forEach((v) => v.classList.remove("active"));
    $("#view-" + name).classList.add("active");
    $$(".nav-item").forEach((b) => b.classList.toggle("active", b.dataset.view === name));
    const titles = { swipe: "", grid: "Grade", likes: "Curtidas", lists: "Listas" };
    $("#view-title").textContent = titles[name] || "";
    $("#views").scrollTop = 0;
    if (name === "swipe") { if (!queue.length || qi >= queue.length) buildQueue(); renderDeck(); }
    if (name === "grid") renderGrid();
    if (name === "lists") { openListIdx = -1; renderLists(); }
  }

  // =======================================================================
  // SWIPE
  // =======================================================================
  function buildQueue() {
    queue = jobs.filter((j) => votes[j.id] !== "like" && votes[j.id] !== "dislike");
    qi = 0; history.length = 0;
  }
  function updateProgress() {
    const decided = jobs.filter((j) => votes[j.id] === "like" || votes[j.id] === "dislike").length;
    $("#progress-fill").style.width = (decided / (jobs.length || 1) * 100) + "%";
    $("#btn-undo").disabled = history.length === 0;
  }
  function renderDeck() {
    const deck = $("#deck"); deck.innerHTML = ""; updateProgress();
    if (!jobs.length) {
      deck.innerHTML = `<div class="empty-state">🏁 As corridas estão sendo cadastradas.<br>Volte em instantes!</div>`;
      return;
    }
    if (qi >= queue.length) {
      const likeN = jobs.filter((j) => votes[j.id] === "like").length;
      deck.innerHTML =
        `<div class="empty-state">🏁 Você avaliou todas as corridas!<br>
         Curtiu <b>${likeN}</b>. Veja em <b>Curtidas</b> ou monte uma <b>Lista</b>.</div>`;
      return;
    }
    const next = queue[qi + 1];
    if (next) { const c = buildCard(next, false); c.style.transform = "scale(.96) translateY(10px)"; deck.appendChild(c); }
    const top = buildCard(queue[qi], true);
    deck.appendChild(top); enableDrag(top);
    for (let k = qi + 1; k < qi + 4 && k < queue.length; k++) { const im = new Image(); im.src = queue[k].img; }
  }
  // Nomes de tipo em pt-BR (como a galera de GTA chama cada modo).
  // P2P (ponto a ponto) é agrupado no mesmo tipo-base.
  const TYPE_PT = {
    LandRace: "Corrida de terra", AirRace: "Corrida aérea", WaterRace: "Corrida aquática",
    BikeRace: "Corrida de moto", StreetRace: "Corrida de rua", StuntRace: "Corrida acrobática",
    DragRace: "Arrancada", DriftRace: "Corrida de drift", PursuitRace: "Corrida de perseguição",
    SpecialRace: "Corrida especial", ArcadeRace: "Corrida arcade",
    Deathmatch: "Mata-mata", TeamDeathmatch: "Mata-mata em equipe",
    VehicleDeathmatch: "Mata-mata de veículos", ArenaDeathmatch: "Mata-mata na Arena",
    Capture: "Captura", LastTeamStanding: "Última equipe de pé",
    KingOfTheHill: "Rei da montanha", TeamKingOfTheHill: "Rei da montanha em equipe",
    Parachuting: "Paraquedismo", AdversaryMode: "Modo Confronto", ArenaWar: "Arena War",
    MissionCreator: "Missão",
  };
  function prettyType(t) {
    if (!t) return "";
    const base = t.replace(/P2P$/, "");
    return TYPE_PT[base] || base.replace(/([a-z])([A-Z])/g, "$1 $2").trim();
  }
  function buildCard(job, interactive) {
    const el = document.createElement("div"); el.className = "card";
    const remote = /^https?:/.test(job.img);
    const badge = job.type ? `<span class="badge-type">${escapeHTML(prettyType(job.type))}</span>` : "";
    const rock = job.rockstar ? `<span class="badge-rockstar">Criado pela Rockstar</span>` : "";
    const desc = (remote && job.desc) ? `<p class="card-desc">${escapeHTML(job.desc)}</p>` : "";
    const cap = (remote && job.title)
      ? `<div class="caption"><div class="c-title">${escapeHTML(job.title)}</div>${rock}${desc}</div>` : "";
    el.innerHTML = `
      <div class="card-media">
        ${badge}
        <div class="stamp stamp-like">CURTIU</div>
        <div class="stamp stamp-nope">PASSOU</div>
        <img src="${job.img}" alt="${job.title || job.id}" draggable="false"
             onerror="this.closest('.card').classList.add('imgfail')">
      </div>${cap}`;
    return el;
  }
  function enableDrag(card) {
    let sx = 0, sy = 0, dx = 0, dy = 0, on = false;
    const like = card.querySelector(".stamp-like"), nope = card.querySelector(".stamp-nope");
    const T = 90;
    card.addEventListener("pointerdown", (e) => { on = true; sx = e.clientX; sy = e.clientY; card.setPointerCapture(e.pointerId); card.style.transition = "none"; });
    card.addEventListener("pointermove", (e) => {
      if (!on) return; dx = e.clientX - sx; dy = e.clientY - sy;
      card.style.transform = `translate(${dx}px,${dy}px) rotate(${dx / 18}deg)`;
      like.style.opacity = dx > 20 ? Math.min(1, dx / T) : 0;
      nope.style.opacity = dx < -20 ? Math.min(1, -dx / T) : 0;
    });
    const up = () => {
      if (!on) return; on = false; card.style.transition = "transform .3s ease, opacity .3s ease";
      if (dx > T) return flyOut(card, "like");
      if (dx < -T) return flyOut(card, "dislike");
      card.style.transform = ""; like.style.opacity = nope.style.opacity = 0;
    };
    card.addEventListener("pointerup", up); card.addEventListener("pointercancel", up);
  }
  function flyOut(card, vote) {
    const dir = vote === "like" ? 1 : -1;
    card.style.transform = `translate(${dir * innerWidth}px,40px) rotate(${dir * 22}deg)`;
    card.style.opacity = "0"; commitSwipe(vote);
  }
  function commitSwipe(vote) {
    const job = queue[qi]; if (!job) return;
    history.push({ jobId: job.id, prev: votes[job.id] });
    setVote(job.id, vote); qi++;
    setTimeout(renderDeck, 180);
  }
  function buttonSwipe(vote) {
    const top = $("#deck .card:last-child"); if (!top) return;
    top.style.transition = "transform .3s ease, opacity .3s ease";
    if (vote === "skip") { top.style.opacity = "0"; commitSwipe("skip"); }
    else flyOut(top, vote);
  }
  function undoSwipe() {
    if (!history.length) return toast("Nada pra desfazer");
    const h = history.pop(); qi = Math.max(0, qi - 1);
    if (h.prev === undefined) delete votes[h.jobId]; else votes[h.jobId] = h.prev;
    saveVotes(); if (CLOUD && h.prev) sendVote(h.jobId, h.prev);
    renderDeck(); toast("Desfeito");
  }

  // =======================================================================
  // GRADE / CURTIDAS
  // =======================================================================
  function tileHTML(job) {
    const v = votes[job.id];
    const mark = v === "like" ? `<span class="mark like">♥</span>`
              : v === "dislike" ? `<span class="mark dislike">✕</span>` : "";
    const badge = job.type ? `<span class="badge-type">${escapeHTML(prettyType(job.type))}</span>` : "";
    const title = job.title ? `<div class="tile-title">${escapeHTML(job.title)}</div>` : "";
    return `<div class="tile" data-job="${job.id}">
      <div class="card-media">${badge}${mark}
        <img src="${job.img}" alt="${job.title || job.id}"
             onerror="this.style.opacity=0">
      </div>${title}</div>`;
  }
  // ---- filtros da Grade ----
  let gridFilter = { creator: "all", vote: "all", type: "all" };
  let listFilter = { creator: "all", vote: "all" };   // filtros da tela "adicionar corridas"
  let typeOptsBuilt = false;
  function buildTypeOpts() {
    if (typeOptsBuilt || !jobs.length) return; typeOptsBuilt = true;
    const set = [...new Set(jobs.map((j) => prettyType(j.type)).filter(Boolean))].sort();
    const sel = $("#f-type");
    set.forEach((t) => { const o = document.createElement("option"); o.value = t; o.textContent = t; sel.appendChild(o); });
  }
  function passesFilter(j) {
    const F = gridFilter;
    if (F.creator === "rockstar" && !j.rockstar) return false;
    if (F.creator === "community" && j.rockstar) return false;
    if (F.type !== "all" && prettyType(j.type) !== F.type) return false;
    if (F.vote === "like" && votes[j.id] !== "like") return false;
    if (F.vote === "dislike" && votes[j.id] !== "dislike") return false;
    return true;
  }
  function gcardHTML(job) {
    const remote = /^https?:/.test(job.img);
    const badge = job.type ? `<span class="badge-type">${escapeHTML(prettyType(job.type))}</span>` : "";
    const v = votes[job.id];
    const flag = v === "like" ? `<span class="vote-flag like">♥</span>`
              : v === "dislike" ? `<span class="vote-flag dislike">✕</span>` : "";
    const rock = job.rockstar ? `<span class="badge-rockstar">Criado pela Rockstar</span>` : "";
    const desc = (remote && job.desc) ? `<p class="card-desc">${escapeHTML(job.desc)}</p>` : "";
    const al = activeList();
    const inList = al && al.jobs.includes(job.id);
    const addLabel = inList ? "✓ Na lista"
      : (al && al.jobs.length < MAX_LIST) ? "＋ " + shortName(al.name)
      : "＋ Nova lista";
    return `<div class="gcard" data-job="${job.id}">
      <div class="card-media">${badge}${flag}
        <img src="${job.img}" alt="${escapeHTML(job.title || job.id)}" loading="lazy" decoding="async" onerror="this.style.opacity=0">
      </div>
      <div class="gcard-body">
        <div class="c-title">${escapeHTML(job.title || job.id)}</div>${rock}${desc}
        <div class="gcard-actions">
          <button class="ga dislike${v === "dislike" ? " on" : ""}" data-a="dislike">✕</button>
          <button class="ga like${v === "like" ? " on" : ""}" data-a="like">♥</button>
          <button class="ga add${inList ? " on" : ""}" data-a="add">${escapeHTML(addLabel)}</button>
        </div>
      </div>
    </div>`;
  }
  function renderGrid() {
    buildTypeOpts();
    const list = jobs.filter(passesFilter);
    const el = $("#grid-all");
    el.innerHTML = list.length ? list.map(gcardHTML).join("")
      : `<p class="empty-state">Nenhuma corrida com esses filtros.</p>`;
    el.querySelectorAll(".gcard").forEach((c) => {
      const id = c.dataset.job;
      c.querySelector(".card-media").onclick = () => openSheet(id);
      c.querySelectorAll(".ga").forEach((btn) => btn.onclick = () => {
        const a = btn.dataset.a;
        if (a === "add") return quickAdd(id);
        gridToggleVote(id, a);
      });
    });
  }
  function gridToggleVote(jobId, vote) {
    const v = votes[jobId] === vote ? undefined : vote;
    if (v === undefined) { delete votes[jobId]; saveVotes(); }
    else setVote(jobId, vote);
    renderGrid();
    toast(v === "like" ? "Curtida ♥" : v === "dislike" ? "Passou ✕" : "Voto removido");
  }

  // =======================================================================
  // SHEET (ação sobre uma corrida)
  // =======================================================================
  function openSheet(jobId) {
    sheetJob = jobId; const job = jobById[jobId];
    $("#sheet-img").src = job.img;
    $("#sheet-title").innerHTML = `<div class="c-title">${escapeHTML(job.title || "")}` +
      (job.type ? ` <small style="color:var(--muted);font-weight:600">· ${escapeHTML(prettyType(job.type))}</small>` : "") + `</div>` +
      (job.rockstar ? `<span class="badge-rockstar">Criado pela Rockstar</span>` : "") +
      (job.desc ? `<p class="card-desc" style="-webkit-line-clamp:5">${escapeHTML(job.desc)}</p>` : "");
    refreshSheet(); $("#sheet").hidden = false;
  }
  function refreshSheet() {
    const v = votes[sheetJob];
    $("#sheet-like").classList.toggle("on", v === "like");
    $("#sheet-dislike").classList.toggle("on", v === "dislike");
    const al = activeList();
    $("#sheet-addlist").classList.toggle("on", !!(al && sheetJob && al.jobs.includes(sheetJob)));
  }
  function closeSheet() { $("#sheet").hidden = true; sheetJob = null; }
  function sheetVote(vote) {
    const v = votes[sheetJob] === vote ? undefined : vote;  // toca de novo = tira o voto
    if (v === undefined) { delete votes[sheetJob]; saveVotes(); }
    else setVote(sheetJob, v);
    refreshSheet(); refreshVisibleGrids();
    toast(v === "like" ? "Curtida ♥" : v === "dislike" ? "Passou ✕" : "Voto removido");
  }
  function refreshVisibleGrids() {
    if ($("#view-grid").classList.contains("active")) renderGrid();
    if ($("#view-lists").classList.contains("active") && openListIdx >= 0) renderListDetail();
  }

  // =======================================================================
  // LISTAS (playlists)
  // =======================================================================
  function renderLists() {
    $("#list-detail").hidden = true; $("#lists-home").hidden = false;
    $("#lists-empty").hidden = lists.length > 0;
    const box = $("#lists-container");
    box.innerHTML = lists.map((l, i) => {
      const thumbs = l.jobs.slice(0, 3).map((id) =>
        jobById[id] ? `<img src="${jobById[id].img}">` : "").join("");
      return `<div class="listcard" data-i="${i}">
        <div class="lc-thumbs">${thumbs || '<img style="opacity:.3" src="">'}</div>
        <div class="lc-info"><b>${escapeHTML(l.name)}</b><small>${l.jobs.length} corrida(s)</small></div>
        <span class="chev">›</span></div>`;
    }).join("");
    $$("#lists-container .listcard").forEach((c) => c.onclick = () => openList(+c.dataset.i));
  }
  function openList(i) {
    openListIdx = i; activeListIdx = i; pickerMode = false;   // abrir = vira a lista ativa
    $("#lists-home").hidden = true; $("#list-detail").hidden = false;
    renderListDetail();
  }
  function passesListFilter(j) {
    const F = listFilter;
    if (F.creator === "rockstar" && !j.rockstar) return false;
    if (F.creator === "community" && j.rockstar) return false;
    if (F.vote === "like" && votes[j.id] !== "like") return false;
    if (F.vote === "dislike" && votes[j.id] !== "dislike") return false;
    return true;
  }
  function pickTileHTML(j, on) {
    const v = votes[j.id];
    const mark = v === "like" ? `<span class="mark like">♥</span>`
              : v === "dislike" ? `<span class="mark dislike">✕</span>` : "";
    const flag = j.rockstar ? `<span class="tile-flag rockstar">R★</span>`
                            : `<span class="tile-flag community">Comum</span>`;
    return `<div class="tile${on}" data-job="${j.id}">
      <div class="card-media">${mark}${flag}
        <img src="${j.img}" loading="lazy" onerror="this.style.opacity=0"></div>
      <div class="tile-title">${escapeHTML(j.title || j.id)}</div>
    </div>`;
  }
  function renderListDetail() {
    const l = lists[openListIdx]; if (!l) return renderLists();
    $("#list-detail-name").textContent = l.name;
    $("#btn-add-to-list").textContent = pickerMode ? `✓ Concluir (${l.jobs.length}/${MAX_LIST})` : "＋ Adicionar corridas";
    $("#list-filters").hidden = !pickerMode;
    const grid = $("#list-detail-grid");
    if (pickerMode) {
      $("#list-detail-empty").hidden = true;
      const view = jobs.filter(passesListFilter);
      grid.innerHTML = view.length
        ? view.map((j) => pickTileHTML(j, l.jobs.includes(j.id) ? " picked" : "")).join("")
        : `<p class="empty-state">Nenhuma corrida com esses filtros.</p>`;
      $$("#list-detail-grid .tile").forEach((t) => t.onclick = () => toggleInList(t.dataset.job));
    } else {
      $("#list-detail-empty").hidden = l.jobs.length > 0;
      grid.innerHTML = l.jobs.map((id) => jobById[id]
        ? pickTileHTML(jobById[id], "") : "").join("");
      $$("#list-detail-grid .tile").forEach((t) => t.onclick = () => {
        removeFromList(t.dataset.job); toast("Removida da lista");
      });
    }
  }
  function toggleInList(jobId) {
    const l = lists[openListIdx]; const at = l.jobs.indexOf(jobId);
    if (at >= 0) l.jobs.splice(at, 1);
    else { if (l.jobs.length >= MAX_LIST) return toast(`Máximo de ${MAX_LIST} corridas por lista`); l.jobs.push(jobId); }
    saveLists(); renderListDetail();
  }
  function removeFromList(jobId) {
    const l = lists[openListIdx]; l.jobs = l.jobs.filter((x) => x !== jobId);
    saveLists(); renderListDetail();
  }
  function createList(name) {
    name = (name || "").trim(); if (!name) return -1;
    lists.push({ name, jobs: [] }); activeListIdx = lists.length - 1;
    saveLists(); return activeListIdx;
  }
  function activeList() {
    return (activeListIdx >= 0 && activeListIdx < lists.length) ? lists[activeListIdx] : null;
  }
  function shortName(s) { s = String(s); return s.length > 12 ? s.slice(0, 11) + "…" : s; }

  // ------ 1 toque: joga a corrida direto na LISTA ATIVA ------
  // Sem lista (ou a atual cheia com 16), pede o nome de uma nova e passa a usar
  // essa. Tocar de novo na mesma corrida remove. Trocar a lista ativa: é só
  // abrir a lista desejada na aba Listas.
  function quickAdd(jobId) {
    let l = activeList();
    if (l && l.jobs.includes(jobId)) {                  // já está -> remove
      l.jobs = l.jobs.filter((x) => x !== jobId);
      saveLists(); refreshVisibleGrids(); refreshSheet();
      return toast(`Removida de "${l.name}"`);
    }
    if (!l || l.jobs.length >= MAX_LIST) {               // sem lista, ou encheu
      const full = l && l.jobs.length >= MAX_LIST;
      const msg = full
        ? `"${l.name}" já tem ${MAX_LIST} corridas 🎉\nCrie a próxima lista:`
        : "Crie uma lista pra ir juntando as corridas:";
      const idx = createList(prompt(msg, full ? "" : "Minha playlist"));
      if (idx < 0) return;                               // cancelou
      l = lists[idx];
    }
    l.jobs.push(jobId);
    saveLists(); refreshVisibleGrids(); refreshSheet();
    toast(`Adicionada em "${l.name}" · ${l.jobs.length}/${MAX_LIST}`);
  }

  function escapeHTML(s) { return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }

  // =======================================================================
  // BOOT
  // =======================================================================
  async function loadJobs() {
    const r = await fetch("jobs.json", { cache: "no-store" });
    if (!r.ok) throw new Error("jobs.json não encontrado");
    const data = await r.json();
    jobs = Array.isArray(data) ? data : [];
    jobs.forEach((j) => (jobById[j.id] = j));
    // ordem ALEATÓRIA a cada acesso (item 4)
    for (let i = jobs.length - 1; i > 0; i--) {
      const k = Math.floor(Math.random() * (i + 1));
      [jobs[i], jobs[k]] = [jobs[k], jobs[i]];
    }
  }
  function loadLocal() {
    try { votes = JSON.parse(localStorage.getItem(K.votes())) || {}; } catch { votes = {}; }
    try { lists = JSON.parse(localStorage.getItem(K.lists())) || []; } catch { lists = []; }
    activeListIdx = lists.length - 1;   // segue na última lista criada
    theme = localStorage.getItem(K.theme()) || "classic";
  }
  function avatarColor(s) {
    let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0;
    return `hsl(${h % 360} 62% 46%)`;
  }
  function setAvatar(name) {
    const a = $("#avatar");
    a.textContent = (name.trim()[0] || "?").toUpperCase();
    a.style.background = avatarColor(name || "?");
  }
  async function enterApp() {
    applyTheme(theme);
    if (!jobs.length) { try { await loadJobs(); } catch (err) { console.warn(err); } }
    setAvatar(voter.name);
    $("#greeting").textContent = `Oi, ${voter.name}`;
    const admin = isAdmin(voter.name);
    $("#btn-admin").hidden = !admin;   // só mostra o atalho; o painel pede login+senha
    showScreen("screen-app"); switchView("swipe"); flushRetry();
    // reenvia pro Supabase as listas que ficaram só no aparelho
    // (ex.: criadas antes da tabela playlists existir)
    if (CLOUD && lists.length) syncLists();
  }
  function logout() {
    if (!confirm("Sair? Seus votos e listas ficam salvos.")) return;
    $("#name-input").value = voter.name;
    showScreen("screen-login");
  }

  function bind() {
    // login
    $("#login-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const name = $("#name-input").value.trim(); if (!name) return;
      let saved = null; try { saved = JSON.parse(localStorage.getItem(K.voter)); } catch {}
      // mesmo nome no mesmo aparelho = mesma pessoa (recupera dados); nome
      // diferente = novo votante (útil se emprestar o celular)
      const id = (saved && saved.name === name && saved.id) ? saved.id : uid();
      voter = { id, name };
      localStorage.setItem(K.voter, JSON.stringify(voter));
      loadLocal();
      // PRIMEIRO ACESSO desta pessoa: joga o tutorial na cara na hora.
      // As corridas carregam em paralelo (não travam o tutorial).
      if (!localStorage.getItem(K.seenTut)) {
        startTutorial();
        loadJobs().catch((err) => console.warn(err));
      } else {
        enterApp();
      }
    });

    // tutorial
    $("#tut-next").onclick = () => { if (tut < 2) { tut++; renderTut(); } else finishTutorial(); };
    $("#tut-skip").onclick = finishTutorial;
    $("#btn-config").onclick = () => { $("#settings").hidden = false; };
    $("#set-tutorial").onclick = () => { $("#settings").hidden = true; startTutorial("app"); };
    $("#set-theme").onclick = () => { $("#settings").hidden = true; showThemePicker(); };
    $("#settings").querySelectorAll("[data-close]").forEach((el) => el.onclick = () => $("#settings").hidden = true);
    $("#btn-logout").onclick = logout;

    // escolha de tema (depois do tutorial)
    $$("#screen-theme .sw-card").forEach((c) => c.onclick = () => {
      pickedTheme = c.dataset.theme; markThemeSel(); applyTheme(pickedTheme);
    });
    $("#theme-confirm").onclick = () => {
      theme = pickedTheme; localStorage.setItem(K.theme(), theme); enterApp();
    };

    // nav
    $$(".nav-item").forEach((b) => b.onclick = () => switchView(b.dataset.view));

    // filtros da Grade
    ["f-creator", "f-vote"].forEach((id) => {
      const key = id === "f-creator" ? "creator" : "vote";
      $$("#" + id + " button").forEach((b) => b.onclick = () => {
        $$("#" + id + " button").forEach((x) => x.classList.remove("on"));
        b.classList.add("on"); gridFilter[key] = b.dataset.v; renderGrid();
      });
    });
    $("#f-type").onchange = (e) => { gridFilter.type = e.target.value; renderGrid(); };

    // filtros da tela "adicionar corridas" (dentro de uma lista)
    ["lf-creator", "lf-vote"].forEach((id) => {
      const key = id === "lf-creator" ? "creator" : "vote";
      $$("#" + id + " button").forEach((b) => b.onclick = () => {
        $$("#" + id + " button").forEach((x) => x.classList.remove("on"));
        b.classList.add("on"); listFilter[key] = b.dataset.v; renderListDetail();
      });
    });

    // swipe
    $("#btn-like").onclick = () => buttonSwipe("like");
    $("#btn-dislike").onclick = () => buttonSwipe("dislike");
    $("#btn-skip").onclick = () => buttonSwipe("skip");
    $("#btn-undo").onclick = undoSwipe;
    document.addEventListener("keydown", (e) => {
      if (!$("#view-swipe").classList.contains("active") || !$("#screen-app").classList.contains("active")) return;
      if (e.target.tagName === "INPUT") return;
      if (e.key === "ArrowRight") buttonSwipe("like");
      else if (e.key === "ArrowLeft") buttonSwipe("dislike");
      else if (e.key === "ArrowUp") buttonSwipe("skip");
      else if (e.key === "Backspace") undoSwipe();
    });

    // sheet
    $("#sheet-like").onclick = () => sheetVote("like");
    $("#sheet-dislike").onclick = () => sheetVote("dislike");
    $("#sheet-addlist").onclick = () => { if (sheetJob) quickAdd(sheetJob); };
    $("#sheet").querySelectorAll("[data-close]").forEach((el) => el.onclick = closeSheet);

    // listas
    $("#btn-newlist").onclick = () => {
      const name = prompt("Nome da nova lista:"); const i = createList(name);
      if (i >= 0) { renderLists(); openList(i); }
    };
    $("#btn-back-lists").onclick = () => { openListIdx = -1; renderLists(); };
    $("#btn-add-to-list").onclick = () => { pickerMode = !pickerMode; renderListDetail(); };
    $("#btn-del-list").onclick = () => {
      if (!confirm(`Apagar a lista "${lists[openListIdx].name}"?`)) return;
      lists.splice(openListIdx, 1); saveLists();
      openListIdx = -1; activeListIdx = lists.length - 1; renderLists();
    };
  }

  function init() {
    if (!CLOUD) $("#demo-badge").hidden = false;
    try { const s = JSON.parse(localStorage.getItem(K.voter)); if (s && s.name) $("#name-input").value = s.name; } catch {}
    bind();
  }
  init();
})();
