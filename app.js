// ===========================================================================
// GTA Job Swipe — front (vanilla JS, sem dependências)
// Abas: Deslizar (swipe) · Grade · Curtidas · Listas (playlists)
// ===========================================================================
(() => {
  "use strict";

  const CFG = window.CONFIG || {};
  const CLOUD = Boolean(CFG.SUPABASE_URL && CFG.SUPABASE_ANON_KEY);
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => [...document.querySelectorAll(s)];

  // ------------------------------- estado --------------------------------
  let jobs = [];
  let voter = null;                 // {id, name}
  let votes = {};                   // { jobId: 'like'|'dislike'|'skip' }
  let lists = [];                   // [{ name, jobs:[jobId,...] }]
  const jobById = {};

  // swipe
  let queue = [], qi = 0;
  const history = [];               // [{ jobId, prev }]

  // modais
  let sheetJob = null;              // jobId aberto no sheet
  let pickJob = null;               // jobId alvo do "adicionar a lista"
  let openListIdx = -1;             // lista aberta no detalhe
  let pickerMode = false;           // detalhe da lista em modo "adicionar corridas"

  // -------------------------- localStorage keys --------------------------
  const K = {
    voter: "gjs_voter",
    votes: () => "gjs_votes_" + voter.id,
    lists: () => "gjs_lists_" + voter.id,
    seenTut: "gjs_seen_tut",
    retry: "gjs_retry",
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
  function startTutorial() { tut = 0; renderTut(); showScreen("screen-tutorial"); }
  function finishTutorial() {
    localStorage.setItem(K.seenTut, "1");
    enterApp();
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
    if (name === "likes") renderLikes();
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
    $("#progress-text").textContent = `${decided} / ${jobs.length}`;
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
  function buildCard(job, interactive) {
    const el = document.createElement("div"); el.className = "card";
    const pos = jobs.indexOf(job) + 1;
    el.innerHTML = `
      <span class="idx">${pos} / ${jobs.length}</span>
      <div class="stamp stamp-like">CURTIU</div>
      <div class="stamp stamp-nope">PASSOU</div>
      <img src="${job.img}" alt="${job.title || job.id}" draggable="false"
           onerror="this.parentElement.classList.add('imgfail')">`;
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
    return `<div class="tile" data-job="${job.id}">${mark}
      <img src="${job.img}" alt="${job.title || job.id}"
           onerror="this.style.aspectRatio='16/9';this.style.background='#26333f'"></div>`;
  }
  function renderGrid() {
    $("#grid-all").innerHTML = jobs.map(tileHTML).join("");
    $$("#grid-all .tile").forEach((t) => t.onclick = () => openSheet(t.dataset.job));
  }
  function renderLikes() {
    const liked = jobs.filter((j) => votes[j.id] === "like");
    $("#likes-empty").hidden = liked.length > 0;
    $("#grid-likes").innerHTML = liked.map(tileHTML).join("");
    $$("#grid-likes .tile").forEach((t) => t.onclick = () => openSheet(t.dataset.job));
  }

  // =======================================================================
  // SHEET (ação sobre uma corrida)
  // =======================================================================
  function openSheet(jobId) {
    sheetJob = jobId; const job = jobById[jobId];
    $("#sheet-img").src = job.img;
    refreshSheet(); $("#sheet").hidden = false;
  }
  function refreshSheet() {
    const v = votes[sheetJob];
    $("#sheet-like").classList.toggle("on", v === "like");
    $("#sheet-dislike").classList.toggle("on", v === "dislike");
  }
  function closeSheet() { $("#sheet").hidden = true; sheetJob = null; }
  function sheetVote(vote) {
    const v = votes[sheetJob] === vote ? undefined : vote;  // toca de novo = tira o voto
    if (v === undefined) { delete votes[sheetJob]; saveVotes(); }
    else setVote(sheetJob, v);
    refreshSheet(); refreshVisibleGrids();
    toast(v === "like" ? "Curtida 👍" : v === "dislike" ? "Passou 👎" : "Voto removido");
  }
  function refreshVisibleGrids() {
    if ($("#view-grid").classList.contains("active")) renderGrid();
    if ($("#view-likes").classList.contains("active")) renderLikes();
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
    openListIdx = i; pickerMode = false;
    $("#lists-home").hidden = true; $("#list-detail").hidden = false;
    renderListDetail();
  }
  function renderListDetail() {
    const l = lists[openListIdx]; if (!l) return renderLists();
    $("#list-detail-name").textContent = l.name;
    $("#btn-add-to-list").textContent = pickerMode ? "✓ Concluir" : "＋ Adicionar corridas";
    const grid = $("#list-detail-grid");
    if (pickerMode) {
      $("#list-detail-empty").hidden = true;
      grid.innerHTML = jobs.map((j) => {
        const on = l.jobs.includes(j.id) ? " picked" : "";
        return `<div class="tile${on}" data-job="${j.id}"><img src="${j.img}"></div>`;
      }).join("");
      $$("#list-detail-grid .tile").forEach((t) => t.onclick = () => toggleInList(t.dataset.job));
    } else {
      $("#list-detail-empty").hidden = l.jobs.length > 0;
      grid.innerHTML = l.jobs.map((id) => jobById[id] ? `
        <div class="tile" data-job="${id}"><span class="mark dislike">✕</span>
          <img src="${jobById[id].img}"></div>` : "").join("");
      $$("#list-detail-grid .tile").forEach((t) => t.onclick = () => {
        removeFromList(t.dataset.job); toast("Removida da lista");
      });
    }
  }
  function toggleInList(jobId) {
    const l = lists[openListIdx]; const at = l.jobs.indexOf(jobId);
    if (at >= 0) l.jobs.splice(at, 1); else l.jobs.push(jobId);
    saveLists(); renderListDetail();
  }
  function removeFromList(jobId) {
    const l = lists[openListIdx]; l.jobs = l.jobs.filter((x) => x !== jobId);
    saveLists(); renderListDetail();
  }
  function createList(name) {
    name = (name || "").trim(); if (!name) return -1;
    lists.push({ name, jobs: [] }); saveLists(); return lists.length - 1;
  }

  // ------ modal: escolher lista pra adicionar uma corrida ------
  function openPick(jobId) {
    pickJob = jobId; renderPick(); $("#pickmodal").hidden = false;
  }
  function renderPick() {
    $("#pick-lists").innerHTML = lists.length ? lists.map((l, i) => {
      const on = l.jobs.includes(pickJob) ? " on" : "";
      return `<div class="pick-row${on}" data-i="${i}">
        <b>${escapeHTML(l.name)}</b><small style="color:var(--muted)">&nbsp;· ${l.jobs.length}</small>
        <span class="tick">✓</span></div>`;
    }).join("") : `<p style="color:var(--muted);text-align:center">Nenhuma lista. Crie uma abaixo 👇</p>`;
    $$("#pick-lists .pick-row").forEach((r) => r.onclick = () => {
      const l = lists[+r.dataset.i]; const at = l.jobs.indexOf(pickJob);
      if (at >= 0) l.jobs.splice(at, 1); else l.jobs.push(pickJob);
      saveLists(); renderPick();
    });
  }
  function closePick() { $("#pickmodal").hidden = true; pickJob = null; }

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
  }
  function loadLocal() {
    try { votes = JSON.parse(localStorage.getItem(K.votes())) || {}; } catch { votes = {}; }
    try { lists = JSON.parse(localStorage.getItem(K.lists())) || []; } catch { lists = []; }
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
    if (!jobs.length) { try { await loadJobs(); } catch (err) { console.warn(err); } }
    setAvatar(voter.name);
    $("#greeting").textContent = `Oi, ${voter.name}`;
    showScreen("screen-app"); switchView("swipe"); flushRetry();
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
    $("#btn-help").onclick = startTutorial;
    $("#btn-logout").onclick = logout;

    // nav
    $$(".nav-item").forEach((b) => b.onclick = () => switchView(b.dataset.view));

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
    $("#sheet-addlist").onclick = () => { if (sheetJob) openPick(sheetJob); };
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
      lists.splice(openListIdx, 1); saveLists(); openListIdx = -1; renderLists();
    };

    // pick modal
    $("#pick-newform").addEventListener("submit", (e) => {
      e.preventDefault(); const name = $("#pick-newname").value;
      const i = createList(name); if (i >= 0) { $("#pick-newname").value = ""; renderPick(); }
    });
    $("#pickmodal").querySelectorAll("[data-close]").forEach((el) => el.onclick = closePick);
  }

  function init() {
    if (!CLOUD) $("#demo-badge").hidden = false;
    try { const s = JSON.parse(localStorage.getItem(K.voter)); if (s && s.name) $("#name-input").value = s.name; } catch {}
    bind();
  }
  init();
})();
