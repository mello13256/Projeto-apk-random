#!/usr/bin/env bash
# Compila o APK do Horta Hostil SEM Android Studio/Gradle.
# Precisa apenas de: Java (JDK 17+), curl, zip e npm (para baixar o aapt2).
#
#   ./build.sh        -> gera HortaHostil.apk
#   ./build.sh sim    -> roda o simulador (joga sozinho no PC para testar a lógica)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
TOOLS="$ROOT/.tools"
BUILD="$ROOT/build"
SRC="$ROOT/app/src/main"
OUT="$ROOT/HortaHostil.apk"
KEYSTORE="$ROOT/keystore/horta.p12"
KEYPASS="android"
KEYALIAS="horta"

ANDROID_JAR="${ANDROID_JAR:-$TOOLS/android.jar}"
AAPT2="${AAPT2:-$TOOLS/aapt2}"
R8_JAR="${R8_JAR:-$TOOLS/r8lib.jar}"
APKSIG_JAR="${APKSIG_JAR:-$TOOLS/apksig.jar}"

JAVAC_FLAGS=(-encoding UTF-8 -source 8 -target 8 -Xlint:-options -nowarn)

step() { echo; echo "==> $*"; }

if [[ "${1:-}" == "sim" ]]; then
    step "Compilando o simulador"
    rm -rf "$BUILD/sim" && mkdir -p "$BUILD/sim"
    javac -encoding UTF-8 -d "$BUILD/sim" $(find "$SRC/java/com/escola/hortahostil/game" -name '*.java') "$ROOT/sim/SimTest.java"
    java -cp "$BUILD/sim" SimTest "${@:2}"
    exit 0
fi

# ---------------------------------------------------------------------------
# 1) Ferramentas (baixadas uma vez para .tools/)
# ---------------------------------------------------------------------------
mkdir -p "$TOOLS"
if [[ ! -f "$ANDROID_JAR" ]]; then
    step "Baixando android.jar (API 34)"
    curl -fL -o "$ANDROID_JAR" https://raw.githubusercontent.com/Sable/android-platforms/master/android-34/android.jar
fi
if [[ ! -x "$AAPT2" ]]; then
    step "Baixando aapt2"
    tmp="$(mktemp -d)"
    (cd "$tmp" && npm pack aaptjs3@2.0.2 >/dev/null && tar xzf aaptjs3-*.tgz)
    cp "$tmp/package/bin/x64/linux/aapt2" "$AAPT2"
    chmod +x "$AAPT2"
    rm -rf "$tmp"
fi
if [[ ! -f "$R8_JAR" ]]; then
    step "Baixando D8/R8"
    curl -fL -o "$R8_JAR" https://storage.googleapis.com/r8-releases/raw/8.5.35/r8lib.jar
fi
if [[ ! -f "$APKSIG_JAR" ]]; then
    step "Baixando apksig"
    curl -fL -o "$APKSIG_JAR" https://repo.maven.apache.org/maven2/com/android/tools/build/apksig/2.3.0/apksig-2.3.0.jar
fi

rm -rf "$BUILD"
mkdir -p "$BUILD/gen" "$BUILD/classes" "$BUILD/dex" "$BUILD/signer"

# ---------------------------------------------------------------------------
# 2) Recursos (manifest, icone, textos)
# ---------------------------------------------------------------------------
step "Compilando recursos (aapt2)"
"$AAPT2" compile --dir "$SRC/res" -o "$BUILD/res.zip"
"$AAPT2" link -I "$ANDROID_JAR" \
    --manifest "$SRC/AndroidManifest.xml" \
    --java "$BUILD/gen" \
    -o "$BUILD/base.apk" \
    "$BUILD/res.zip"

# ---------------------------------------------------------------------------
# 3) Codigo Java -> .class -> classes.dex
# ---------------------------------------------------------------------------
step "Compilando Java"
javac "${JAVAC_FLAGS[@]}" -bootclasspath "$ANDROID_JAR" -d "$BUILD/classes" \
    $(find "$SRC/java" "$BUILD/gen" -name '*.java')

step "Convertendo para DEX (d8)"
java -cp "$R8_JAR" com.android.tools.r8.D8 --release --min-api 24 \
    --lib "$ANDROID_JAR" --output "$BUILD/dex" \
    $(find "$BUILD/classes" -name '*.class')

step "Montando APK"
(cd "$BUILD/dex" && zip -q -j "$BUILD/base.apk" classes.dex)

# ---------------------------------------------------------------------------
# 4) Assinatura
# ---------------------------------------------------------------------------
if [[ ! -f "$KEYSTORE" ]]; then
    step "Criando chave de assinatura"
    mkdir -p "$(dirname "$KEYSTORE")"
    keytool -genkeypair -keystore "$KEYSTORE" -storetype PKCS12 -storepass "$KEYPASS" \
        -keypass "$KEYPASS" -alias "$KEYALIAS" -keyalg RSA -keysize 2048 -validity 10000 \
        -dname "CN=Horta Hostil, OU=Projeto Escolar, O=Escola, C=BR"
fi
step "Assinando APK"
javac -encoding UTF-8 -cp "$APKSIG_JAR" -d "$BUILD/signer" "$ROOT/tools/Signer.java"
java --add-exports java.base/sun.security.x509=ALL-UNNAMED \
    -cp "$BUILD/signer:$APKSIG_JAR" Signer "$BUILD/base.apk" "$OUT" "$KEYSTORE" "$KEYPASS" "$KEYALIAS"

step "Pronto! -> $OUT ($(du -h "$OUT" | cut -f1))"
