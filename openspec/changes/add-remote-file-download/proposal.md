# Change: Add Remote File Download System

## Why

On-premise clients (e.g., deployed at restaurants) reside within private local networks and are not directly accessible from the public internet. The cloud-hosted server needs a way to download files (~100MB) from these clients on demand for data collection, backup, or synchronization purposes.

## What Changes

- **NEW**: WebSocket-based reverse connection architecture where clients maintain persistent connections to the server
- **NEW**: REST API (Express) for download management with versioned endpoints (`/api/v1/`)
- **NEW**: CLI tool (`silentmode`) for operational tasks
- **NEW**: Chunked file transfer protocol (1MB chunks) with SHA-256 checksums
- **NEW**: Client registry for tracking connected clients and their status
- **NEW**: Automatic chunk retry with exponential backoff (1s → 2s → 4s, max 3 attempts)
- **NEW**: Heartbeat mechanism (30s interval) for connection health
- **NEW**: Client auto-reconnect with exponential backoff

## Impact

- Affected specs: `remote-file-download` (new capability)
- Affected code: Server application, Client application (both new)
- New dependencies:
  - Server: express, ws, commander, uuid, winston, cors, helmet, cli-progress, chalk, ora, cli-table3
  - Client: ws, winston
- Network: Clients must be able to establish outbound WebSocket connections to the server

## Deliverables

1. **Server** (`server/`)
   - WebSocket server (port 8080)
   - REST API server (port 3000)
   - CLI tool (`silentmode`)
   - Download management with retry logic

2. **Client** (`client/`)
   - WebSocket client with auto-reconnect
   - File chunking and transfer
   - Heartbeat handling

3. **Documentation**
   - README.md with setup and usage
   - ARCHITECTURE.md with design details
   - OpenAPI 3.0 specification
   - WebSocket protocol documentation

4. **Scripts**
   - Test file generator (100MB)
   - Setup script
