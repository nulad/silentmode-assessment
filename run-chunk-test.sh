#!/bin/bash

# Start server in background
echo "Starting server..."
cd /home/nulad/repo/nulad/silentmode-assessment/server
npm start > ../server.log 2>&1 &
SERVER_PID=$!

# Wait for server to start
sleep 2

# Start client in background
echo "Starting client..."
cd /home/nulad/repo/nulad/silentmode-assessment/client
CLIENT_ID=test-client-12345 npm start > ../client.log 2>&1 &
CLIENT_PID=$!

# Wait for client to register
sleep 3

# Run test
echo "Running FILE_CHUNK test..."
cd /home/nulad/repo/nulad/silentmode-assessment
node test-file-chunk.js

# Cleanup
kill $SERVER_PID $CLIENT_PID 2>/dev/null
echo "Test completed. Check server.log and client.log for details."
