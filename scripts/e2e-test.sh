#!/bin/bash

# End-to-End Test Script for Silentmode Assessment
# Tests the complete chunk download system

# Note: Don't use 'set -e' here as we want to continue testing even if some tests fail

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

# Create test file in HOME directory for the client to serve
mkdir -p "$HOME/data"
echo "This is a test file for e2e testing" > "$HOME/data/file_to_download.txt"

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
    # Start npm in its own process group using setsid
    setsid npm start > ../logs/server-test.log 2>&1 &
    SERVER_PID=$!
    cd ..

    # Wait for server to start
    for i in {1..30}; do
        if curl -s "http://$SERVER_HOST:$SERVER_PORT/api/v1/health" > /dev/null 2>&1; then
            print_pass "Server started successfully (PID: $SERVER_PID)"
            return 0
        fi
        sleep 1
    done

    print_fail "Server failed to start"
    return 1
}

# Start client in background
start_client() {
    print_info "Starting test client..."

    # Backup existing client .env
    if [ -f client/.env ]; then
        cp client/.env client/.env.backup
    fi

    # Create a temporary .env file for the test client
    echo "CLIENT_ID=$CLIENT_ID" > client/.env
    echo "SERVER_WS_URL=ws://$SERVER_HOST:8080" >> client/.env
    echo "LOG_LEVEL=info" >> client/.env

    cd client
    # Start npm in its own process group using setsid
    setsid npm start > ../logs/client-test.log 2>&1 &
    CLIENT_PID=$!
    cd ..

    # Wait for client to register
    sleep 5

    # Check if client is connected
    CONNECTED_CLIENTS=$(curl -s "http://$SERVER_HOST:$SERVER_PORT/api/v1/clients" | grep -o '"total":[0-9]*' | cut -d':' -f2)
    if [ "$CONNECTED_CLIENTS" -gt 0 ]; then
        print_pass "Client started successfully (PID: $CLIENT_PID, ID: $CLIENT_ID)"
        return 0
    else
        print_fail "Client failed to connect"
        return 1
    fi
}

# Stop client
stop_client() {
    if [ ! -z "$CLIENT_PID" ]; then
        print_info "Stopping client (PID: $CLIENT_PID)..."
        # Kill the entire process group (negative PID)
        kill -- -$CLIENT_PID 2>/dev/null || true
        wait $CLIENT_PID 2>/dev/null || true
        sleep 1
        print_pass "Client stopped"
    fi
}

# Stop server
stop_server() {
    if [ ! -z "$SERVER_PID" ]; then
        print_info "Stopping server (PID: $SERVER_PID)..."
        # Kill the entire process group (negative PID)
        kill -- -$SERVER_PID 2>/dev/null || true
        wait $SERVER_PID 2>/dev/null || true
        sleep 1
        print_pass "Server stopped"
    fi
}

