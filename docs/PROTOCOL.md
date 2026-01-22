# Protocol Documentation

## Overview

This document defines the communication protocols used in the Silentmode Assessment system. It includes REST API endpoints, WebSocket message formats, and error handling conventions.

## Version Information

- **Current Version**: 1.0.0
- **Version Format**: Semantic Versioning (semver)
- **Backward Compatibility**: Maintained within major versions

## REST API Protocol

### Base URL
```
http://localhost:3000/api
```

### Content Types
- **Request**: `application/json`
- **Response**: `application/json`
- **Error**: `application/json`

### Authentication
Currently no authentication is implemented. Future versions will support:
- API Keys
- JWT Tokens
- OAuth 2.0

### Common Headers
```http
Content-Type: application/json
X-Client-ID: client-identifier
X-Request-ID: unique-request-id
X-Timestamp: Unix timestamp
```

### Response Format

#### Success Response
```json
{
  "success": true,
  "data": {
    // Response data
  },
  "meta": {
    "timestamp": 1640995200,
    "requestId": "req-123456",
    "version": "1.0.0"
  }
}
```

#### Error Response
```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human readable error message",
    "details": {
      // Additional error details
    }
  },
  "meta": {
    "timestamp": 1640995200,
    "requestId": "req-123456",
    "version": "1.0.0"
  }
}
```

## API Endpoints

### Health Check

#### GET /health
Check if the server is running.

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2023-01-01T00:00:00.000Z",
  "uptime": 3600,
  "version": "1.0.0"
}
```

### Client Management

#### POST /api/clients
Register a new client.

**Request:**
```json
{
  "name": "client-name",
  "type": "cli|web|mobile",
  "version": "1.0.0",
  "capabilities": ["retry", "resume", "parallel"]
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "client-123456",
    "name": "client-name",
    "type": "cli",
    "registeredAt": "2023-01-01T00:00:00.000Z",
    "status": "active"
  }
}
```

#### GET /api/clients
List all registered clients.

**Query Parameters:**
- `type` (optional): Filter by client type
- `status` (optional): Filter by status
- `limit` (optional): Maximum number of results
- `offset` (optional): Pagination offset

**Response:**
```json
{
  "success": true,
  "data": {
    "clients": [
      {
        "id": "client-123456",
        "name": "client-name",
        "type": "cli",
        "status": "active",
        "lastSeen": "2023-01-01T00:00:00.000Z"
      }
    ],
    "total": 1,
    "limit": 10,
    "offset": 0
  }
}
```

#### GET /api/clients/{id}
Get details of a specific client.

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "client-123456",
    "name": "client-name",
    "type": "cli",
    "version": "1.0.0",
    "status": "active",
    "registeredAt": "2023-01-01T00:00:00.000Z",
    "lastSeen": "2023-01-01T00:00:00.000Z",
    "capabilities": ["retry", "resume"],
    "downloads": {
      "total": 5,
      "active": 2,
      "completed": 3
    }
  }
}
```

### Download Management

#### POST /api/downloads
Initiate a new download.

**Request:**
```json
{
  "filename": "example.zip",
  "size": 104857600,
  "checksum": "sha256-hash",
  "metadata": {
    "contentType": "application/zip",
    "description": "Example file"
  }
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "download-123456",
    "filename": "example.zip",
    "size": 104857600,
    "status": "initiated",
    "createdAt": "2023-01-01T00:00:00.000Z",
    "chunkSize": 1048576,
    "totalChunks": 100,
    "websocketUrl": "ws://localhost:3000"
  }
}
```

#### GET /api/downloads
List all downloads.

**Query Parameters:**
- `status` (optional): Filter by status
- `clientId` (optional): Filter by client
- `limit` (optional): Maximum number of results
- `offset` (optional): Pagination offset

**Response:**
```json
{
  "success": true,
  "data": {
    "downloads": [
      {
        "id": "download-123456",
        "filename": "example.zip",
        "size": 104857600,
        "status": "downloading",
        "progress": 45.5,
        "createdAt": "2023-01-01T00:00:00.000Z"
      }
    ],
    "total": 1,
    "limit": 10,
    "offset": 0
  }
}
```

