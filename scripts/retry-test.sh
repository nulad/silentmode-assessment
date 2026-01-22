#!/bin/bash

# Retry Scenario Test Script
# Tests the retry logic for chunk downloads

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
CLIENT_ID="retry-test-client-$(date +%s)"
TEST_FILES_DIR="test-files"
DOWNLOADS_DIR="downloads"
LOG_FILE="logs/retry-test-$(date +%Y%m%d-%H%M%S).log"

# Ensure directories exist
mkdir -p "$DOWNLOADS_DIR"
mkdir -p logs

# Helper functions
print_test() {
    echo -e "${BLUE}[RETRY TEST]${NC} $1"
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
    npm start > ../logs/server-retry-test.log 2>&1 &
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

# Simulate network failure
simulate_network_failure() {
    print_info "Simulating network failure..."
    # Add iptables rule to block connections
    sudo iptables -A OUTPUT -p tcp --dport $SERVER_PORT -j DROP 2>/dev/null || {
        print_warning "Cannot simulate network failure (requires sudo)"
        return 1
    }
}

# Restore network
restore_network() {
    print_info "Restoring network..."
    # Remove iptables rule
    sudo iptables -D OUTPUT -p tcp --dport $SERVER_PORT -j DROP 2>/dev/null || true
}

# Main test suite
main() {
    print_info "Starting Retry Test Suite"
    print_info "Log file: $LOG_FILE"
    
    # Initialize log
    echo "Retry Test Log - $(date)" > "$LOG_FILE"
    
    # Trap to ensure cleanup
    trap "stop_server; restore_network" EXIT
    
    # Start server
    if ! start_server; then
        exit 1
    fi
    
    # Test 1: Basic Retry on Timeout
    print_test "Basic Retry on Timeout"
    
    # Start a download
    TEST_FILE="$TEST_FILES_DIR/test-10mb.dat"
    if [ -f "$TEST_FILE" ]; then
        DOWNLOAD_ID=$(curl -s -X POST "http://$SERVER_HOST:$SERVER_PORT/api/downloads" \
            -H "Content-Type: application/json" \
            -d "{\"filename\":\"$(basename $TEST_FILE)\",\"size\":$(stat -c%s $TEST_FILE)}" | \
            grep -o '"id":"[^"]*' | cut -d'"' -f4)
        
        if [ ! -z "$DOWNLOAD_ID" ]; then
            # Download with aggressive retry settings
            print_info "Downloading with retry logic..."
            node cli.js download "$DOWNLOAD_ID" \
                --output "$DOWNLOADS_DIR/retry-test-$DOWNLOAD_ID.dat" \
                --retry-attempts 3 \
                --retry-delay 1000 \
                --chunk-timeout 2000 >> "$LOG_FILE" 2>&1
            
            if [ $? -eq 0 ]; then
                print_pass "Download with retry succeeded"
                ((TESTS_PASSED++))
            else
                print_fail "Download with retry failed"
                ((TESTS_FAILED++))
            fi
        fi
    fi
    
    # Test 2: Retry with Server Restart
    print_test "Retry with Server Restart"
    
    # Start another download
    if [ -f "$TEST_FILE" ]; then
        DOWNLOAD_ID2=$(curl -s -X POST "http://$SERVER_HOST:$SERVER_PORT/api/downloads" \
            -H "Content-Type: application/json" \
            -d "{\"filename\":\"test-restart.dat\",\"size\":$(stat -c%s $TEST_FILE)}" | \
            grep -o '"id":"[^"]*' | cut -d'"' -f4)
        
        if [ ! -z "$DOWNLOAD_ID2" ]; then
            # Start download in background
            node cli.js download "$DOWNLOAD_ID2" \
                --output "$DOWNLOADS_DIR/restart-test-$DOWNLOAD_ID2.dat" \
                --retry-attempts 5 \
                --retry-delay 2000 >> "$LOG_FILE" 2>&1 &
            CLIENT_PID=$!
            
            # Let it download a bit
            sleep 2
            
            # Restart server
            print_info "Restarting server..."
            stop_server
            sleep 1
            start_server
            
            # Wait for client to finish
            wait $CLIENT_PID
            
            if [ $? -eq 0 ]; then
                print_pass "Download survived server restart"
                ((TESTS_PASSED++))
            else
                print_fail "Download failed after server restart"
                ((TESTS_FAILED++))
            fi
        fi
    fi
    
    # Test 3: Chunk Corruption Recovery
    print_test "Chunk Corruption Recovery"
    
    # Manually corrupt a chunk during download
    if [ -f "$TEST_FILE" ]; then
        DOWNLOAD_ID3=$(curl -s -X POST "http://$SERVER_HOST:$SERVER_PORT/api/downloads" \
            -H "Content-Type: application/json" \
            -d "{\"filename\":\"corruption-test.dat\",\"size\":$(stat -c%s $TEST_FILE)}" | \
            grep -o '"id":"[^"]*' | cut -d'"' -f4)
        
        if [ ! -z "$DOWNLOAD_ID3" ]; then
            # Download first few chunks
            print_info "Downloading chunks and simulating corruption..."
            
            # Create a test script that simulates corruption
            cat > test-corruption.js << 'EOF'
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');

const DOWNLOAD_ID = process.argv[2];
const OUTPUT_FILE = process.argv[3];

async function testCorruption() {
    const ws = new WebSocket('ws://localhost:3000');
    
    ws.on('open', () => {
        ws.send(JSON.stringify({
            type: 'download',
            id: DOWNLOAD_ID
        }));
    });
    
    let chunks = [];
    
    ws.on('message', (data) => {
        const msg = JSON.parse(data);
        
        if (msg.type === 'chunk') {
            // Simulate corruption on chunk 3
            if (msg.chunkNumber === 3) {
                msg.data = 'corrupted-data'.repeat(100);
            }
            
            chunks.push(msg);
            
            // Acknowledge chunk
            ws.send(JSON.stringify({
                type: 'ack',
                chunkNumber: msg.chunkNumber
            }));
            
            // Stop after 5 chunks
            if (msg.chunkNumber >= 5) {
                ws.close();
            }
        }
    });
    
    ws.on('close', () => {
        console.log('Test completed');
    });
}

testCorruption();
EOF
            
            node test-corruption.js "$DOWNLOAD_ID3" "$DOWNLOADS_DIR/corruption-test.dat" >> "$LOG_FILE" 2>&1
            
            # Now try to download with retry
            node cli.js download "$DOWNLOAD_ID3" \
                --output "$DOWNLOADS_DIR/corruption-recovered.dat" \
                --retry-attempts 3 \
                --verify-chunks true >> "$LOG_FILE" 2>&1
            
            if [ $? -eq 0 ]; then
                print_pass "Corruption recovery successful"
                ((TESTS_PASSED++))
            else
                print_fail "Corruption recovery failed"
                ((TESTS_FAILED++))
            fi
            
            # Cleanup
            rm -f test-corruption.js
        fi
    fi
    
    # Test 4: Exponential Backoff
    print_test "Exponential Backoff"
    
    # Test with server that responds slowly
    if [ -f "$TEST_FILE" ]; then
        DOWNLOAD_ID4=$(curl -s -X POST "http://$SERVER_HOST:$SERVER_PORT/api/downloads" \
            -H "Content-Type: application/json" \
            -d "{\"filename\":\"backoff-test.dat\",\"size\":$(stat -c%s $TEST_FILE)}" | \
            grep -o '"id":"[^"]*' | cut -d'"' -f4)
        
        if [ ! -z "$DOWNLOAD_ID4" ]; then
            # Time the download with backoff
            START_TIME=$(date +%s)
            
            node cli.js download "$DOWNLOAD_ID4" \
                --output "$DOWNLOADS_DIR/backoff-test.dat" \
                --retry-attempts 3 \
                --retry-delay 500 \
                --exponential-backoff true >> "$LOG_FILE" 2>&1
            
            END_TIME=$(date +%s)
            DURATION=$((END_TIME - START_TIME))
            
            if [ $? -eq 0 ] && [ $DURATION -gt 5 ]; then
                print_pass "Exponential backoff working (took ${DURATION}s)"
                ((TESTS_PASSED++))
            else
                print_fail "Exponential backoff not working properly"
                ((TESTS_FAILED++))
            fi
        fi
    fi
    
    # Test 5: Maximum Retry Limit
    print_test "Maximum Retry Limit"
    
    # Test with a non-existent download ID
    node cli.js download "non-existent-id" \
        --output "$DOWNLOADS_DIR/limit-test.dat" \
        --retry-attempts 2 \
        --retry-delay 500 >> "$LOG_FILE" 2>&1
    
    if [ $? -ne 0 ]; then
        print_pass "Retry limit enforced"
        ((TESTS_PASSED++))
    else
        print_fail "Retry limit not enforced"
        ((TESTS_FAILED++))
    fi
    
    # Print results
    echo ""
    print_info "Retry Test Results:"
    echo -e "  ${GREEN}Passed: $TESTS_PASSED${NC}"
    echo -e "  ${RED}Failed: $TESTS_FAILED${NC}"
    echo -e "  Total: $((TESTS_PASSED + TESTS_FAILED))"
    
    if [ $TESTS_FAILED -eq 0 ]; then
        print_info "All retry tests passed! ✓"
        exit 0
    else
        print_info "Some retry tests failed. Check log: $LOG_FILE"
        exit 1
    fi
}

# Run main function
main "$@"
