#!/usr/bin/env bash
set -euo pipefail

errors=0
src_dir="src"
core_ts="src/services/api/core.ts"

echo "[check-architecture] scanning ${src_dir}/..."

# ─── Rule 1: Only core.ts may import @tauri-apps/api/core ────────────────────
rule1_violations=$(grep -rn '@tauri-apps/api/core' "$src_dir" --include='*.ts' --include='*.tsx' \
  | grep -v "^${core_ts}:" \
  | grep -v '\.test\.' \
  | grep -v '\.spec\.' || true)

if [[ -n "$rule1_violations" ]]; then
  while IFS= read -r line; do
    echo "❌ Rule 1 (no @tauri-apps/api/core import): $line"
  done <<< "$rule1_violations"
  errors=$((errors + $(echo "$rule1_violations" | wc -l | tr -d ' ')))
else
  echo "✅ Rule 1: No banned @tauri-apps/api/core imports"
fi

# ─── Rule 2: No direct invoke() calls outside core.ts ────────────────────────
rule2_violations=$(grep -rn 'invoke\s*(' "$src_dir" --include='*.ts' --include='*.tsx' \
  | grep -v "^${core_ts}:" \
  | grep -v '\.test\.' \
  | grep -v '\.spec\.' || true)

if [[ -n "$rule2_violations" ]]; then
  while IFS= read -r line; do
    echo "❌ Rule 2 (no direct invoke() calls): $line"
  done <<< "$rule2_violations"
  errors=$((errors + $(echo "$rule2_violations" | wc -l | tr -d ' ')))
else
  echo "✅ Rule 2: No direct invoke() calls outside core.ts"
fi

# ─── Rule 3: No @ts-ignore anywhere in src/ ──────────────────────────────────
rule3_violations=$(grep -rn '@ts-ignore' "$src_dir" --include='*.ts' --include='*.tsx' || true)

if [[ -n "$rule3_violations" ]]; then
  while IFS= read -r line; do
    echo "❌ Rule 3 (no @ts-ignore): $line"
  done <<< "$rule3_violations"
  errors=$((errors + $(echo "$rule3_violations" | wc -l | tr -d ' ')))
else
  echo "✅ Rule 3: No @ts-ignore found"
fi

# ─── Rule 4: No "as any" in non-test files ───────────────────────────────────
rule4_violations=$(grep -rn 'as any' "$src_dir" --include='*.ts' --include='*.tsx' \
  | grep -v '\.test\.' \
  | grep -v '\.spec\.' || true)

if [[ -n "$rule4_violations" ]]; then
  while IFS= read -r line; do
    echo "❌ Rule 4 (no 'as any' in non-test files): $line"
  done <<< "$rule4_violations"
  errors=$((errors + $(echo "$rule4_violations" | wc -l | tr -d ' ')))
else
  echo "✅ Rule 4: No 'as any' in non-test files"
fi

# ─── Summary ─────────────────────────────────────────────────────────────────
echo ""
if [[ $errors -gt 0 ]]; then
  echo "[check-architecture] ${errors} violation(s) found"
  exit 1
else
  echo "[check-architecture] All checks passed"
  exit 0
fi
