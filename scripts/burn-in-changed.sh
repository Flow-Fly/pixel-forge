#!/bin/bash
# scripts/burn-in-changed.sh
# Burn-In Test Runner - Detects flaky tests by running changed specs multiple times
# Usage: ./scripts/burn-in-changed.sh [iterations] [base-branch]

set -e

# Configuration
ITERATIONS=${1:-10}
BASE_BRANCH=${2:-main}
SPEC_PATTERN='\.(spec|test)\.(ts|tsx)$'

echo ""
echo "Burn-In Test Runner"
echo "============================================"
echo "Iterations:  $ITERATIONS"
echo "Base branch: $BASE_BRANCH"
echo "============================================"
echo ""

# Detect changed test files
echo "Detecting changed test files..."
CHANGED_SPECS=$(git diff --name-only $BASE_BRANCH...HEAD | grep -E "$SPEC_PATTERN" || echo "")

if [ -z "$CHANGED_SPECS" ]; then
  echo ""
  echo "[OK] No test files changed. Skipping burn-in."
  exit 0
fi

echo ""
echo "Changed test files:"
echo "$CHANGED_SPECS" | sed 's/^/  - /'
echo ""

# Count specs
SPEC_COUNT=$(echo "$CHANGED_SPECS" | wc -l | xargs)
echo "Running burn-in on $SPEC_COUNT test file(s)..."
echo ""

# Burn-in loop
for i in $(seq 1 $ITERATIONS); do
  echo "============================================"
  echo "  Iteration $i/$ITERATIONS"
  echo "============================================"

  if npm run test:run -- $CHANGED_SPECS 2>&1; then
    echo "[OK] Iteration $i passed"
  else
    echo ""
    echo "[FAIL] Iteration $i failed"
    echo ""
    echo "============================================"
    echo "  BURN-IN FAILED"
    echo "============================================"
    echo "Tests are FLAKY - failed on iteration $i"
    echo "Fix the flaky test before merging."
    echo ""
    exit 1
  fi

  echo ""
done

# Success summary
echo "============================================"
echo "  BURN-IN PASSED"
echo "============================================"
echo "All $ITERATIONS iterations passed for $SPEC_COUNT test file(s)"
echo "Changed specs are stable and ready to merge."
echo ""

exit 0
