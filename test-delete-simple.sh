#!/bin/bash

# Simple test for DELETE /api/v1/downloads/:requestId endpoint

echo "Testing DELETE /api/v1/downloads/:requestId endpoint..."

# First, let's check if the server is running
echo -e "\n1. Checking server health..."
HEALTH_RESPONSE=$(curl -s http://localhost:3000/api/v1/health)
echo "Health check: $HEALTH_RESPONSE"

# Test 1: Try to delete a non-existent download
echo -e "\n2. Testing DELETE with non-existent download (should return 404)..."
NOT_FOUND_RESPONSE=$(curl -s -w "\nHTTP_CODE:%{http_code}" -X DELETE http://localhost:3000/api/v1/downloads/non-existent-id)
echo "Response: $NOT_FOUND_RESPONSE"

# Extract HTTP code
HTTP_CODE=$(echo "$NOT_FOUND_RESPONSE" | grep "HTTP_CODE:" | cut -d: -f2)
RESPONSE_BODY=$(echo "$NOT_FOUND_RESPONSE" | sed '/HTTP_CODE:/d')

if [ "$HTTP_CODE" = "404" ]; then
  echo "✓ Test 1 passed: Correctly returned 404 for non-existent download"
  echo "  Response body: $RESPONSE_BODY"
else
  echo "✗ Test 1 failed: Expected 404, got $HTTP_CODE"
fi

# Test 2: Let's create a download first, then cancel it
echo -e "\n3. Creating a test download..."
# We need to simulate a download - let's check what downloads exist first
DOWNLOADS_RESPONSE=$(curl -s http://localhost:3000/api/v1/downloads)
echo "Existing downloads: $DOWNLOADS_RESPONSE"

# For now, let's just verify the endpoint exists and handles requests correctly
echo -e "\n4. Testing DELETE with an invalid ID format..."
INVALID_RESPONSE=$(curl -s -w "\nHTTP_CODE:%{http_code}" -X DELETE http://localhost:3000/api/v1/downloads/)
echo "Response: $INVALID_RESPONSE"

HTTP_CODE=$(echo "$INVALID_RESPONSE" | grep "HTTP_CODE:" | cut -d: -f2)
if [ "$HTTP_CODE" = "404" ]; then
  echo "✓ Test 2 passed: Correctly returned 404 for missing ID"
else
  echo "✗ Test 2 failed: Expected 404, got $HTTP_CODE"
fi

echo -e "\n✅ Basic endpoint tests completed!"
echo "Note: Full end-to-end testing requires a connected WebSocket client"