#### GET /api/downloads/{id}
Get download status and details.

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "download-123456",
    "filename": "example.zip",
    "size": 104857600,
    "status": "downloading",
    "progress": 45.5,
    "downloadedChunks": 45,
    "totalChunks": 100,
    "downloadedBytes": 47185920,
    "speed": 1048576,
    "eta": 55,
    "createdAt": "2023-01-01T00:00:00.000Z",
    "startedAt": "2023-01-01T00:00:05.000Z",
    "chunks": [
      {
        "number": 1,
        "status": "completed",
        "receivedAt": "2023-01-01T00:00:06.000Z"
      },
      {
        "number": 46,
        "status": "downloading",
        "attempts": 2
      }
    ]
  }
}
```

#### DELETE /api/downloads/{id}
Cancel or delete a download.

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "download-123456",
    "status": "cancelled",
    "cancelledAt": "2023-01-01T00:05:00.000Z",
    "reason": "user_request"
  }
}
```

## WebSocket Protocol

### Connection
```
ws://localhost:3000
```

### Connection Handshake
1. Client connects to WebSocket endpoint
2. Server sends welcome message:
```json
{
  "type": "welcome",
  "serverId": "server-123",
  "version": "1.0.0",
  "timestamp": 1640995200
}
```

### Message Format

All WebSocket messages follow this structure:
```json
{
  "type": "message-type",
  "id": "message-id",
  "timestamp": 1640995200,
  "data": {
    // Message-specific data
  }
}
```

### Client to Server Messages

#### Download Request
```json
{
  "type": "download",
  "id": "msg-123",
  "data": {
    "downloadId": "download-123456",
    "fromChunk": 1,
    "toChunk": 100
  }
}
```

#### Chunk Acknowledgment
```json
{
  "type": "ack",
  "id": "msg-124",
  "data": {
    "downloadId": "download-123456",
    "chunkNumber": 45,
    "received": true,
    "checksum": "chunk-checksum"
  }
}
```

#### Retry Request
```json
{
  "type": "retry",
  "id": "msg-125",
  "data": {
    "downloadId": "download-123456",
    "chunkNumber": 46,
    "attempt": 3,
    "reason": "timeout"
  }
}
```

#### Pause Download
```json
{
  "type": "pause",
  "id": "msg-126",
  "data": {
    "downloadId": "download-123456"
  }
}
```

#### Resume Download
```json
{
  "type": "resume",
  "id": "msg-127",
  "data": {
    "downloadId": "download-123456",
    "fromChunk": 46
  }
}
```

#### Ping
```json
{
  "type": "ping",
  "id": "msg-128",
  "data": {
    "timestamp": 1640995200
  }
}
```

### Server to Client Messages

#### Chunk Data
```json
{
  "type": "chunk",
  "id": "msg-200",
  "data": {
    "downloadId": "download-123456",
    "chunkNumber": 45,
    "totalChunks": 100,
    "data": "base64-encoded-chunk-data",
    "checksum": "sha256-chunk-hash",
    "compression": "none|gzip|deflate"
  }
}
```

#### Download Status Update
```json
{
  "type": "status",
  "id": "msg-201",
  "data": {
    "downloadId": "download-123456",
    "status": "downloading|paused|completed|failed",
    "progress": 45.5,
    "speed": 1048576,
    "eta": 55
  }
}
```

#### Error Notification
```json
{
  "type": "error",
  "id": "msg-202",
  "data": {
    "downloadId": "download-123456",
    "code": "CHUNK_NOT_FOUND",
    "message": "Requested chunk is not available",
    "chunkNumber": 46,
    "retryable": true
  }
}
```

#### Pong
```json
{
  "type": "pong",
  "id": "msg-203",
  "data": {
    "timestamp": 1640995200,
    "originalTimestamp": 1640995195
  }
}
```

