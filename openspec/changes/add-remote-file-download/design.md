# Design: Remote File Download System

## Context

The system involves a cloud-hosted server and multiple on-premise clients behind NAT/firewalls. Since clients cannot accept incoming connections, the server cannot directly reach them. This is a common challenge in IoT and distributed systems.

**Stakeholders**: Operations team (triggering downloads), DevOps (deployment), Restaurant staff (client deployment)

**Constraints**:
- Clients are behind NAT/private networks
- File size is approximately 100MB
- Downloads must be server-initiated (on-demand)
- Must work with standard firewall configurations (outbound connections allowed)

## Goals / Non-Goals

**Goals**:
- Enable server to download `$HOME/file_to_download.txt` from any connected client
- Support triggering via REST API and CLI
- Handle ~100MB files efficiently with chunked transfer
- Track connected clients for operational visibility
- Automatic retry for failed chunks

**Non-Goals**:
- End-to-end encryption (out of scope for MVP)
- Client-initiated uploads (reverse direction)
- File compression during transfer
- Resume interrupted downloads across server restarts
- Authentication (deferred to production enhancement)

## Architecture

```
┌─────────────────────────────────────┐         ┌──────────────────────────────┐
│         Cloud Server                │         │    On-Premise Client         │
│                                     │         │    (behind NAT)              │
│  ┌─────────────────────────────┐    │         │                              │
│  │ WebSocket Server (:8080)    │◄───┼─────────┼── Outbound WS connection     │
│  │ - Client Registry           │    │         │                              │
│  │ - Heartbeat (PING/PONG)     │    │         │  ┌────────────────────────┐  │
│  └─────────────┬───────────────┘    │         │  │ WebSocket Client       │  │
│                │                    │         │  │ - Auto-reconnect       │  │
│  ┌─────────────▼───────────────┐    │         │  │ - Registration         │  │
│  │ Download Manager            │    │         │  └───────────┬────────────┘  │
│  │ - Request orchestration     │    │         │              │               │
│  │ - Chunk tracking            │    │         │  ┌───────────▼────────────┐  │
│  │ - Retry logic               │    │         │  │ File Handler           │  │
│  └─────────────┬───────────────┘    │         │  │ - Stream reading       │  │
│                │                    │         │  │ - Chunking (1MB)       │  │
│  ┌─────────────▼───────────────┐    │         │  │ - SHA-256 checksum     │  │
│  │ REST API Server (:3000)     │    │         │  └────────────────────────┘  │
│  │ /api/v1/health              │    │         │                              │
│  │ /api/v1/clients             │    │         │  File: $HOME/file_to_download.txt
│  │ /api/v1/downloads           │    │         │                              │
│  └─────────────────────────────┘    │         └──────────────────────────────┘
│                                     │
│  ┌─────────────────────────────┐    │
│  │ CLI Tool (silentmode)       │    │
│  │ - download <clientId>       │    │
│  │ - clients list              │    │
│  │ - downloads status          │    │
│  └─────────────────────────────┘    │
│                                     │
└─────────────────────────────────────┘
```

## Technology Stack

| Component | Technology | Rationale |
|-----------|------------|-----------|
| Runtime | Node.js 18+ | Familiar ecosystem, async I/O |
| Language | JavaScript | No build step required |
| WebSocket | `ws` | Battle-tested, minimal dependencies |
| HTTP Server | Express | De-facto standard for Node.js APIs |
| CLI | Commander | Standard for Node.js CLI tools |
| Logging | Winston | Structured logging, multiple transports |
| Progress | cli-progress, ora | Good CLI UX |
| Output | cli-table3, chalk | Formatted terminal output |

## Decisions

### Decision 1: WebSocket for Reverse Connection

**What**: Clients establish and maintain WebSocket connections to the server.

**Why**:
- Works through NAT/firewalls (outbound connection from client)
- Bidirectional communication over single connection
- Native support in Node.js ecosystem
- Lower overhead than HTTP long-polling

**Alternatives considered**:
- Long polling: Higher latency, more overhead
- gRPC: Better performance but more complex setup
- MQTT: Adds broker infrastructure dependency

### Decision 2: Chunked File Transfer (1MB chunks)

**What**: Split file into 1MB chunks, transfer sequentially over WebSocket.

**Why**:
- WebSocket messages have practical size limits
- Enables progress tracking
- Allows for retry of individual chunks
- Manageable memory footprint
- 1MB balances network overhead vs memory usage

### Decision 3: SHA-256 Checksums

**What**: Every chunk includes SHA-256 checksum; final file verified with full checksum.

**Why**:
- Detect corruption during transfer
- Enable targeted retry of corrupted chunks
- Verify complete file integrity

### Decision 4: Exponential Backoff Retry

**What**: Failed chunks retry with exponential backoff (1s → 2s → 4s), max 3 attempts.

**Why**:
- Handles transient network issues automatically
- Prevents overwhelming recovering connections
- Bounded retry prevents infinite loops

### Decision 5: Client Identification

**What**: Each client provides a unique `clientId` on connection (e.g., `restaurant-001`).

**Why**:
- Simple to implement and understand
- Operators can use meaningful names
- No need for complex discovery protocols

## File Structure

