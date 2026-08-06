# GTA Job Swipe

Site estilo Tinder pra galera **curtir 👍 ou passar 👎** nas suas corridas do GTA.
Você tira os prints, o site coleta os votos, e você vê o **ranking** de quais
corridas o pessoal mais gostou.

Tudo roda no **GitHub Pages** (site estático, sem servidor) + **Supabase**
(banco dos votos, plano grátis). Nenhum build, nenhum `npm`.

---

## Como está montado

```
crop.html          FERRAMENTA DE CORTE: recorta cada corrida dos prints (use esta)
images/            imagens cortadas e otimizadas (webp)
jobs.json          lista das corridas — atualizada pela ferramenta de corte
index.html         o site do swipe (login → swipe → fim)
app.js             lógica do swipe
style.css          visual
admin.html         ranking dos votos (só pra você)
config.js          suas credenciais do Supabase
supabase_setup.sql cria a tabela de votos no Supabase
prepare.py         alternativa: se você JÁ tem imagens individuais por corrida
raw/               (opcional) prints crus pro prepare.py
```

> Já vem com **12 imagens de exemplo** pra você testar na hora. Quando for usar
> pra valer, apague as de exemplo antes de adicionar as reais:
> `rm images/job_*.webp && echo "[]" > jobs.json` (depois faça o passo 3).

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

### 3. Recortar suas corridas (a parte principal)
Você tira prints da **lista** de corridas do Social Club (várias por print). A
ferramenta `crop.html` recorta cada uma no mesmo tamanho — capa + nome, cortando
logo abaixo da linha divisória. Use no **Chrome ou Edge** (desktop).

1. Abra `https://SEU-USUARIO.github.io/GTA-Job-Swipe/crop.html`.
2. Arraste seus prints pra tela (ou botão **+ Prints**).
3. Na **1ª corrida**, arraste um retângulo em volta dela (capa + nome, parando
   abaixo da linha). Esse vira o **tamanho-padrão**.
4. Nas demais, só **clique no canto superior-esquerdo** de cada corrida — a
   caixa aparece no mesmo tamanho. Ajuste fino com as **setas** e tecle
   **Enter** pra adicionar. (Opcional: digite um nome pra ajudar no ranking.)
5. Clique **💾 Salvar na pasta do projeto** e escolha a pasta do repositório —
   ela grava as imagens em `images/` e atualiza o `jobs.json` sozinha.
6. `git add . && git commit -m "novas corridas" && git push` — no ar.

> **Sem Chrome/Edge?** Use o botão **Baixar (fallback)**: baixa as imagens e o
> `jobs.json`; aí você põe as imagens em `images/` e o `jobs.json` na raiz à mão.

> **Já tem uma imagem por corrida** (não a lista)? Aí dá pra usar o `prepare.py`:
> jogue as imagens em `raw/`, rode `pip install Pillow && python3 prepare.py`,
> e ele gera `images/` + `jobs.json`. Veja **Ajuste do corte** abaixo.

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
att