# Cleanup function to stop both server and client
cleanup() {
    print_info "Cleaning up..."
    stop_client
    stop_server

    # Restore original client .env
    if [ -f client/.env.backup ]; then
        mv client/.env.backup client/.env
    fi

    # Clean up test file
    if [ -f "$HOME/data/file_to_download.txt" ]; then
        rm "$HOME/data/file_to_download.txt"
    fi

    print_pass "Cleanup complete"
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

# Wait for download to complete
wait_for_download() {
    local download_id="$1"
    local timeout="${2:-30}"  # Default 30 seconds timeout
    local elapsed=0

    print_info "Waiting for download to complete (timeout: ${timeout}s)..."

    while [ $elapsed -lt $timeout ]; do
        STATUS_RESPONSE=$(curl -s "http://$SERVER_HOST:$SERVER_PORT/api/v1/downloads/$download_id")
        STATUS=$(echo "$STATUS_RESPONSE" | grep -o '"status":"[^"]*' | cut -d'"' -f4)

        if [ "$STATUS" = "completed" ]; then
            print_pass "Download completed successfully"
            return 0
        elif [ "$STATUS" = "failed" ]; then
            print_fail "Download failed"
            echo "$STATUS_RESPONSE" >> "$LOG_FILE"
            return 1
        elif [ "$STATUS" = "cancelled" ]; then
            print_fail "Download cancelled"
            return 1
        fi

        # Show progress
        PROGRESS=$(echo "$STATUS_RESPONSE" | grep -o '"percentage":[0-9.]*' | cut -d':' -f2)
        if [ ! -z "$PROGRESS" ]; then
            print_info "Download progress: ${PROGRESS}%"
        fi

        sleep 2
        elapsed=$((elapsed + 2))
    done

    print_fail "Download timed out after ${timeout}s"
    return 1
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

    # Trap to ensure cleanup on exit
    trap cleanup EXIT

    # Start server
    if ! start_server; then
        exit 1
    fi

    # Start client
    if ! start_client; then
        exit 1
    fi
    
    # Test 1: Health Check
    run_test "Health Check" "curl -f -s http://$SERVER_HOST:$SERVER_PORT/api/v1/health"

    # Test 2: List Clients (should be empty initially)
    run_test "List Clients" "curl -f -s http://$SERVER_HOST:$SERVER_PORT/api/v1/clients"

    # Test 3: List Downloads (Empty)
    run_test "List Downloads (Empty)" "curl -f -s http://$SERVER_HOST:$SERVER_PORT/api/v1/downloads"

    # Test 4: Start Download
    # Note: The filePath should be a path that exists on the CLIENT machine
    TEST_FILE_PATH="data/file_to_download.txt"

    print_test "Start Download"
    DOWNLOAD_RESPONSE=$(curl -s -X POST "http://$SERVER_HOST:$SERVER_PORT/api/v1/downloads" \
        -H "Content-Type: application/json" \
        -d "{\"clientId\":\"$CLIENT_ID\",\"filePath\":\"$TEST_FILE_PATH\"}")

    DOWNLOAD_ID=$(echo "$DOWNLOAD_RESPONSE" | grep -o '"requestId":"[^"]*' | cut -d'"' -f4)

    if [ ! -z "$DOWNLOAD_ID" ]; then
        print_pass "Download started (ID: $DOWNLOAD_ID)"
        ((TESTS_PASSED++))

        # Test 5: Wait for Download to Complete
        if wait_for_download "$DOWNLOAD_ID" 30; then
            print_pass "Download completed"
            ((TESTS_PASSED++))
        else
            print_fail "Download did not complete"
            ((TESTS_FAILED++))
        fi

        # Test 6: Get Download Status
        run_test "Get Download Status" "curl -f -s http://$SERVER_HOST:$SERVER_PORT/api/v1/downloads/$DOWNLOAD_ID"

        # Test 7: List Downloads (With Data)
        run_test "List Downloads (With Data)" "curl -f -s http://$SERVER_HOST:$SERVER_PORT/api/v1/downloads"

        # Test 8: Verify Download Status is 'completed'
        print_test "Verify Download Status"
        FINAL_STATUS=$(curl -s "http://$SERVER_HOST:$SERVER_PORT/api/v1/downloads/$DOWNLOAD_ID" | grep -o '"status":"[^"]*' | cut -d'"' -f4)
        if [ "$FINAL_STATUS" = "completed" ]; then
            print_pass "Download status is 'completed'"
            ((TESTS_PASSED++))
        else
            print_fail "Download status is '$FINAL_STATUS', expected 'completed'"
            ((TESTS_FAILED++))
        fi

    else
        print_fail "Failed to start download: $DOWNLOAD_RESPONSE"
        ((TESTS_FAILED++))
    fi
    
    # Test 9: Error Handling - Non-existent Download ID (valid UUID v4 format)
    FAKE_UUID="12345678-1234-4234-a234-123456789012"
    run_test "Error Handling - Non-existent Download ID" "curl -s -w '%{http_code}' -o /dev/null http://$SERVER_HOST:$SERVER_PORT/api/v1/downloads/$FAKE_UUID | grep -q 404"

    # Test 10: Error Handling - Invalid UUID Format
    run_test "Error Handling - Invalid UUID Format" "curl -s -w '%{http_code}' -o /dev/null http://$SERVER_HOST:$SERVER_PORT/api/v1/downloads/invalid-id | grep -q 400"

    # Test 11: List Connected Clients
    print_test "List Connected Clients"
    CLIENTS_RESPONSE=$(curl -s "http://$SERVER_HOST:$SERVER_PORT/api/v1/clients")
    if echo "$CLIENTS_RESPONSE" | grep -q "$CLIENT_ID"; then
        print_pass "Client found in connected clients list"
        ((TESTS_PASSED++))
    else
        print_fail "Client not found in connected clients list"
        ((TESTS_FAILED++))
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