```
/
├── server/
│   ├── package.json
│   ├── .env.example
│   ├── src/
│   │   ├── index.js                 # Main entry point
│   │   ├── websocket-server.js      # WebSocket connection manager
│   │   ├── api-server.js            # REST API server (Express)
│   │   ├── download-manager.js      # Download orchestration & state
│   │   ├── client-registry.js       # Connected clients tracking
│   │   ├── chunk-manager.js         # Chunk receiving, validation, retry
│   │   └── utils/
│   │       ├── logger.js            # Winston logger
│   │       ├── file-utils.js        # File I/O helpers
│   │       └── checksum.js          # SHA-256 utilities
│   ├── cli.js                       # CLI tool entry point
│   └── downloads/                   # Downloaded files (auto-created)
├── client/
│   ├── package.json
│   ├── .env.example
│   ├── src/
│   │   ├── index.js                 # Main entry point
│   │   ├── websocket-client.js      # WebSocket connection handler
│   │   ├── file-handler.js          # File reading and chunking
│   │   └── config.js                # Configuration loader
├── shared/
│   └── protocol.js                  # Message type constants
├── scripts/
│   ├── generate-test-file.js        # Generate 100MB test file
│   └── setup.sh                     # Setup script
├── docs/
│   ├── openapi.yaml                 # OpenAPI 3.0 specification
│   ├── ARCHITECTURE.md              # Architecture documentation
│   └── PROTOCOL.md                  # WebSocket protocol documentation
├── README.md
└── .gitignore
```

## WebSocket Protocol

### Message Types

| Type | Direction | Purpose |
|------|-----------|---------|
| REGISTER | Client → Server | Client registration with clientId |
| REGISTER_ACK | Server → Client | Registration acknowledgement |
| DOWNLOAD_REQUEST | Server → Client | Request file download |
| DOWNLOAD_ACK | Client → Server | Acknowledge request, report file size |
| FILE_CHUNK | Client → Server | Send file chunk with checksum |
| RETRY_CHUNK | Server → Client | Request re-send of specific chunk |
| DOWNLOAD_COMPLETE | Client → Server | All chunks sent, final checksum |
| CANCEL_DOWNLOAD | Server → Client | Cancel in-progress download |
| ERROR | Both | Error notification |
| PING/PONG | Both | Heartbeat (30s interval) |

### Message Examples

**Registration:**
```json
{ "type": "REGISTER", "clientId": "restaurant-001", "timestamp": "...", "metadata": { "version": "1.0.0" } }
{ "type": "REGISTER_ACK", "success": true, "message": "Registration successful" }
```

**Download Flow:**
```json
{ "type": "DOWNLOAD_REQUEST", "requestId": "req-abc-123", "filePath": "/home/user/file_to_download.txt", "chunkSize": 1048576 }
{ "type": "DOWNLOAD_ACK", "requestId": "req-abc-123", "success": true, "fileSize": 104857600, "totalChunks": 100, "fileChecksum": "sha256..." }
{ "type": "FILE_CHUNK", "requestId": "req-abc-123", "chunkIndex": 0, "data": "base64...", "checksum": "sha256...", "size": 1048576 }
{ "type": "DOWNLOAD_COMPLETE", "requestId": "req-abc-123", "totalChunks": 100, "checksum": "sha256..." }
```

**Retry:**
```json
{ "type": "RETRY_CHUNK", "requestId": "req-abc-123", "chunkIndex": 42, "attempt": 2, "reason": "CHECKSUM_FAILED" }
```

## REST API Endpoints

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | /api/v1/health | Server health check |
| GET | /api/v1/clients | List connected clients |
| GET | /api/v1/clients/:clientId | Get client details |
| POST | /api/v1/downloads | Initiate download |
| GET | /api/v1/downloads | List all downloads |
| GET | /api/v1/downloads/:requestId | Get download status |
| DELETE | /api/v1/downloads/:requestId | Cancel download |

## Error Codes

| Code | Description | Retryable |
|------|-------------|-----------|
| CLIENT_NOT_FOUND | Client ID does not exist | No |
| CLIENT_NOT_CONNECTED | Client is not connected | Wait for reconnect |
| FILE_NOT_FOUND | File does not exist on client | No |
| FILE_READ_ERROR | Error reading file | Maybe |
| PERMISSION_DENIED | No permission to read file | No |
| DOWNLOAD_IN_PROGRESS | Download already active | No |
| DOWNLOAD_TIMEOUT | Exceeded timeout | Yes |
| CHUNK_CHECKSUM_FAILED | Chunk validation failed | Yes (auto) |
| CHUNK_TRANSFER_FAILED | Failed after max retries | No |

## Configuration

### Server (.env)
```bash
PORT=3000
WS_PORT=8080
DOWNLOAD_DIR=./downloads
CHUNK_SIZE=1048576              # 1MB
MAX_CHUNK_RETRY_ATTEMPTS=3
CHUNK_RETRY_DELAY=1000          # 1s
HEARTBEAT_INTERVAL=30000        # 30s
DOWNLOAD_TIMEOUT=300000         # 5min
LOG_LEVEL=info
```

### Client (.env)
```bash
CLIENT_ID=restaurant-001
SERVER_WS_URL=ws://localhost:8080
RECONNECT_INTERVAL=5000
MAX_RECONNECT_ATTEMPTS=10
HEARTBEAT_INTERVAL=30000
LOG_LEVEL=info
```

## Risks / Trade-offs

| Risk | Mitigation |
|------|------------|
| Connection drops during transfer | Automatic chunk retry; client reconnects |
| Large file causes memory pressure | Stream chunks directly to disk |
| Client impersonation | Out of scope for MVP; add auth tokens in production |
| Server restart loses state | Manual retry required; consider Redis for persistence |
| Concurrent download overload | Limit to 1 active download per client |

## Open Questions (Resolved)

1. **File storage**: Store in `./downloads/<clientId>-<timestamp>.txt`
2. **Authentication**: Deferred; use simple client IDs for MVP
3. **Chunk size**: 1MB (balance between overhead and memory)
