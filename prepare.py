#!/usr/bin/env python3
"""
GTA Job Swipe - Pipeline de preparo das imagens.

Roda UMA vez por lote de prints. Ele:
  1. Lê todos os prints crus da pasta ./raw
  2. Corta uma caixa (por padrão o centro em 16:9) ignorando as bordas/HUD
  3. Redimensiona pra largura alvo e comprime pra WebP (leve no celular)
  4. Salva em ./images com nome padronizado (job_001.webp, job_002.webp, ...)
  5. Gera ./jobs.json que o site consome

Uso:
    python3 prepare.py
    python3 prepare.py --preview        # só mostra a caixa de corte, não salva
    python3 prepare.py --keep-names      # usa o nome original em vez de job_001

CALIBRAÇÃO DO CORTE
-------------------
Os prints de corrida têm a imagem principal + o nome centralizado. Ajuste a
caixa de corte abaixo depois de olhar um print de exemplo. Os valores são
FRAÇÕES (0.0 a 1.0) da largura/altura, então funcionam pra qualquer resolução.

  CROP = (left, top, right, bottom)

Ex.: (0.10, 0.15, 0.90, 0.85) corta 10% de cada lado e 15% em cima/baixo.
Deixe (0, 0, 1, 1) pra não cortar nada. Rode com --preview pra conferir.
"""

import argparse
import json
import sys
from pathlib import Path

try:
    from PIL import Image
except ImportError:
    sys.exit("Pillow não instalado. Rode:  pip install Pillow")

# ---------------------------------------------------------------------------
# CONFIGURAÇÃO — ajuste aqui
# ---------------------------------------------------------------------------
RAW_DIR = Path("raw")
OUT_DIR = Path("images")
JOBS_JSON = Path("jobs.json")

# Caixa de corte em frações (left, top, right, bottom). Calibre com --preview.
CROP = (0.0, 0.0, 1.0, 1.0)

# Força proporção 16:9 no recorte final (centralizado dentro da caixa acima).
FORCE_16_9 = True

TARGET_WIDTH = 800          # largura final em px
WEBP_QUALITY = 82           # 0-100; 80-85 é ótimo equilíbrio
VALID_EXT = {".png", ".jpg", ".jpeg", ".webp", ".bmp"}
# ---------------------------------------------------------------------------


def crop_box(w, h):
    left, top, right, bottom = CROP
    box = [int(left * w), int(top * h), int(right * w), int(bottom * h)]

    if FORCE_16_9:
        bw = box[2] - box[0]
        bh = box[3] - box[1]
        target_h = int(bw * 9 / 16)
        if target_h <= bh:
            # sobra altura: centraliza verticalmente
            cy = (box[1] + box[3]) // 2
            box[1] = cy - target_h // 2
            box[3] = box[1] + target_h
        else:
            # sobra largura: centraliza horizontalmente
            target_w = int(bh * 16 / 9)
            cx = (box[0] + box[2]) // 2
            box[0] = cx - target_w // 2
            box[2] = box[0] + target_w
    return tuple(box)


def process(preview=False, keep_names=False):
    raw_files = sorted(
        p for p in RAW_DIR.glob("*") if p.suffix.lower() in VALID_EXT
    )
    if not raw_files:
        sys.exit(f"Nenhuma imagem encontrada em ./{RAW_DIR}/ "
                 f"(extensões: {', '.join(sorted(VALID_EXT))})")

    OUT_DIR.mkdir(exist_ok=True)
    jobs = []

    for i, src in enumerate(raw_files, start=1):
        img = Image.open(src).convert("RGB")
        box = crop_box(*img.size)

        if preview:
            print(f"{src.name}: {img.size} -> corte {box} "
                  f"({box[2]-box[0]}x{box[3]-box[1]})")
            continue

        img = img.crop(box)
        if img.width > TARGET_WIDTH:
            new_h = int(img.height * TARGET_WIDTH / img.width)
            img = img.resize((TARGET_WIDTH, new_h), Image.LANCZOS)

        job_id = src.stem if keep_names else f"job_{i:03d}"
        out_name = f"{job_id}.webp"
        img.save(OUT_DIR / out_name, "WEBP", quality=WEBP_QUALITY, method=6)

        jobs.append({"id": job_id, "img": f"images/{out_name}",
                     "title": src.stem.replace("_", " ")})
        print(f"OK  {src.name}  ->  {OUT_DIR}/{out_name}")

    if preview:
        print("\nPreview apenas — nada foi salvo. Ajuste CROP e rode de novo.")
        return

    JOBS_JSON.write_text(json.dumps(jobs, ensure_ascii=False, indent=2))
    print(f"\n{len(jobs)} corridas processadas. jobs.json atualizado.")


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description="Prepara imagens do GTA Job Swipe")
    ap.add_argument("--preview", action="store_true",
                    help="Mostra a caixa de corte sem salvar nada")
    ap.add_argument("--keep-names", action="store_true",
                    help="Usa o nome do arquivo original como id")
    args = ap.parse_args()
    process(preview=args.preview, keep_names=args.keep_names)
