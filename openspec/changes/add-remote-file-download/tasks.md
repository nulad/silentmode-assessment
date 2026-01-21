# Tasks: Add Remote File Download System

## Dependency Legend
- `depends: [X.X, Y.Y]` - Task cannot start until listed tasks are complete
- Tasks with no dependencies can start immediately
- Tasks within same phase with no cross-dependencies can run in parallel

---

## Phase 1: Project Setup & Basic Infrastructure

- [ ] 1.1 Create project directory structure
  - **Depends**: none
  - **Acceptance**: Directories exist: `server/src/utils/`, `client/src/`, `shared/`, `scripts/`, `docs/`

- [ ] 1.2 Initialize server package.json with dependencies
  - **Depends**: [1.1]
  - **Acceptance**: `npm install` succeeds in `server/`
  - **Acceptance**: Dependencies installed: express, ws, commander, uuid, winston, cors, helmet, cli-progress, chalk, ora, cli-table3, dotenv

- [ ] 1.3 Initialize client package.json with dependencies
  - **Depends**: [1.1]
  - **Acceptance**: `npm install` succeeds in `client/`
  - **Acceptance**: Dependencies installed: ws, winston, dotenv

- [ ] 1.4 Create shared/protocol.js with message type constants
  - **Depends**: [1.1]
  - **Acceptance**: Exports MESSAGE_TYPES object with: REGISTER, REGISTER_ACK, DOWNLOAD_REQUEST, DOWNLOAD_ACK, FILE_CHUNK, RETRY_CHUNK, DOWNLOAD_COMPLETE, CANCEL_DOWNLOAD, ERROR, PING, PONG
  - **Acceptance**: Exports ERROR_CODES object with all error codes

- [ ] 1.5 Create .env.example files for server and client
  - **Depends**: [1.1]
  - **Acceptance**: `server/.env.example` contains all server config variables with defaults
  - **Acceptance**: `client/.env.example` contains all client config variables with defaults

- [ ] 1.6 Setup Winston logger utility (server and client)
  - **Depends**: [1.2, 1.3]
  - **Acceptance**: `server/src/utils/logger.js` exports configured logger
  - **Acceptance**: `client/src/utils/logger.js` exports configured logger
  - **Acceptance**: Log level configurable via LOG_LEVEL env var
  - **Acceptance**: Logs include timestamp, level, and message

- [ ] 1.7 Create configuration loaders
  - **Depends**: [1.5, 1.6]
  - **Acceptance**: `server/src/config.js` loads and validates env vars with defaults
  - **Acceptance**: `client/src/config.js` loads and validates env vars with defaults
  - **Acceptance**: Missing required vars throw descriptive error

- [ ] 1.8 Create .gitignore files
  - **Depends**: [1.1]
  - **Acceptance**: Root `.gitignore` ignores: node_modules, .env, downloads/, logs/, *.log

### Phase 1 Concurrency Graph
```
1.1 ─┬─► 1.2 ─┬─► 1.6 ─► 1.7
     ├─► 1.3 ─┘
     ├─► 1.4
     ├─► 1.5 ─────────► 1.7
     └─► 1.8
```

---

## Phase 2: WebSocket Connection Layer

- [ ] 2.1 Implement server WebSocket server (websocket-server.js)
  - **Depends**: [1.6, 1.7]
  - **Acceptance**: Server starts on WS_PORT (default 8080)
  - **Acceptance**: Logs "WebSocket server listening on port 8080"
  - **Acceptance**: Accepts incoming WebSocket connections

- [ ] 2.2 Implement client registry (client-registry.js)
  - **Depends**: [1.6]
  - **Acceptance**: `addClient(clientId, ws)` stores client with connectedAt timestamp
  - **Acceptance**: `removeClient(clientId)` removes client from registry
  - **Acceptance**: `getClient(clientId)` returns client or null
  - **Acceptance**: `getAllClients()` returns array of all clients
  - **Acceptance**: `isClientConnected(clientId)` returns boolean

