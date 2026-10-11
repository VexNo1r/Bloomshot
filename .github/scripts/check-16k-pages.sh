#!/usr/bin/env bash
# Google Play rejects new apps and updates whose 64-bit native libraries (.so) are not built for 16 KB memory
# pages. This checks every 64-bit library in an Android App Bundle: each loadable segment must be aligned to at
# least 16 KB. Usage: check-16k-pages.sh app-release.aab
set -euo pipefail
aab="$1"
libs="$(unzip -Z1 "$aab" | grep -E '/lib/(arm64-v8a|x86_64)/[^/]+\.so$' || true)"
if [ -z "$libs" ]; then
  echo "No 64-bit native libraries in the bundle, so the 16 KB page size rule has nothing to check."
  exit 0
fi
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
bad=()
while IFS= read -r lib; do
  unzip -p "$aab" "$lib" > "$tmp/lib.so"
  ok=1
  aligns="$(readelf -lW "$tmp/lib.so" | awk '$1 == "LOAD" { print $NF }')"
  [ -n "$aligns" ] || ok=0
  for align in $aligns; do
    if (( align < 16384 )); then ok=0; fi
  done
  if [ "$ok" = 1 ]; then echo "16 KB aligned: $lib"; else bad+=("$lib"); fi
done <<< "$libs"
if [ "${#bad[@]}" -gt 0 ]; then
  for lib in "${bad[@]}"; do echo "::error::Not built for 16 KB pages, Google Play would reject the bundle: $lib"; done
  exit 1
fi
