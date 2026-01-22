# SilentMode REST API - POST /api/v1/downloads

## Overview

This endpoint initiates a file download from a connected client. It creates a download request and sends a DOWNLOAD_REQUEST message to the specified client via WebSocket.

## Endpoint

```
POST /api/v1/downloads
```

## Request Body

```json
{
  "clientId": "string",
  "filePath": "string"
}
```

### Fields

- **clientId** (required): The ID of the client that has the file to download
- **filePath** (required): The absolute path of the file to download from the client

## Response

### 202 Accepted - Download initiated

```json
{
  "success": true,
  "requestId": "uuid",
  "clientId": "string",
  "filePath": "string",
  "status": "pending"
}
```

### 400 Bad Request - Missing fields

```json
{
  "success": false,
  "error": "Missing required fields: clientId, filePath"
}
```

### 404 Not Found - Client not connected

```json
{
  "success": false,
  "error": "Client not connected"
}
```

### 409 Conflict - Download already in progress

```json
{
  "success": false,
  "error": "Download already in progress",
  "requestId": "uuid"
}
```

### 500 Internal Server Error - Communication failed

```json
{
  "success": false,
  "error": "Failed to communicate with client"
}
```

## Behavior

1. **Validation**: The endpoint validates that both `clientId` and `filePath` are provided
2. **Client Check**: Verifies the specified client is currently connected via WebSocket
3. **Duplicate Check**: Ensures no active download exists for the same client and file path
4. **Download Creation**: Creates a new download request with a unique UUID
5. **WebSocket Message**: Sends a DOWNLOAD_REQUEST message to the client
6. **Response**: Returns 202 with the request details if successful

## Download Flow

1. Client receives DOWNLOAD_REQUEST message
2. Client responds with DOWNLOAD_ACK (success/failure)
3. If successful, client starts sending FILE_CHUNK messages
4. Client sends DOWNLOAD_COMPLETE when all chunks are sent
5. Server assembles the file and verifies checksum

## Testing

### Manual Testing

Run the test script:
```bash
./test-post-downloads.sh
```

### Automated Testing

Run the Jest tests:
```bash
npm test
```

## Example Usage

```bash
curl -X POST http://localhost:3000/api/v1/downloads \
  -H "Content-Type: application/json" \
  -d '{
    "clientId": "restaurant-001",
    "filePath": "/home/user/receipts/order123.pdf"
  }'
```

## Related Endpoints

- `GET /api/v1/downloads` - List all downloads
- `GET /api/v1/downloads/:requestId` - Get download status
- `DELETE /api/v1/downloads/:requestId` - Cancel download
- `GET /api/v1/clients` - List connected clients
- `GET /api/v1/health` - Health check