- [ ] 2.3 Implement client WebSocket connection (websocket-client.js)
  - **Depends**: [1.6, 1.7]
  - **Acceptance**: Client connects to SERVER_WS_URL
  - **Acceptance**: Logs "Connected to server" on successful connection
  - **Acceptance**: Logs "Disconnected from server" on close

- [ ] 2.4 Implement client registration (REGISTER/REGISTER_ACK)
  - **Depends**: [1.4, 2.1, 2.2, 2.3]
  - **Acceptance**: Client sends REGISTER message with clientId and metadata on connect
  - **Acceptance**: Server responds with REGISTER_ACK success=true for new clientId
  - **Acceptance**: Server responds with REGISTER_ACK success=false if clientId already exists
  - **Acceptance**: Client logs registration result

- [ ] 2.5 Implement heartbeat mechanism (PING/PONG, 30s interval)
  - **Depends**: [2.4]
  - **Acceptance**: Server sends PING every 30 seconds to each client
  - **Acceptance**: Client responds with PONG within 5 seconds
  - **Acceptance**: Server updates lastHeartbeat on PONG receipt
  - **Acceptance**: Connection stays alive with regular heartbeat

- [ ] 2.6 Implement client auto-reconnect with exponential backoff
  - **Depends**: [2.3]
  - **Acceptance**: Client attempts reconnect on disconnect
  - **Acceptance**: Delays follow pattern: 5s, 7.5s, 11.25s, ... up to 60s max
  - **Acceptance**: Reconnect attempts limited to MAX_RECONNECT_ATTEMPTS (default 10)
  - **Acceptance**: Logs each reconnect attempt with delay

- [ ] 2.7 Handle client disconnection cleanup
  - **Depends**: [2.2, 2.4]
  - **Acceptance**: Client removed from registry on WebSocket close
  - **Acceptance**: Active downloads for client marked as failed
  - **Acceptance**: Logs "Client {clientId} disconnected"

### Phase 2 Concurrency Graph
```
1.6 ─┬─► 2.2 ─────────────┬─► 2.4 ─┬─► 2.5
     │                    │        └─► 2.7
1.7 ─┼─► 2.1 ─────────────┤
     └─► 2.3 ─┬───────────┘
              └─► 2.6
1.4 ──────────────────────┘
```

---

## Phase 3: File Transfer Core Logic

- [ ] 3.1 Implement download manager (download-manager.js)
  - **Depends**: [1.4, 1.6]
  - **Acceptance**: `createDownload(clientId, filePath)` returns requestId
  - **Acceptance**: Download state tracked: pending, in_progress, completed, failed, cancelled
  - **Acceptance**: `getDownload(requestId)` returns download state or null
  - **Acceptance**: `getAllDownloads()` returns array of all downloads
  - **Acceptance**: `updateDownloadProgress(requestId, progress)` updates state

- [ ] 3.2 Implement file handler on client (file-handler.js)
  - **Depends**: [1.6]
  - **Acceptance**: `getFileInfo(filePath)` returns { exists, size, checksum } or error
  - **Acceptance**: `createChunkReader(filePath, chunkSize)` returns async iterator
  - **Acceptance**: Handles file not found with FILE_NOT_FOUND error
  - **Acceptance**: Handles permission denied with PERMISSION_DENIED error

- [ ] 3.3 Implement chunk reading with streams
  - **Depends**: [3.2]
  - **Acceptance**: File read using fs.createReadStream (not fs.readFile)
  - **Acceptance**: Chunks are exactly CHUNK_SIZE bytes (1MB) except last chunk
  - **Acceptance**: Memory usage stays constant regardless of file size

