#!/usr/bin/env bash
# =============================================================================
# Kazi — REAL local end-to-end on Anvil (no mocks presented as real).
#
# Spins up a local Anvil node running as Celo Sepolia (chain-id 11142220),
# deploys the actual contracts, and drives the full lifecycle with real
# transactions:
#   - the SAVINGS flow is driven by the REAL agent (allocate + harvest), and
#   - the CREDIT loop (borrow / repay / default) by cast,
# asserting at every step that depositor principal is never reduced.
#
# Requires: forge, anvil, cast (Foundry) and node/pnpm. Run from repo root:
#   bash scripts/e2e-local.sh
# =============================================================================
set -euo pipefail

export PATH="$PATH:/c/Users/USER/.foundry/bin:$HOME/.foundry/bin"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
RPC="http://127.0.0.1:8545"
CHAIN_ID=11142220
ANVIL_LOG="$(mktemp)"

pass() { echo -e "  \033[32m✓\033[0m $1"; }
fail() { echo -e "  \033[31m✗ $1\033[0m"; cleanup; exit 1; }
step() { echo -e "\n\033[36m▶ $1\033[0m"; }

ANVIL_PID=""
ADDR_FILE="$ROOT/shared/addresses.json"
ADDR_BACKUP="$(mktemp)"
cp "$ADDR_FILE" "$ADDR_BACKUP" 2>/dev/null || true
cleanup() {
  [ -n "$ANVIL_PID" ] && kill "$ANVIL_PID" 2>/dev/null || true
  # restore the committed addresses template — running the e2e must not dirty the repo
  [ -f "$ADDR_BACKUP" ] && cp "$ADDR_BACKUP" "$ADDR_FILE" 2>/dev/null || true
}
trap cleanup EXIT

# --- helpers ----------------------------------------------------------------
ucall() { # read a uint from a view fn -> bare decimal (strip cast's " [1e21]" annotation)
  cast call "$1" "$2" "${@:3}" --rpc-url "$RPC" | awk '{print $1}'
}
ge() { node -e "process.exit(BigInt('$1') >= BigInt('$2') ? 0 : 1)"; }
gt() { node -e "process.exit(BigInt('$1') >  BigInt('$2') ? 0 : 1)"; }
addr() { # read a field from shared/addresses.json (bash opens the file; node parses stdin)
  node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>console.log(JSON.parse(d).$1))" < "$ROOT/shared/addresses.json"
}
E18="000000000000000000"

step "Starting Anvil as Celo Sepolia (chain-id $CHAIN_ID)"
anvil --chain-id "$CHAIN_ID" --silent > "$ANVIL_LOG" 2>&1 &
ANVIL_PID=$!
# anvil --silent suppresses keys, so use the well-known deterministic test mnemonic
MNEMONIC="test test test test test test test test test test test junk"
DEPLOYER_KEY=$(cast wallet private-key "$MNEMONIC" 0)
AGENT_KEY=$(cast wallet private-key "$MNEMONIC" 1)
USER_KEY=$(cast wallet private-key "$MNEMONIC" 2)
BORROWER_KEY=$(cast wallet private-key "$MNEMONIC" 3)
USER_ADDR=$(cast wallet address "$USER_KEY")
BORROWER_ADDR=$(cast wallet address "$BORROWER_KEY")
for i in $(seq 1 30); do cast block-number --rpc-url "$RPC" >/dev/null 2>&1 && break; sleep 0.3; done
pass "anvil up (deployer=$(cast wallet address "$DEPLOYER_KEY"))"

step "Deploying the Kazi stack (MockUSD asset, 10% mock APR)"
( cd "$ROOT/contracts" && \
  CHAIN=celo-sepolia USE_REAL_CUSD=false MOCK_STRATEGY_APR_BPS=1000 \
  STREAM_SHARE_BPS=10000 BUFFER_SHARE_BPS=0 RESERVE_BPS=1000 \
  forge script script/Deploy.s.sol --rpc-url "$RPC" --private-key "$DEPLOYER_KEY" \
    --broadcast >/dev/null )
ASSET=$(addr asset); VAULT=$(addr vault); ALLOC=$(addr allocator)
GATE=$(addr selfGate); DIST=$(addr distributor); BUF=$(addr buffer)
CREDIT=$(addr creditBook); REP=$(addr reputation)
pass "deployed — vault=$VAULT"

step "Onboarding a saver and depositing 1000 cUSD (real txs)"
cast send "$GATE" "setVerified(address,bool)" "$USER_ADDR" true --rpc-url "$RPC" --private-key "$DEPLOYER_KEY" >/dev/null
cast send "$ASSET" "mint(address,uint256)" "$USER_ADDR" "1000$E18" --rpc-url "$RPC" --private-key "$DEPLOYER_KEY" >/dev/null
cast send "$ASSET" "approve(address,uint256)" "$VAULT" "1000$E18" --rpc-url "$RPC" --private-key "$USER_KEY" >/dev/null
cast send "$VAULT" "deposit(uint256,address)" "1000$E18" "$USER_ADDR" --rpc-url "$RPC" --private-key "$USER_KEY" >/dev/null
TA=$(ucall "$VAULT" "totalAssets()(uint256)")
[ "$TA" = "1000$E18" ] && pass "deposited; totalAssets = $(cast to-unit "$TA" ether) cUSD" || fail "unexpected totalAssets $TA"

