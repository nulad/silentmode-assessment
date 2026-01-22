#!/bin/bash

# Test script for POST /api/v1/downloads endpoint

echo "Testing POST /api/v1/downloads endpoint..."
echo

# Base URL
BASE_URL="http://localhost:3000"

# Test 1: Missing required fields
echo "Test 1: Missing required fields"
echo "Request: POST /api/v1/downloads with empty body"
curl -X POST "$BASE_URL/api/v1/downloads" \
  -H "Content-Type: application/json" \
  -d '{}' \
  -w "\nStatus: %{http_code}\n\n"

# Test 2: Missing clientId
echo "Test 2: Missing clientId"
echo "Request: POST /api/v1/downloads with only filePath"
curl -X POST "$BASE_URL/api/v1/downloads" \
  -H "Content-Type: application/json" \
  -d '{"filePath": "/home/user/file.txt"}' \
  -w "\nStatus: %{http_code}\n\n"

# Test 3: Missing filePath
echo "Test 3: Missing filePath"
echo "Request: POST /api/v1/downloads with only clientId"
curl -X POST "$BASE_URL/api/v1/downloads" \
  -H "Content-Type: application/json" \
  -d '{"clientId": "test-client"}' \
  -w "\nStatus: %{http_code}\n\n"

# Test 4: Client not connected
echo "Test 4: Client not connected"
echo "Request: POST /api/v1/downloads with non-existent client"
curl -X POST "$BASE_URL/api/v1/downloads" \
  -H "Content-Type: application/json" \
  -d '{"clientId": "non-existent-client", "filePath": "/home/user/file.txt"}' \
  -w "\nStatus: %{http_code}\n\n"

# Test 5: Valid request (requires connected client)
echo "Test 5: Valid request (requires connected client)"
echo "Request: POST /api/v1/downloads with valid data"
echo "Note: This will return 404 unless a client is connected"
curl -X POST "$BASE_URL/api/v1/downloads" \
  -H "Content-Type: application/json" \
  -d '{"clientId": "test-client-123", "filePath": "/home/user/test.txt"}' \
  -w "\nStatus: %{http_code}\n\n"

echo "Testing complete!"
echo
echo "To test with a connected client:"
echo "1. Start the server: npm start"
echo "2. Connect a client (e.g., run the client application)"
echo "3. Run this script again"
