#!/usr/bin/env bash
# Regenerate shared/abi/index.ts from the compiled contracts.
# Run from the repo root or the shared/ dir; needs `forge` on PATH.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
cd "$HERE/../contracts"

declare -A C=(
  [PrincipalVault]=vault
  [Allocator]=allocator
  [YieldDistributor]=distributor
  [JuniorBuffer]=buffer
  [CreditBook]=creditBook
  [ReputationOracle]=reputation
  [SelfGate]=selfGate
)

OUT="$HERE/abi/index.ts"
mkdir -p "$HERE/abi"
{
  echo "// AUTO-GENERATED from contracts via 'forge inspect'. Do not edit by hand."
  echo "// Regenerate: pnpm --filter @kazi/shared gen:abi"
  echo ""
} > "$OUT"

for contract in "${!C[@]}"; do
  name=${C[$contract]}
  abi=$(forge inspect "src/${contract}.sol:${contract}" abi --json)
  echo "export const ${name}Abi = ${abi} as const;" >> "$OUT"
  echo "" >> "$OUT"
done

cat >> "$OUT" <<'EOF'
export const erc20Abi = [
  {"type":"function","name":"balanceOf","stateMutability":"view","inputs":[{"name":"account","type":"address"}],"outputs":[{"name":"","type":"uint256"}]},
  {"type":"function","name":"allowance","stateMutability":"view","inputs":[{"name":"owner","type":"address"},{"name":"spender","type":"address"}],"outputs":[{"name":"","type":"uint256"}]},
  {"type":"function","name":"approve","stateMutability":"nonpayable","inputs":[{"name":"spender","type":"address"},{"name":"amount","type":"uint256"}],"outputs":[{"name":"","type":"bool"}]},
  {"type":"function","name":"transfer","stateMutability":"nonpayable","inputs":[{"name":"to","type":"address"},{"name":"amount","type":"uint256"}],"outputs":[{"name":"","type":"bool"}]},
  {"type":"function","name":"decimals","stateMutability":"view","inputs":[],"outputs":[{"name":"","type":"uint8"}]}
] as const;
EOF

echo "wrote $OUT"