- [ ] 3.4 Implement SHA-256 checksum utilities (checksum.js)
  - **Depends**: [1.2, 1.3]
  - **Acceptance**: `calculateChecksum(buffer)` returns SHA-256 hex string
  - **Acceptance**: `calculateFileChecksum(filePath)` returns SHA-256 of entire file
  - **Acceptance**: `verifyChecksum(data, expectedChecksum)` returns boolean

- [ ] 3.5 Implement DOWNLOAD_REQUEST sending
  - **Depends**: [2.4, 3.1]
  - **Acceptance**: Server sends DOWNLOAD_REQUEST with requestId, filePath, chunkSize
  - **Acceptance**: Request sent to correct client via WebSocket
  - **Acceptance**: Download state set to "pending"

- [ ] 3.6 Implement DOWNLOAD_ACK handling
  - **Depends**: [3.2, 3.4, 3.5]
  - **Acceptance**: Server receives DOWNLOAD_ACK from client
  - **Acceptance**: On success=true: state set to "in_progress", totalChunks stored
  - **Acceptance**: On success=false: state set to "failed", error stored

- [ ] 3.7 Implement FILE_CHUNK sending (client)
  - **Depends**: [3.3, 3.4, 3.6]
  - **Acceptance**: Client sends FILE_CHUNK with chunkIndex, base64 data, checksum, size
  - **Acceptance**: Chunks sent sequentially (0, 1, 2, ...)
  - **Acceptance**: Logs progress every 10 chunks

- [ ] 3.8 Implement chunk receiving and validation (server)
  - **Depends**: [3.4, 3.7]
  - **Acceptance**: Server receives FILE_CHUNK and decodes base64 data
  - **Acceptance**: Server validates checksum matches decoded data
  - **Acceptance**: Valid chunks written to temp file
  - **Acceptance**: Invalid chunks trigger retry (Phase 4)

- [ ] 3.9 Implement file assembly and final checksum verification
  - **Depends**: [3.8]
  - **Acceptance**: All chunks assembled into final file
  - **Acceptance**: Final file checksum computed and compared to expected
  - **Acceptance**: File saved to `downloads/<clientId>-<timestamp>.txt`
  - **Acceptance**: Temp files cleaned up after assembly

- [ ] 3.10 Implement DOWNLOAD_COMPLETE handling
  - **Depends**: [3.9]
  - **Acceptance**: Server receives DOWNLOAD_COMPLETE with final checksum
  - **Acceptance**: Server verifies assembled file matches checksum
  - **Acceptance**: Download state set to "completed" with file path
  - **Acceptance**: Logs download completion with duration and size

### Phase 3 Concurrency Graph
```
1.4 ─► 3.1 ─────────────────────► 3.5 ─► 3.6 ─► 3.7 ─► 3.8 ─► 3.9 ─► 3.10
1.6 ─┬─► 3.1                           ↗      ↗
     └─► 3.2 ─► 3.3 ──────────────────┴──────┘
1.2 ─┬─► 3.4 ─────────────────────────────────┘
1.3 ─┘
2.4 ─────────────────────────────► 3.5
```

---

## Phase 4: Chunk Retry Logic

- [ ] 4.1 Implement chunk manager with retry tracking (chunk-manager.js)
  - **Depends**: [3.8]
  - **Acceptance**: Tracks received chunks per requestId
  - **Acceptance**: Tracks retry attempts per chunk: { chunkIndex, attempts, lastAttempt, status }
  - **Acceptance**: `markChunkReceived(requestId, chunkIndex)` records successful receipt
  - **Acceptance**: `getRetryInfo(requestId)` returns retry statistics

- [ ] 4.2 Implement chunk timeout detection
  - **Depends**: [4.1]
  - **Acceptance**: Timeout triggered if no chunk received for CHUNK_TIMEOUT (30s)
  - **Acceptance**: Timeout triggers retry for expected chunk
  - **Acceptance**: Logs "Chunk {index} timeout, requesting retry"

