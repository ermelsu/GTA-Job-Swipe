// ===========================================================================
// GTA Job Swipe — lógica do front (vanilla JS, sem dependências)
// ===========================================================================
(() => {
  "use strict";

  const CFG = window.CONFIG || {};
  const CLOUD = Boolean(CFG.SUPABASE_URL && CFG.SUPABASE_ANON_KEY);

  // ---- estado ----
  let jobs = [];            // [{id, img, title}]
  let cursor = 0;           // índice da próxima corrida
  let voter = null;         // {id, name}
  const history = [];       // pilha de {index, vote} pra desfazer
  let likeCount = 0;

  // ---- refs de DOM ----
  const $ = (s) => document.querySelector(s);
  const screens = {
    login: $("#screen-login"),
    swipe: $("#screen-swipe"),
    done:  $("#screen-done"),
  };
  const deck = $("#deck");

  // ------------------------------------------------------------------ util
  const LS = {
    voter:    "gjs_voter",
    progress: (id) => `gjs_progress_${id}`,
    vote:     (id, job) => `gjs_vote_${id}_${job}`,
  };

  function uid() {
    return "v_" + Math.random().toString(36).slice(2) + Date.now().toString(36);
  }

  function show(name) {
    Object.values(screens).forEach((s) => s.classList.remove("active"));
    screens[name].classList.add("active");
  }

  let toastTimer;
  function toast(msg) {
    const t = $("#toast");
    t.textContent = msg; t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (t.hidden = true), 1800);
  }

  // --------------------------------------------------------------- Supabase
  async function sendVote(jobId, vote) {
    // guarda local sempre (funciona offline / modo demo)
    localStorage.setItem(LS.vote(voter.id, jobId), vote);
    if (!CLOUD) return;
    try {
      // upsert: se a pessoa revotar a mesma corrida, atualiza em vez de duplicar
      const res = await fetch(`${CFG.SUPABASE_URL}/rest/v1/votes`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "apikey": CFG.SUPABASE_ANON_KEY,
          "Authorization": `Bearer ${CFG.SUPABASE_ANON_KEY}`,
          "Prefer": "resolution=merge-duplicates,return=minimal",
        },
        body: JSON.stringify({
          voter_id: voter.id, voter_name: voter.name, job_id: jobId, vote,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
    } catch (err) {
      console.warn("Falha ao enviar voto:", err);
      queueRetry({ voter_id: voter.id, voter_name: voter.name, job_id: jobId, vote });
    }
  }

  // fila de reenvio pra votos que falharam (rede instável no celular)
  function queueRetry(payload) {
    const q = JSON.parse(localStorage.getItem("gjs_retry") || "[]");
    q.push(payload);
    localStorage.setItem("gjs_retry", JSON.stringify(q));
  }
  async function flushRetry() {
    if (!CLOUD) return;
    let q = JSON.parse(localStorage.getItem("gjs_retry") || "[]");
    if (!q.length) return;
    const kept = [];
    for (const p of q) {
      try {
        const res = await fetch(`${CFG.SUPABASE_URL}/rest/v1/votes`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "apikey": CFG.SUPABASE_ANON_KEY,
            "Authorization": `Bearer ${CFG.SUPABASE_ANON_KEY}`,
            "Prefer": "resolution=merge-duplicates,return=minimal",
          },
          body: JSON.stringify(p),
        });
        if (!res.ok) throw new Error();
      } catch { kept.push(p); }
    }
    localStorage.setItem("gjs_retry", JSON.stringify(kept));
  }

  // ----------------------------------------------------------------- cards
  function render() {
    deck.innerHTML = "";
    const remaining = jobs.length - cursor;
    updateProgress();

    if (remaining <= 0) return finish();

    // renderiza o próximo card por baixo (pra dar profundidade) e o atual por cima
    const next = jobs[cursor + 1];
    if (next) deck.appendChild(buildCard(next, cursor + 1, false));
    const cur = jobs[cursor];
    const top = buildCard(cur, cursor, true);
    deck.appendChild(top);
    enableDrag(top);
    preload(cursor + 2);
  }

  function buildCard(job, index, interactive) {
    const el = document.createElement("div");
    el.className = "card";
    if (!interactive) el.style.transform = "scale(.96) translateY(10px)";
    el.innerHTML = `
      <span class="idx">${index + 1} / ${jobs.length}</span>
      <div class="stamp stamp-like">CURTIU</div>
      <div class="stamp stamp-nope">PASSOU</div>
      <img src="${job.img}" alt="${job.title || job.id}" draggable="false"
           onerror="this.parentElement.classList.add('imgfail')">
      <div class="caption">${job.title || job.id}</div>`;
    return el;
  }

  function preload(i) {
    for (let k = i; k < i + 3 && k < jobs.length; k++) {
      const img = new Image(); img.src = jobs[k].img;
    }
  }

  // --------------------------------------------------------------- arrastar
  function enableDrag(card) {
    let startX = 0, startY = 0, dx = 0, dy = 0, dragging = false;
    const like = card.querySelector(".stamp-like");
    const nope = card.querySelector(".stamp-nope");
    const THRESH = 90;

    const onDown = (e) => {
      dragging = true;
      startX = e.clientX; startY = e.clientY;
      card.setPointerCapture(e.pointerId);
      card.style.transition = "none";
    };
    const onMove = (e) => {
      if (!dragging) return;
      dx = e.clientX - startX; dy = e.clientY - startY;
      const rot = dx / 18;
      card.style.transform = `translate(${dx}px,${dy}px) rotate(${rot}deg)`;
      like.style.opacity = dx > 20 ? Math.min(1, dx / THRESH) : 0;
      nope.style.opacity = dx < -20 ? Math.min(1, -dx / THRESH) : 0;
    };
    const onUp = () => {
      if (!dragging) return;
      dragging = false;
      card.style.transition = "transform .3s ease, opacity .3s ease";
      if (dx > THRESH)      return flyOut(card, "like");
      if (dx < -THRESH)     return flyOut(card, "dislike");
      // volta pro lugar
      card.style.transform = "";
      like.style.opacity = nope.style.opacity = 0;
    };

    card.addEventListener("pointerdown", onDown);
    card.addEventListener("pointermove", onMove);
    card.addEventListener("pointerup", onUp);
    card.addEventListener("pointercancel", onUp);
  }

  function flyOut(card, vote) {
    const dir = vote === "like" ? 1 : -1;
    card.style.transform =
      `translate(${dir * window.innerWidth}px, 40px) rotate(${dir * 22}deg)`;
    card.style.opacity = "0";
    commitVote(vote);
  }

  // --------------------------------------------------------------- votar
  function commitVote(vote) {
    const job = jobs[cursor];
    if (!job) return;
    history.push({ index: cursor, vote });
    if (vote === "like") likeCount++;
    sendVote(job.id, vote);
    cursor++;
    saveProgress();
    setTimeout(render, vote ? 180 : 0);
  }

  function buttonVote(vote) {
    const top = deck.querySelector(".card:last-child");
    if (!top) return;
    top.style.transition = "transform .3s ease, opacity .3s ease";
    if (vote === "skip") { top.style.opacity = "0"; commitVote("skip"); return; }
    flyOut(top, vote);
  }

  function undo() {
    if (!history.length) return toast("Nada pra desfazer");
    const last = history.pop();
    if (last.vote === "like") likeCount = Math.max(0, likeCount - 1);
    cursor = last.index;
    // apaga o registro local; no banco o próximo voto sobrescreve via upsert
    localStorage.removeItem(LS.vote(voter.id, jobs[cursor].id));
    saveProgress();
    render();
    toast("Desfeito");
  }

  // --------------------------------------------------------------- progresso
  function updateProgress() {
    const done = Math.min(cursor, jobs.length);
    $("#progress-fill").style.width = (done / jobs.length * 100) + "%";
    $("#progress-text").textContent = `${done} / ${jobs.length}`;
    $("#btn-undo").disabled = history.length === 0;
  }
  function saveProgress() {
    localStorage.setItem(LS.progress(voter.id),
      JSON.stringify({ cursor, likeCount }));
  }
  function loadProgress() {
    try {
      const p = JSON.parse(localStorage.getItem(LS.progress(voter.id)));
      if (p && p.cursor > 0 && p.cursor < jobs.length) return p;
    } catch {}
    return null;
  }

  // --------------------------------------------------------------- fim
  function finish() {
    $("#done-summary").textContent =
      `${voter.name}, você curtiu ${likeCount} de ${jobs.length} corridas.`;
    show("done");
    flushRetry();
  }

  // --------------------------------------------------------------- boot
  async function loadJobs() {
    const res = await fetch("jobs.json", { cache: "no-store" });
    if (!res.ok) throw new Error("jobs.json não encontrado");
    jobs = await res.json();
    if (!Array.isArray(jobs) || !jobs.length) throw new Error("jobs.json vazio");
  }

  function startSwiping() {
    $("#greeting").textContent = `Oi, ${voter.name}`;
    const prev = loadProgress();
    if (prev) {
      const resume = confirm(
        `Você já votou em ${prev.cursor} corridas. Continuar de onde parou?\n` +
        `(Cancelar = começar do zero)`);
      if (resume) { cursor = prev.cursor; likeCount = prev.likeCount || 0; }
      else { cursor = 0; likeCount = 0; localStorage.removeItem(LS.progress(voter.id)); }
    }
    show("swipe");
    render();
    flushRetry();
  }

  function init() {
    if (!CLOUD) $("#demo-badge").hidden = false;

    // sessão salva?
    try {
      const saved = JSON.parse(localStorage.getItem(LS.voter));
      if (saved && saved.name) { $("#name-input").value = saved.name; }
    } catch {}

    $("#login-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const name = $("#name-input").value.trim();
      if (!name) return;
      let saved = null;
      try { saved = JSON.parse(localStorage.getItem(LS.voter)); } catch {}
      voter = { id: (saved && saved.id) || uid(), name };
      localStorage.setItem(LS.voter, JSON.stringify(voter));
      try { await loadJobs(); }
      catch (err) { return toast("Erro ao carregar corridas: " + err.message); }
      startSwiping();
    });

    $("#btn-like").addEventListener("click", () => buttonVote("like"));
    $("#btn-dislike").addEventListener("click", () => buttonVote("dislike"));
    $("#btn-skip").addEventListener("click", () => buttonVote("skip"));
    $("#btn-undo").addEventListener("click", undo);
    $("#btn-restart").addEventListener("click", () => {
      cursor = 0; likeCount = 0; history.length = 0;
      localStorage.removeItem(LS.progress(voter.id));
      show("swipe"); render();
    });

    // teclado (desktop): ← passa, → curte, ↑ pula, backspace desfaz
    document.addEventListener("keydown", (e) => {
      if (!screens.swipe.classList.contains("active")) return;
      if (e.key === "ArrowRight") buttonVote("like");
      else if (e.key === "ArrowLeft") buttonVote("dislike");
      else if (e.key === "ArrowUp") buttonVote("skip");
      else if (e.key === "Backspace") undo();
    });
  }

  init();
})();
