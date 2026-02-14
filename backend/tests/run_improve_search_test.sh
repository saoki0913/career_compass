#!/bin/bash
# improve-search test launcher
cd /Users/saoki/work/career_compass

# Read seed from state file, fallback to argument, then default (6)
STATE_FILE="backend/tests/output/improve_search_state.json"
SEED=${1:-$(python3 -c "import json; d=json.load(open('$STATE_FILE')); print(d.get('seed_rotation',{}).get('current_seed',6))" 2>/dev/null || echo 6)}
echo "Using seed: $SEED"

# Clean up old files
rm -f /tmp/improve_search_test.pid /tmp/improve_search_exit_code /tmp/improve_search_caffeinate.pid

# Launch test in background
nohup bash -c "
  cd /Users/saoki/work/career_compass
  RUN_LIVE_SEARCH=1 \
  LIVE_SEARCH_SAMPLE_SIZE=30 \
  LIVE_SEARCH_MODES=hybrid,legacy \
  LIVE_SEARCH_CACHE_MODE=use \
  LIVE_SEARCH_SAMPLE_SEED=$SEED \
  LIVE_SEARCH_TOKENS_PER_SECOND=1.0 \
  LIVE_SEARCH_MAX_TOKENS=1.0 \
  python -m pytest backend/tests/test_live_company_info_search_report.py -v -s -m 'integration' \
  2>&1 | tee backend/tests/output/improve_search_test.log
  echo \$? > /tmp/improve_search_exit_code
" > /dev/null 2>&1 &

TEST_PID=$!
echo $TEST_PID > /tmp/improve_search_test.pid
echo "Test started with PID: $TEST_PID"

# Prevent macOS sleep
caffeinate -dims -w $TEST_PID > /dev/null 2>&1 &
CAFE_PID=$!
echo $CAFE_PID > /tmp/improve_search_caffeinate.pid
echo "Caffeinate started with PID: $CAFE_PID"

# Verify
sleep 2
if ps -p $TEST_PID > /dev/null 2>&1; then
  echo "SUCCESS: Test process is running"
else
  echo "FAILURE: Test process died immediately"
fi