- [ ] 4.3 Implement RETRY_CHUNK message sending
  - **Depends**: [4.1]
  - **Acceptance**: Server sends RETRY_CHUNK with requestId, chunkIndex, attempt, reason
  - **Acceptance**: Reason is one of: CHECKSUM_FAILED, TIMEOUT, MISSING
  - **Acceptance**: Logs retry request with details

- [ ] 4.4 Implement retry handling on client
  - **Depends**: [3.2, 4.3]
  - **Acceptance**: Client receives RETRY_CHUNK and re-reads specific chunk
  - **Acceptance**: Client re-sends chunk with fresh checksum
  - **Acceptance**: Logs "Retrying chunk {index}, attempt {n}"

- [ ] 4.5 Implement exponential backoff (1s → 2s → 4s)
  - **Depends**: [4.3]
  - **Acceptance**: First retry after 1 second delay
  - **Acceptance**: Second retry after 2 second delay
  - **Acceptance**: Third retry after 4 second delay
  - **Acceptance**: Delay calculated as: CHUNK_RETRY_DELAY * (2 ^ attempt)

- [ ] 4.6 Implement max retry attempts (3) and failure handling
  - **Depends**: [4.4, 4.5]
  - **Acceptance**: After 3 failed attempts, chunk marked as failed
  - **Acceptance**: Download state set to "failed" with CHUNK_TRANSFER_FAILED error
  - **Acceptance**: Error includes failed chunkIndex
  - **Acceptance**: Partial file cleaned up

- [ ] 4.7 Track retry statistics
  - **Depends**: [4.1]
  - **Acceptance**: Download progress includes retriedChunks array
  - **Acceptance**: Each retry entry has: chunkIndex, attempts, status, reason
  - **Acceptance**: Final download result includes total retry count

### Phase 4 Concurrency Graph
```
3.8 ─► 4.1 ─┬─► 4.2
            ├─► 4.3 ─┬─► 4.4 ─┬─► 4.6
            │        └─► 4.5 ─┘
            └─► 4.7
3.2 ─────────────────► 4.4
```

---

## Phase 5: REST API Implementation

- [ ] 5.1 Setup Express server with middleware (api-server.js)
  - **Depends**: [1.6, 1.7]
  - **Acceptance**: Express server starts on PORT (default 3000)
  - **Acceptance**: CORS enabled (configurable origin)
  - **Acceptance**: Helmet security headers enabled
  - **Acceptance**: JSON body parser enabled
  - **Acceptance**: Request logging middleware active

- [ ] 5.2 Implement GET /api/v1/health
  - **Depends**: [5.1, 2.2, 3.1]
  - **Acceptance**: Returns 200 with { status, uptime, connectedClients, activeDownloads, version }
  - **Acceptance**: uptime in seconds
  - **Acceptance**: connectedClients is count from registry
  - **Acceptance**: activeDownloads is count of in_progress downloads

- [ ] 5.3 Implement GET /api/v1/clients
  - **Depends**: [5.1, 2.2]
  - **Acceptance**: Returns 200 with { success, clients, total }
  - **Acceptance**: Each client has: clientId, connectedAt, status, lastHeartbeat, metadata
  - **Acceptance**: Supports ?status=connected filter

- [ ] 5.4 Implement GET /api/v1/clients/:clientId
  - **Depends**: [5.3]
  - **Acceptance**: Returns 200 with client details if found
  - **Acceptance**: Returns 404 with CLIENT_NOT_FOUND if not found
  - **Acceptance**: Includes downloadHistory array

- [ ] 5.5 Implement POST /api/v1/downloads
  - **Depends**: [5.1, 3.5]
  - **Acceptance**: Accepts { clientId, filePath } in body
  - **Acceptance**: Returns 202 with { success, requestId, status: "pending" }
  - **Acceptance**: Returns 404 if client not connected
  - **Acceptance**: Returns 409 if download already in progress for client
  - **Acceptance**: Returns 400 if missing required fields

