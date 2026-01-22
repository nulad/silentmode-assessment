#!/bin/bash

# End-to-End Test Script for Silentmode Assessment
# Tests the complete chunk download system

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Test configuration
SERVER_HOST="localhost"
SERVER_PORT="3000"
CLIENT_ID="test-client-$(date +%s)"
TEST_FILES_DIR="test-files"
DOWNLOADS_DIR="downloads"
LOG_FILE="logs/e2e-test-$(date +%Y%m%d-%H%M%S).log"

# Ensure directories exist
mkdir -p "$DOWNLOADS_DIR"
mkdir -p logs

# Helper functions
print_test() {
    echo -e "${BLUE}[TEST]${NC} $1"
}

print_pass() {
    echo -e "${GREEN}[PASS]${NC} $1"
}

print_fail() {
    echo -e "${RED}[FAIL]${NC} $1"
}

print_info() {
    echo -e "${YELLOW}[INFO]${NC} $1"
}

# Test results
TESTS_PASSED=0
TESTS_FAILED=0

# Start server in background
start_server() {
    print_info "Starting server..."
    cd server
    npm start > ../logs/server-test.log 2>&1 &
    SERVER_PID=$!
    cd ..
    
    # Wait for server to start
    for i in {1..30}; do
        if curl -s "http://$SERVER_HOST:$SERVER_PORT/health" > /dev/null 2>&1; then
            print_pass "Server started successfully (PID: $SERVER_PID)"
            return 0
        fi
        sleep 1
    done
    
    print_fail "Server failed to start"
    return 1
}

# Stop server
stop_server() {
    if [ ! -z "$SERVER_PID" ]; then
        print_info "Stopping server (PID: $SERVER_PID)..."
        kill $SERVER_PID 2>/dev/null || true
        wait $SERVER_PID 2>/dev/null || true
        print_pass "Server stopped"
    fi
}

# Run a test case
run_test() {
    local test_name="$1"
    local test_command="$2"
    
    print_test "$test_name"
    
    if eval "$test_command" >> "$LOG_FILE" 2>&1; then
        print_pass "$test_name"
        ((TESTS_PASSED++))
        return 0
    else
        print_fail "$test_name"
        ((TESTS_FAILED++))
        return 1
    fi
}

# Verify file integrity
verify_file() {
    local original="$1"
    local downloaded="$2"
    
    if [ ! -f "$downloaded" ]; then
        return 1
    fi
    
    # Compare file sizes
    original_size=$(stat -c%s "$original")
    downloaded_size=$(stat -c%s "$downloaded")
    
    if [ "$original_size" -ne "$downloaded_size" ]; then
        print_info "Size mismatch: original=$original_size, downloaded=$downloaded_size"
        return 1
    fi
    
    # Compare checksums
    original_checksum=$(sha256sum "$original" | cut -d' ' -f1)
    downloaded_checksum=$(sha256sum "$downloaded" | cut -d' ' -f1)
    
    if [ "$original_checksum" != "$downloaded_checksum" ]; then
        print_info "Checksum mismatch"
        return 1
    fi
    
    return 0
}

