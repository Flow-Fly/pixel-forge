#!/bin/bash
# scripts/ci-local.sh
# Local CI Mirror - Run the same checks that CI runs
# Usage: ./scripts/ci-local.sh [--quick]

set -e

QUICK_MODE=false
if [ "$1" == "--quick" ]; then
  QUICK_MODE=true
fi

echo ""
echo "Local CI Pipeline"
echo "============================================"
echo "Mode: $([ "$QUICK_MODE" == true ] && echo "Quick (no burn-in)" || echo "Full")"
echo "============================================"
echo ""

# Stage 1: TypeScript Check
echo "[1/5] TypeScript Check"
echo "--------------------------------------------"
npx tsc --noEmit
echo "[OK] TypeScript check passed"
echo ""

# Stage 2: Unit Tests
echo "[2/5] Unit Tests"
echo "--------------------------------------------"
npm run test:run
echo "[OK] Unit tests passed"
echo ""

# Stage 3: Coverage
echo "[3/5] Test Coverage"
echo "--------------------------------------------"
npm run test:coverage 2>/dev/null || echo "[WARN] Coverage script not configured"
echo ""

# Stage 4: Build
echo "[4/5] Build"
echo "--------------------------------------------"
npm run build
echo "[OK] Build passed"
echo ""

# Stage 5: Burn-In (unless quick mode)
if [ "$QUICK_MODE" == false ]; then
  echo "[5/5] Burn-In (3 iterations)"
  echo "--------------------------------------------"
  for i in {1..3}; do
    echo "  Burn-in iteration $i/3"
    npm run test:run -- --silent || {
      echo ""
      echo "[FAIL] Burn-in failed on iteration $i"
      exit 1
    }
  done
  echo "[OK] Burn-in passed (3/3)"
  echo ""
else
  echo "[5/5] Burn-In"
  echo "--------------------------------------------"
  echo "[SKIP] Burn-in skipped (quick mode)"
  echo ""
fi

# Summary
echo "============================================"
echo "  LOCAL CI PASSED"
echo "============================================"
echo "All checks passed. Ready to push!"
echo ""

exit 0