- [ ] 5.6 Implement GET /api/v1/downloads
  - **Depends**: [5.1, 3.1]
  - **Acceptance**: Returns 200 with { success, downloads, total, limit, offset }
  - **Acceptance**: Supports ?status filter (pending, in_progress, completed, failed, cancelled)
  - **Acceptance**: Supports ?clientId filter
  - **Acceptance**: Supports ?limit and ?offset for pagination

- [ ] 5.7 Implement GET /api/v1/downloads/:requestId
  - **Depends**: [5.6]
  - **Acceptance**: Returns 200 with full download status including progress
  - **Acceptance**: Progress includes: chunksReceived, totalChunks, percentage, bytesReceived
  - **Acceptance**: Returns 404 if requestId not found

- [ ] 5.8 Implement DELETE /api/v1/downloads/:requestId
  - **Depends**: [5.7]
  - **Acceptance**: Returns 200 with { success, status: "cancelled" }
  - **Acceptance**: Sends CANCEL_DOWNLOAD to client
  - **Acceptance**: Returns 404 if requestId not found
  - **Acceptance**: Returns 409 if download already completed

- [ ] 5.9 Implement request validation
  - **Depends**: [5.1]
  - **Acceptance**: clientId validated: alphanumeric and hyphens only, 1-64 chars
  - **Acceptance**: filePath validated: absolute path, no directory traversal (..)
  - **Acceptance**: Invalid requests return 400 with INVALID_REQUEST error

- [ ] 5.10 Implement error response formatting
  - **Depends**: [1.4, 5.1]
  - **Acceptance**: All errors return { success: false, error: { code, message, details?, timestamp } }
  - **Acceptance**: Error codes match ERROR_CODES from protocol.js
  - **Acceptance**: HTTP status codes appropriate (400, 404, 409, 500)

### Phase 5 Concurrency Graph
```
1.6 ─┬─► 5.1 ─┬─► 5.2 (also needs 2.2, 3.1)
1.7 ─┘        ├─► 5.3 ─► 5.4 (also needs 2.2)
              ├─► 5.5 (also needs 3.5)
              ├─► 5.6 ─► 5.7 ─► 5.8 (also needs 3.1)
              ├─► 5.9
              └─► 5.10 (also needs 1.4)
```

---

## Phase 6: CLI Tool

- [ ] 6.1 Setup Commander.js CLI structure (cli.js)
  - **Depends**: [1.2]
  - **Acceptance**: `silentmode --help` shows all commands
  - **Acceptance**: `silentmode --version` shows version from package.json
  - **Acceptance**: Subcommands: download, clients, downloads, health

- [ ] 6.2 Implement `silentmode download <clientId>` command
  - **Depends**: [6.1, 5.5, 5.7]
  - **Acceptance**: Calls POST /api/v1/downloads
  - **Acceptance**: Polls GET /api/v1/downloads/:requestId for progress
  - **Acceptance**: Supports --file-path, -f option (default: $HOME/file_to_download.txt)
  - **Acceptance**: Supports --output, -o option for output path
  - **Acceptance**: Supports --timeout, -t option
  - **Acceptance**: Displays success/failure message with details

- [ ] 6.3 Implement `silentmode clients list` command
  - **Depends**: [6.1, 5.3]
  - **Acceptance**: Calls GET /api/v1/clients
  - **Acceptance**: Displays clients in formatted table
  - **Acceptance**: Supports --status, -s filter
  - **Acceptance**: Supports --format, -f (table|json)

- [ ] 6.4 Implement `silentmode clients get <clientId>` command
  - **Depends**: [6.1, 5.4]
  - **Acceptance**: Calls GET /api/v1/clients/:clientId
  - **Acceptance**: Displays client details
  - **Acceptance**: Shows error if client not found