# Main test suite
main() {
    print_info "Starting E2E Test Suite"
    print_info "Log file: $LOG_FILE"
    
    # Initialize log
    echo "E2E Test Log - $(date)" > "$LOG_FILE"
    
    # Trap to ensure server is stopped
    trap stop_server EXIT
    
    # Start server
    if ! start_server; then
        exit 1
    fi
    
    # Test 1: Health Check
    run_test "Health Check" "curl -f -s http://$SERVER_HOST:$SERVER_PORT/health"
    
    # Test 2: Client Registration
    run_test "Client Registration" "curl -f -s -X POST http://$SERVER_HOST:$SERVER_PORT/api/clients -H 'Content-Type: application/json' -d '{\"name\":\"$CLIENT_ID\"}'"
    
    # Test 3: List Downloads (Empty)
    run_test "List Downloads (Empty)" "curl -f -s http://$SERVER_HOST:$SERVER_PORT/api/downloads"
    
    # Test 4: Start Download
    TEST_FILE="$TEST_FILES_DIR/test-5mb.dat"
    if [ -f "$TEST_FILE" ]; then
        DOWNLOAD_ID=$(curl -s -X POST "http://$SERVER_HOST:$SERVER_PORT/api/downloads" \
            -H "Content-Type: application/json" \
            -d "{\"filename\":\"$(basename $TEST_FILE)\",\"size\":$(stat -c%s $TEST_FILE)}" | \
            grep -o '"id":"[^"]*' | cut -d'"' -f4)
        
        if [ ! -z "$DOWNLOAD_ID" ]; then
            print_pass "Download started (ID: $DOWNLOAD_ID)"
            ((TESTS_PASSED++))
            
            # Test 5: Get Download Status
            run_test "Get Download Status" "curl -f -s http://$SERVER_HOST:$SERVER_PORT/api/downloads/$DOWNLOAD_ID"
            
            # Test 6: Download Chunks
            print_info "Downloading chunks..."
            node cli.js download "$DOWNLOAD_ID" --output "$DOWNLOADS_DIR/downloaded-$DOWNLOAD_ID.dat" >> "$LOG_FILE" 2>&1
            
            if verify_file "$TEST_FILE" "$DOWNLOADS_DIR/downloaded-$DOWNLOAD_ID.dat"; then
                print_pass "File integrity verified"
                ((TESTS_PASSED++))
            else
                print_fail "File integrity check failed"
                ((TESTS_FAILED++))
            fi
            
            # Test 7: List Downloads (With Data)
            run_test "List Downloads (With Data)" "curl -f -s http://$SERVER_HOST:$SERVER_PORT/api/downloads"
            
            # Test 8: Delete Download
            run_test "Delete Download" "curl -f -s -X DELETE http://$SERVER_HOST:$SERVER_PORT/api/downloads/$DOWNLOAD_ID"
            
        else
            print_fail "Failed to start download"
            ((TESTS_FAILED++))
        fi
    else
        print_fail "Test file not found: $TEST_FILE"
        ((TESTS_FAILED++))
    fi
    
    # Test 9: Error Handling - Invalid Download ID
    run_test "Error Handling - Invalid Download ID" "curl -s -w '%{http_code}' -o /dev/null http://$SERVER_HOST:$SERVER_PORT/api/downloads/invalid-id | grep -q 404"
    
    # Test 10: Concurrent Downloads
    print_info "Testing concurrent downloads..."
    TEST_FILE2="$TEST_FILES_DIR/test-10mb.dat"
    if [ -f "$TEST_FILE2" ]; then
        # Start two downloads concurrently
        (DOWNLOAD_ID1=$(curl -s -X POST "http://$SERVER_HOST:$SERVER_PORT/api/downloads" \
            -H "Content-Type: application/json" \
            -d "{\"filename\":\"test1.dat\",\"size\":$(stat -c%s $TEST_FILE)}" | \
            grep -o '"id":"[^"]*' | cut -d'"' -f4)
        node cli.js download "$DOWNLOAD_ID1" --output "$DOWNLOADS_DIR/concurrent1.dat" >> "$LOG_FILE" 2>&1) &
        
        (DOWNLOAD_ID2=$(curl -s -X POST "http://$SERVER_HOST:$SERVER_PORT/api/downloads" \
            -H "Content-Type: application/json" \
            -d "{\"filename\":\"test2.dat\",\"size\":$(stat -c%s $TEST_FILE2)}" | \
            grep -o '"id":"[^"]*' | cut -d'"' -f4)
        node cli.js download "$DOWNLOAD_ID2" --output "$DOWNLOADS_DIR/concurrent2.dat" >> "$LOG_FILE" 2>&1) &
        
        wait
        
        if verify_file "$TEST_FILE" "$DOWNLOADS_DIR/concurrent1.dat" && \
           verify_file "$TEST_FILE2" "$DOWNLOADS_DIR/concurrent2.dat"; then
            print_pass "Concurrent downloads successful"
            ((TESTS_PASSED++))
        else
            print_fail "Concurrent downloads failed"
            ((TESTS_FAILED++))
        fi
    fi
    
    # Print results
    echo ""
    print_info "Test Results:"
    echo -e "  ${GREEN}Passed: $TESTS_PASSED${NC}"
    echo -e "  ${RED}Failed: $TESTS_FAILED${NC}"
    echo -e "  Total: $((TESTS_PASSED + TESTS_FAILED))"
    
    if [ $TESTS_FAILED -eq 0 ]; then
        print_info "All tests passed! ✓"
        exit 0
    else
        print_info "Some tests failed. Check log: $LOG_FILE"
        exit 1
    fi
}

# Run main function
main "$@"
