-- ===========================================================================
-- GTA Job Swipe — setup do banco no Supabase
-- ===========================================================================
-- Como usar:
--   1. No painel do Supabase, abra "SQL Editor"
--   2. Cole TODO este arquivo e clique em "Run"
-- Isso cria a tabela de votos, a trava anti-duplicata e as permissões
-- (RLS) que deixam o site inserir/ler votos com a chave anônima, sem
-- deixar ninguém apagar ou alterar nada.
-- ===========================================================================

create table if not exists public.votes (
  id          bigint generated always as identity primary key,
  voter_id    text        not null,   -- id anônimo do dispositivo (localStorage)
  voter_name  text        not null,   -- nome que a pessoa digitou
  job_id      text        not null,   -- id da corrida (ex: job_001)
  vote        text        not null check (vote in ('like', 'dislike', 'skip')),
  created_at  timestamptz not null default now(),

  -- cada pessoa vota uma vez por corrida; votar de novo atualiza o voto
  unique (voter_id, job_id)
);

create index if not exists votes_job_idx on public.votes (job_id);

alter table public.votes enable row level security;

-- Qualquer visitante (chave anon) pode INSERIR o próprio voto...
drop policy if exists "anon insere voto" on public.votes;
create policy "anon insere voto"
  on public.votes for insert
  to anon
  with check (true);

-- ...e ATUALIZAR (pra quando desfaz/troca o voto via upsert).
drop policy if exists "anon atualiza voto" on public.votes;
create policy "anon atualiza voto"
  on public.votes for update
  to anon
  using (true) with check (true);

-- Leitura liberada pra montar o ranking na admin.html.
-- (Se quiser esconder totalmente os votos, remova esta policy e leia o
--  ranking direto pelo painel do Supabase com a view abaixo.)
drop policy if exists "anon le votos" on public.votes;
create policy "anon le votos"
  on public.votes for select
  to anon
  using (true);

-- ...e APAGAR — usado pelo botão "Excluir" / "Zerar tudo" do painel admin.
-- (App de amigos: o painel é protegido só pelo nome. Se quiser travar de
--  verdade, remova esta policy e faça as exclusões pelo painel do Supabase.)
drop policy if exists "anon apaga voto" on public.votes;
create policy "anon apaga voto"
  on public.votes for delete
  to anon
  using (true);

-- ===========================================================================
-- Playlists — cada votante guarda suas listas como JSON (1 linha por pessoa)
-- ===========================================================================
create table if not exists public.playlists (
  voter_id    text primary key,
  voter_name  text        not null,
  data        jsonb       not null default '[]',   -- [{name, jobs:[...]}]
  updated_at  timestamptz not null default now()
);

alter table public.playlists enable row level security;

drop policy if exists "anon salva playlist" on public.playlists;
create policy "anon salva playlist"
  on public.playlists for insert to anon with check (true);

drop policy if exists "anon atualiza playlist" on public.playlists;
create policy "anon atualiza playlist"
  on public.playlists for update to anon using (true) with check (true);

drop policy if exists "anon le playlist" on public.playlists;
create policy "anon le playlist"
  on public.playlists for select to anon using (true);

drop policy if exists "anon apaga playlist" on public.playlists;
create policy "anon apaga playlist"
  on public.playlists for delete to anon using (true);

-- View pronta com o ranking de curtidas por corrida.
create or replace view public.ranking as
select
  job_id,
  count(*) filter (where vote = 'like')    as likes,
  count(*) filter (where vote = 'dislike') as dislikes,
  count(*) filter (where vote = 'skip')    as skips,
  count(distinct voter_id)                 as votantes
from public.votes
group by job_id
order by likes desc, dislikes asc;