- [ ] 6.5 Implement `silentmode downloads list` command
  - **Depends**: [6.1, 5.6]
  - **Acceptance**: Calls GET /api/v1/downloads
  - **Acceptance**: Displays downloads in formatted table
  - **Acceptance**: Supports --status, --client filters
  - **Acceptance**: Supports --limit, --offset pagination

- [ ] 6.6 Implement `silentmode downloads status <requestId>` command
  - **Depends**: [6.1, 5.7]
  - **Acceptance**: Calls GET /api/v1/downloads/:requestId
  - **Acceptance**: Displays download status and progress
  - **Acceptance**: Supports --watch, -w for real-time updates (poll every 1s)

- [ ] 6.7 Implement `silentmode downloads cancel <requestId>` command
  - **Depends**: [6.1, 5.8]
  - **Acceptance**: Calls DELETE /api/v1/downloads/:requestId
  - **Acceptance**: Displays cancellation confirmation
  - **Acceptance**: Shows error if cannot cancel

- [ ] 6.8 Implement `silentmode health` command
  - **Depends**: [6.1, 5.2]
  - **Acceptance**: Calls GET /api/v1/health
  - **Acceptance**: Displays health status in readable format
  - **Acceptance**: Supports --format, -f (table|json)

- [ ] 6.9 Add progress bar with cli-progress
  - **Depends**: [6.2]
  - **Acceptance**: Progress bar shows during download
  - **Acceptance**: Format: `[████████░░░░] 45% | 45/100 chunks | 47.2 MB / 100 MB`
  - **Acceptance**: Updates in real-time during --watch

- [ ] 6.10 Add table formatting with cli-table3
  - **Depends**: [6.3, 6.5]
  - **Acceptance**: Tables have headers and borders
  - **Acceptance**: Columns auto-sized to content
  - **Acceptance**: Consistent styling across commands

- [ ] 6.11 Add colored output with chalk
  - **Depends**: [6.1]
  - **Acceptance**: Success messages in green
  - **Acceptance**: Error messages in red
  - **Acceptance**: Warnings in yellow
  - **Acceptance**: Info in default color

- [ ] 6.12 Configure npm link for global CLI access
  - **Depends**: [6.1]
  - **Acceptance**: `npm link` in server/ makes `silentmode` available globally
  - **Acceptance**: `silentmode` command works from any directory
  - **Acceptance**: Shebang `#!/usr/bin/env node` in cli.js

### Phase 6 Concurrency Graph
```
1.2 ─► 6.1 ─┬─► 6.2 ─► 6.9 (also needs 5.5, 5.7)
            ├─► 6.3 ─┬─► 6.10 (also needs 5.3)
            ├─► 6.4   │       (also needs 5.4)
            ├─► 6.5 ──┘       (also needs 5.6)
            ├─► 6.6           (also needs 5.7)
            ├─► 6.7           (also needs 5.8)
            ├─► 6.8           (also needs 5.2)
            ├─► 6.11
            └─► 6.12
```

---

## Phase 7: Testing & Documentation

- [ ] 7.1 Create test file generator script (scripts/generate-test-file.js)
  - **Depends**: [1.1]
  - **Acceptance**: Running `node scripts/generate-test-file.js` creates 100MB file
  - **Acceptance**: File created at `client/data/file_to_download.txt`
  - **Acceptance**: File contains random data (not compressible)
  - **Acceptance**: Script logs file size and checksum

- [ ] 7.2 Create setup script (scripts/setup.sh)
  - **Depends**: [1.2, 1.3, 7.1]
  - **Acceptance**: Script runs `npm install` in server/ and client/
  - **Acceptance**: Script generates test file
  - **Acceptance**: Script creates .env files from .env.example if not exist
  - **Acceptance**: Script is executable (chmod +x)