step "Agent allocates idle principal into the senior strategy (real agent, --once)"
run_agent() { ( cd "$ROOT/agent" && CHAIN=local CELO_RPC_URL="$RPC" AGENT_PRIVATE_KEY="$AGENT_KEY" \
  CREDIT_ENABLED="${1:-false}" AGENT_STATE_PATH="$ROOT/.kazi/e2e-state.json" \
  node --import tsx src/index.ts --once 2>&1 | sed 's/^/    /'; ) }
run_agent false
DEPLOYED=$(ucall "$ALLOC" "totalDeployedValue()(uint256)")
gt "$DEPLOYED" "0" && pass "agent deployed $(cast to-unit "$DEPLOYED" ether) cUSD to senior" || fail "agent did not allocate"

step "Time passes ~90 days; agent harvests realized yield (real agent)"
cast rpc evm_increaseTime 7776000 --rpc-url "$RPC" >/dev/null
cast rpc evm_mine --rpc-url "$RPC" >/dev/null
run_agent false
TA2=$(ucall "$VAULT" "totalAssets()(uint256)")
gt "$TA2" "1000$E18" && pass "yield streamed in; totalAssets now $(cast to-unit "$TA2" ether) cUSD" || fail "no yield harvested ($TA2)"
ge "$TA2" "1000$E18" && pass "INVARIANT: principal still fully backed" || fail "principal not backed"

step "Credit loop: fund the buffer from yield (50/50 split) and lend"
cast send "$DIST" "setSplit(uint256,uint256)" 5000 5000 --rpc-url "$RPC" --private-key "$DEPLOYER_KEY" >/dev/null
cast rpc evm_increaseTime 7776000 --rpc-url "$RPC" >/dev/null && cast rpc evm_mine --rpc-url "$RPC" >/dev/null
run_agent false   # harvest again -> now part funds the buffer
BUFCAP=$(ucall "$BUF" "availableForCredit()(uint256)")
gt "$BUFCAP" "0" && pass "buffer funded from YIELD only: $(cast to-unit "$BUFCAP" ether) cUSD" || fail "buffer empty"
LIFEFUND=$(ucall "$BUF" "lifetimeFundedFromYield()(uint256)")

cast send "$GATE" "setVerified(address,bool)" "$BORROWER_ADDR" true --rpc-url "$RPC" --private-key "$DEPLOYER_KEY" >/dev/null
cast send "$REP" "setScore(address,uint256)" "$BORROWER_ADDR" 800 --rpc-url "$RPC" --private-key "$DEPLOYER_KEY" >/dev/null
LOAN=$(node -e "console.log((BigInt('$BUFCAP')/4n).toString())")
TA_BEFORE_LOAN=$(ucall "$VAULT" "totalAssets()(uint256)")
cast send "$CREDIT" "issue(address,uint256)" "$BORROWER_ADDR" "$LOAN" --rpc-url "$RPC" --private-key "$DEPLOYER_KEY" >/dev/null
OUT=$(ucall "$CREDIT" "totalOutstanding()(uint256)")
[ "$OUT" = "$LOAN" ] && pass "loan issued from buffer: $(cast to-unit "$LOAN" ether) cUSD" || fail "loan not issued"
ge "$(ucall "$VAULT" "totalAssets()(uint256)")" "$TA_BEFORE_LOAN" && pass "INVARIANT: lending did not touch principal" || fail "principal changed on lend"

step "Borrower defaults; loss must hit the buffer, NOT principal"
TA_PRE_DEFAULT=$(ucall "$VAULT" "totalAssets()(uint256)")
cast rpc evm_increaseTime 3456000 --rpc-url "$RPC" >/dev/null && cast rpc evm_mine --rpc-url "$RPC" >/dev/null  # 40d past due
cast send "$CREDIT" "markDefault(address)" "$BORROWER_ADDR" --rpc-url "$RPC" --private-key "$DEPLOYER_KEY" >/dev/null
LOSS=$(ucall "$CREDIT" "lifetimeLosses()(uint256)")
[ "$LOSS" = "$LOAN" ] && pass "default realized; loss = $(cast to-unit "$LOSS" ether) cUSD" || fail "unexpected loss $LOSS"
ge "$LIFEFUND" "$LOSS" && pass "INVARIANT: loss bounded by buffer funding (never principal)" || fail "loss exceeded buffer"
ge "$(ucall "$VAULT" "totalAssets()(uint256)")" "$TA_PRE_DEFAULT" && pass "THE MONEY-SHOT: depositor principal UNCHANGED by default" || fail "principal dropped on default!"

step "Saver withdraws everything: principal + streamed yield"
SHARES=$(ucall "$VAULT" "balanceOf(address)(uint256)" "$USER_ADDR")
cast send "$VAULT" "redeem(uint256,address,address)" "$SHARES" "$USER_ADDR" "$USER_ADDR" --rpc-url "$RPC" --private-key "$USER_KEY" >/dev/null
BAL=$(ucall "$ASSET" "balanceOf(address)(uint256)" "$USER_ADDR")
ge "$BAL" "1000$E18" && pass "saver redeemed $(cast to-unit "$BAL" ether) cUSD (>= 1000 principal)" || fail "saver short-changed ($BAL)"

echo -e "\n\033[32m✅ END-TO-END PASSED — real chain, real agent, real transactions.\033[0m"
cleanup
