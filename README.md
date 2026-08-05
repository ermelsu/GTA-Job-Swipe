# GTA Job Swipe

Site estilo Tinder pra galera **curtir 👍 ou passar 👎** nas suas corridas do GTA.
Você tira os prints, o site coleta os votos, e você vê o **ranking** de quais
corridas o pessoal mais gostou.

Tudo roda no **GitHub Pages** (site estático, sem servidor) + **Supabase**
(banco dos votos, plano grátis). Nenhum build, nenhum `npm`.

---

## Como está montado

```
raw/               seus prints crus (não vão pro site — ficam só na sua máquina)
images/            imagens cortadas e otimizadas (webp) — geradas pelo script
jobs.json          lista das corridas — gerada pelo script
prepare.py         corta + comprime + gera o jobs.json (roda 1x por lote)
index.html         o site do swipe (login → swipe → fim)
app.js             lógica do swipe
style.css          visual
admin.html         ranking dos votos (só pra você)
config.js          suas credenciais do Supabase
supabase_setup.sql cria a tabela de votos no Supabase
```

> Já vem com **12 imagens de exemplo** pra você testar na hora. Quando tiver os
> prints reais, é só trocar (passo 3).

---

## Passo a passo

### 1. Ligar o banco (Supabase) — 5 min
1. Crie uma conta grátis em <https://supabase.com> e um projeto novo.
2. Menu **SQL Editor** → cole todo o conteúdo de `supabase_setup.sql` → **Run**.
3. Menu **Settings → API** → copie **Project URL** e a chave **anon public**.
4. Cole os dois em `config.js`. Troque também a `ADMIN_PASSWORD`.

> Sem isso o site funciona em **modo demo** (votos só no seu navegador). Ótimo
> pra testar, mas preencha antes de mandar pros amigos.

### 2. Publicar no GitHub Pages — 2 min
1. Suba tudo pro GitHub (já está, se você clonou este repo).
2. No GitHub: **Settings → Pages → Source: Deploy from a branch** →
   escolha a branch e a pasta `/ (root)` → **Save**.
3. Em ~1 min o site fica no ar em `https://SEU-USUARIO.github.io/GTA-Job-Swipe/`.

### 3. Trocar pelas suas corridas
1. Jogue os prints das corridas na pasta `raw/`.
2. (Opcional) Calibre o corte: veja **Ajuste do corte** abaixo.
3. Rode:
   ```bash
   pip install Pillow
   python3 prepare.py
   ```
   Isso recria `images/` e `jobs.json`.
4. `git add . && git commit -m "novas corridas" && git push` — pronto, no ar.

### 4. Ver o ranking
Abra `https://SEU-USUARIO.github.io/GTA-Job-Swipe/admin.html`.
Mostra likes/dislikes por corrida, ordenado, com botão pra baixar CSV.
(Ou veja direto no painel do Supabase, tabela `votes` / view `ranking`.)

---

## Ajuste do corte

Seus prints têm a imagem principal + o nome centralizado. O `prepare.py` corta
uma caixa fixa (por padrão o frame inteiro em 16:9). Pra calibrar:

```bash
python3 prepare.py --preview      # mostra a caixa sem salvar
```

Abra `prepare.py` e ajuste `CROP = (left, top, right, bottom)` — são frações de
0 a 1, então funcionam em qualquer resolução. Ex.: `(0.08, 0.12, 0.92, 0.9)`
corta 8% dos lados e um pouco de cima/baixo. Rode `--preview` até ficar bom,
depois rode sem `--preview` pra gerar.

> **Me manda um print de exemplo** que eu deixo o `CROP` calibrado certinho pra você.

---

## Detalhes úteis
- **Anti-duplicata:** cada pessoa (por aparelho) vota uma vez por corrida;
  revotar atualiza em vez de duplicar.
- **Continuar de onde parou:** o progresso fica salvo no navegador.
- **Desfazer / pular:** botão de undo e de skip; no PC dá pra usar as setas.
- **Rede ruim:** votos que falham entram numa fila e são reenviados sozinhos.
- A chave `anon` do Supabase **pode** ficar pública — a segurança está nas
  policies do banco (só dá pra inserir/ler voto, não apagar).