#### Download Complete
```json
{
  "type": "complete",
  "id": "msg-204",
  "data": {
    "downloadId": "download-123456",
    "status": "completed",
    "totalBytes": 104857600,
    "totalChunks": 100,
    "checksum": "sha256-file-hash",
    "duration": 120
  }
}
```

## Error Codes

### HTTP Status Codes
- `200 OK` - Successful request
- `201 Created` - Resource created
- `400 Bad Request` - Invalid request data
- `401 Unauthorized` - Authentication required
- `403 Forbidden` - Access denied
- `404 Not Found` - Resource not found
- `409 Conflict` - Resource conflict
- `429 Too Many Requests` - Rate limit exceeded
- `500 Internal Server Error` - Server error
- `503 Service Unavailable` - Server unavailable

### Application Error Codes

#### Client Errors
- `CLIENT_NOT_FOUND` - Client ID not found
- `CLIENT_ALREADY_EXISTS` - Client already registered
- `CLIENT_INVALID_TYPE` - Invalid client type

#### Download Errors
- `DOWNLOAD_NOT_FOUND` - Download ID not found
- `DOWNLOAD_ALREADY_EXISTS` - Download already exists
- `DOWNLOAD_EXPIRED` - Download has expired
- `DOWNLOAD_CANCELLED` - Download was cancelled
- `DOWNLOAD_LIMIT_EXCEEDED` - Too many active downloads

#### Chunk Errors
- `CHUNK_NOT_FOUND` - Chunk not found
- `CHUNK_CORRUPTED` - Chunk data is corrupted
- `CHUNK_TIMEOUT` - Chunk delivery timeout
- `CHUNK_SIZE_EXCEEDED` - Chunk too large
- `CHUNK_INVALID_RANGE` - Invalid chunk range

#### System Errors
- `SERVER_OVERLOADED` - Server at capacity
- `STORAGE_FULL` - No available storage
- `NETWORK_ERROR` - Network connectivity issue
- `INTERNAL_ERROR` - Unexpected server error

## Retry Logic

### Retry Strategy
1. **Exponential Backoff**: Delay = baseDelay * (2 ^ attempt)
2. **Maximum Attempts**: Default 3, configurable
3. **Maximum Delay**: 30 seconds
4. **Jitter**: ±25% random variation

### Retry Conditions
- Network timeout
- Connection lost
- Server error (5xx)
- Chunk not found (temporary)
- Rate limit exceeded

### No Retry Conditions
- Authentication failure
- Invalid request (4xx)
- Download cancelled
- File not found
- Chunk corrupted (after max attempts)

## Rate Limiting

### Client Limits
- **Connections**: 5 per client
- **Downloads**: 10 concurrent per client
- **Requests**: 100 per minute per client
- **Chunk Requests**: 1000 per minute per download

### Global Limits
- **Total Connections**: 1000
- **Total Downloads**: 500 concurrent
- **Total Requests**: 10000 per minute

## Security Considerations

### Input Validation
- All inputs must be validated
- File paths must be sanitized
- Size limits enforced
- Type checking required

### Data Protection
- All communications over TLS
- Sensitive data encrypted
- Checksums for integrity
- No credentials in logs

### Access Control
- Client registration required
- Download authorization
- Resource isolation
- Audit logging

## Version Compatibility

### Protocol Versioning
- Major version changes break compatibility
- Minor versions add features
- Patch versions fix bugs

### Backward Compatibility
- Server supports previous major version for 6 months
- Client must negotiate version on connection
- Graceful degradation for older clients

### Migration Path
1. Announce upcoming changes
2. Release compatible version
3. Deprecate old version
4. Remove old version

## Testing Protocol

### Unit Tests
- Message serialization/deserialization
- Error code handling
- Validation logic

### Integration Tests
- API endpoint responses
- WebSocket message flow
- Error scenarios

### Load Tests
- Concurrent connections
- Message throughput
- Memory usage

## Compliance

### Standards
- RFC 6455 (WebSocket)
- RFC 7231 (HTTP)
- JSON Schema validation
- Semantic Versioning

### Regulations
- GDPR (data protection)
- CCPA (privacy)
- Industry-specific requirements
