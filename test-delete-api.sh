#!/bin/bash

# Test script for DELETE /api/v1/downloads/:requestId endpoint

echo "Starting server..."
cd server && npm start &
SERVER_PID=$!

# Wait for server to start
sleep 3

echo "Creating a test download..."
# Create a download request
CREATE_RESPONSE=$(curl -s -X POST http://localhost:3000/api/v1/downloads \
  -H "Content-Type: application/json" \
  -d '{
    "clientId": "test-client-123",
    "filePath": "/test/file.txt"
  }')

echo "Create response: $CREATE_RESPONSE"

# Extract request ID from response
REQUEST_ID=$(echo $CREATE_RESPONSE | grep -o '"requestId":"[^"]*' | cut -d'"' -f4)

if [ -z "$REQUEST_ID" ]; then
  echo "Failed to create download"
  kill $SERVER_PID
  exit 1
fi

echo "Created download with ID: $REQUEST_ID"

# Test 1: Cancel the download
echo -e "\nTest 1: Cancelling download..."
CANCEL_RESPONSE=$(curl -s -X DELETE http://localhost:3000/api/v1/downloads/$REQUEST_ID)
echo "Cancel response: $CANCEL_RESPONSE"

# Verify response format
SUCCESS=$(echo $CANCEL_RESPONSE | grep -o '"success":true')
if [ -n "$SUCCESS" ]; then
  echo "✓ Test 1 passed: Download cancelled successfully"
else
  echo "✗ Test 1 failed: Download not cancelled"
fi

# Test 2: Try to cancel again (should return 404 or 409)
echo -e "\nTest 2: Trying to cancel already cancelled download..."
CANCEL_AGAIN_RESPONSE=$(curl -s -w "\n%{http_code}" -X DELETE http://localhost:3000/api/v1/downloads/$REQUEST_ID)
HTTP_CODE=$(echo "$CANCEL_AGAIN_RESPONSE" | tail -n1)
RESPONSE_BODY=$(echo "$CANCEL_AGAIN_RESPONSE" | head -n-1)

echo "HTTP Code: $HTTP_CODE"
echo "Response: $RESPONSE_BODY"

if [ "$HTTP_CODE" = "409" ] || [ "$HTTP_CODE" = "404" ]; then
  echo "✓ Test 2 passed: Correctly rejected cancel of completed download"
else
  echo "✗ Test 2 failed: Should have returned 409 or 404"
fi

# Test 3: Try to cancel non-existent download
echo -e "\nTest 3: Trying to cancel non-existent download..."
NOT_FOUND_RESPONSE=$(curl -s -w "\n%{http_code}" -X DELETE http://localhost:3000/api/v1/downloads/non-existent-id)
HTTP_CODE=$(echo "$NOT_FOUND_RESPONSE" | tail -n1)
RESPONSE_BODY=$(echo "$NOT_FOUND_RESPONSE" | head -n-1)

echo "HTTP Code: $HTTP_CODE"
echo "Response: $RESPONSE_BODY"

if [ "$HTTP_CODE" = "404" ]; then
  echo "✓ Test 3 passed: Correctly returned 404 for non-existent download"
else
  echo "✗ Test 3 failed: Should have returned 404"
fi

# Clean up
echo -e "\nStopping server..."
kill $SERVER_PID

echo -e "\nAll tests completed!"
