#!/usr/bin/env bash
# Gera a versão PUBLICADA do jogo (site e APK) a partir da pasta pwa/:
# copia os arquivos e minifica o JavaScript (tira comentários e espaços e encurta os nomes
# internos), deixando o código difícil de ler e de modificar.
#
#   tools/build-web.sh [pasta de saída]     (padrão: build/web)
#
# Precisa do Node.js (npx baixa o terser na primeira vez).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="${1:-$ROOT/build/web}"
TERSER="terser@5.36.0"
BANNER='/* Horta Hostil (c) 2026 mello13256. Todos os direitos reservados. Proibido copiar, modificar ou redistribuir. */'

rm -rf "$OUT"
mkdir -p "$OUT"
OUT="$(cd "$OUT" && pwd)" # caminho absoluto (os comandos abaixo mudam de pasta)
(cd "$ROOT/pwa" && cp -r index.html manifest.webmanifest sw.js capa.jpg icons js "$OUT/")

for f in "$OUT"/js/*.js "$OUT/sw.js"; do
    npx -y "$TERSER" "$f" --compress --mangle --comments false --format "preamble='$BANNER'" --output "$f"
done

echo "Versão publicada pronta em $OUT ($(du -sh "$OUT/js" | cut -f1) de JavaScript)"