- [ ] 7.3 Manual end-to-end testing with multiple clients
  - **Depends**: [3.10, 4.6, 5.8, 6.9]
  - **Acceptance**: Server starts and accepts connections
  - **Acceptance**: 3 clients connect with different IDs
  - **Acceptance**: `silentmode clients list` shows all 3 clients
  - **Acceptance**: Download from each client succeeds
  - **Acceptance**: Files saved with correct checksums

- [ ] 7.4 Test retry scenarios (simulate chunk failures)
  - **Depends**: [7.3]
  - **Acceptance**: Corrupted chunk triggers retry
  - **Acceptance**: Retry succeeds and download completes
  - **Acceptance**: After 3 failures, download fails gracefully
  - **Acceptance**: Retry statistics shown in download status

- [ ] 7.5 Write README.md with full documentation
  - **Depends**: [7.3]
  - **Acceptance**: Overview section explains purpose
  - **Acceptance**: Architecture diagram included (ASCII or Mermaid)
  - **Acceptance**: Prerequisites listed (Node.js 18+)
  - **Acceptance**: Installation steps work when followed
  - **Acceptance**: Usage examples for server, client, CLI, API
  - **Acceptance**: Configuration reference complete
  - **Acceptance**: Troubleshooting section with common issues

- [ ] 7.6 Write docs/ARCHITECTURE.md
  - **Depends**: [1.4, 2.4]
  - **Acceptance**: System design explained with diagrams
  - **Acceptance**: Component responsibilities documented
  - **Acceptance**: Data flow explained
  - **Acceptance**: Design decisions documented with rationale

- [ ] 7.7 Write docs/PROTOCOL.md
  - **Depends**: [1.4, 4.6]
  - **Acceptance**: All message types documented with examples
  - **Acceptance**: Connection lifecycle explained
  - **Acceptance**: Error handling documented
  - **Acceptance**: Retry protocol explained

- [ ] 7.8 Create docs/openapi.yaml (OpenAPI 3.0 spec)
  - **Depends**: [5.10]
  - **Acceptance**: Valid OpenAPI 3.0 syntax (passes linter)
  - **Acceptance**: All endpoints documented
  - **Acceptance**: Request/response schemas defined
  - **Acceptance**: Error responses documented
  - **Acceptance**: Examples included for each endpoint

### Phase 7 Concurrency Graph
```
1.1 ─► 7.1 ─► 7.2 (also needs 1.2, 1.3)

3.10, 4.6, 5.8, 6.9 ─► 7.3 ─┬─► 7.4
                            └─► 7.5

1.4 ─┬─► 7.6 (also needs 2.4)
     └─► 7.7 (also needs 4.6)

5.10 ─► 7.8
```

---

## Full Dependency Summary

### Critical Path (longest dependency chain)
```
1.1 → 1.2 → 1.6 → 1.7 → 2.1 → 2.4 → 3.5 → 3.6 → 3.7 → 3.8 → 3.9 → 3.10 → 7.3 → 7.5
                              ↓
                             4.1 → 4.3 → 4.4 → 4.6 → 7.7
```

### Maximum Parallelism Opportunities

**After 1.1 completes (5 tasks can run in parallel):**
- 1.2, 1.3, 1.4, 1.5, 1.8

**After Phase 1 completes (can run in parallel):**
- 2.1, 2.2, 2.3 (WebSocket layer)
- 3.1, 3.2, 3.4 (File transfer foundation)
- 5.1 (API server setup)
- 6.1 (CLI setup)
- 7.1 (Test file generator)

**Phase 5 & 6 can largely run in parallel with Phase 3 & 4** once their shared dependencies are met.

### Tasks with No Dependencies (can start immediately)
- 1.1 Create project directory structure

### Leaf Tasks (nothing depends on them)
- 1.8, 2.5, 2.6, 2.7, 4.7, 5.4, 5.8, 5.9, 6.4, 6.7, 6.8, 6.9, 6.10, 6.11, 6.12, 7.2, 7.4, 7.5, 7.6, 7.7, 7.8
