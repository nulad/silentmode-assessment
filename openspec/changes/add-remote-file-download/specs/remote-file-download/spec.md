# Capability: Remote File Download

## Overview

Enables a cloud-hosted server to download files from on-premise clients that are behind NAT/private networks. Clients maintain persistent WebSocket connections to the server, allowing the server to request file transfers on demand via REST API or CLI.

## ADDED Requirements

### Requirement: Client Connection Management

The system SHALL allow on-premise clients to establish and maintain persistent WebSocket connections to the cloud server.

#### Scenario: Client connects and registers
- **GIVEN** the server is running and accepting WebSocket connections on port 8080
- **WHEN** a client connects with a unique `clientId` and sends a REGISTER message
- **THEN** the server sends REGISTER_ACK with success=true
- **AND** the server registers the client in its active client registry
- **AND** the client is available for download requests

#### Scenario: Client reconnects after disconnect
- **GIVEN** a client was previously connected
- **WHEN** the connection is lost (network issue, server restart)
- **THEN** the client automatically attempts to reconnect with exponential backoff
- **AND** backoff sequence is 5s → 7.5s → 11.25s → ... up to 60s max
- **AND** upon successful reconnection, the client re-registers

#### Scenario: Duplicate client ID rejected
- **GIVEN** a client with ID `restaurant-001` is already connected
- **WHEN** another client attempts to connect with the same ID
- **THEN** the server sends REGISTER_ACK with success=false
- **AND** returns an error indicating the ID is already in use

#### Scenario: Heartbeat keeps connection alive
- **GIVEN** a client is connected to the server
- **WHEN** 30 seconds pass without other messages
- **THEN** both server and client exchange PING/PONG messages
- **AND** the connection remains active

#### Scenario: Stale connection detected
- **GIVEN** a client has not responded to heartbeat
- **WHEN** 90 seconds pass without a PONG response
- **THEN** the server marks the client as disconnected
- **AND** removes the client from the registry

### Requirement: REST API for Client Management

The server SHALL provide REST API endpoints to query connected clients.

#### Scenario: List connected clients
- **GIVEN** multiple clients are connected to the server
- **WHEN** an operator calls `GET /api/v1/clients`
- **THEN** the server returns a JSON response with all connected clients
- **AND** each client includes clientId, connectedAt, lastHeartbeat, and status

#### Scenario: Get specific client details
- **GIVEN** a client with ID `restaurant-001` is connected
- **WHEN** an operator calls `GET /api/v1/clients/restaurant-001`
- **THEN** the server returns detailed client information
- **AND** includes connection metadata and download history

#### Scenario: Query non-existent client
- **GIVEN** no client with ID `restaurant-999` is connected
- **WHEN** an operator calls `GET /api/v1/clients/restaurant-999`
- **THEN** the server returns HTTP 404
- **AND** error code is CLIENT_NOT_FOUND

### Requirement: Server-Initiated File Download via API

The server SHALL be able to initiate a file download from any connected client via REST API.

#### Scenario: Successful file download via API
- **GIVEN** a client with ID `restaurant-001` is connected
- **AND** the client has file at the specified path (approximately 100MB)
- **WHEN** the server receives `POST /api/v1/downloads` with clientId and filePath
- **THEN** the server returns HTTP 202 with requestId and status "pending"
- **AND** the server sends DOWNLOAD_REQUEST to the client via WebSocket
- **AND** the client reads the file and sends it in 1MB chunks
- **AND** each chunk includes SHA-256 checksum
- **AND** the server validates each chunk checksum
- **AND** the server assembles the complete file
- **AND** the server verifies final file checksum
- **AND** the file is saved to `./downloads/<clientId>-<timestamp>.txt`

#### Scenario: Download from disconnected client
- **GIVEN** a client with ID `restaurant-002` is NOT connected
- **WHEN** the server receives `POST /api/v1/downloads` with clientId=restaurant-002
- **THEN** the server returns HTTP 404
- **AND** error code is CLIENT_NOT_CONNECTED
- **AND** no download is attempted

#### Scenario: Download when file does not exist
- **GIVEN** a client with ID `restaurant-001` is connected
- **AND** the specified file does NOT exist on the client
- **WHEN** the server receives `POST /api/v1/downloads`
- **THEN** the client responds with DOWNLOAD_ACK success=false
- **AND** error code is FILE_NOT_FOUND
- **AND** the server returns the error to the API caller

#### Scenario: Download already in progress
- **GIVEN** a download is already in progress for client `restaurant-001`
- **WHEN** another download request is made for the same client
- **THEN** the server returns HTTP 409
- **AND** error code is DOWNLOAD_IN_PROGRESS

### Requirement: Download Status and Management via API

The server SHALL provide REST API endpoints to query and manage downloads.

#### Scenario: Get download status
- **GIVEN** a download with requestId `req-abc-123` is in progress
- **WHEN** an operator calls `GET /api/v1/downloads/req-abc-123`
- **THEN** the server returns download status including:
- **AND** chunksReceived, totalChunks, percentage, bytesReceived
- **AND** retriedChunks with attempt details
- **AND** startedAt and estimatedCompletion

#### Scenario: List all downloads
- **GIVEN** multiple downloads have been initiated
- **WHEN** an operator calls `GET /api/v1/downloads`
- **THEN** the server returns a paginated list of all downloads
- **AND** supports filtering by status and clientId

#### Scenario: Cancel in-progress download
- **GIVEN** a download with requestId `req-abc-123` is in progress
- **WHEN** an operator calls `DELETE /api/v1/downloads/req-abc-123`
- **THEN** the server sends CANCEL_DOWNLOAD to the client
- **AND** the download status is set to "cancelled"
- **AND** partial file is cleaned up

### Requirement: CLI for File Download

The server SHALL provide a CLI tool to trigger and monitor file downloads.

#### Scenario: Successful file download via CLI
- **GIVEN** a client with ID `restaurant-001` is connected
- **AND** the client has file `$HOME/file_to_download.txt`
- **WHEN** an operator runs `silentmode download restaurant-001`
- **THEN** the CLI initiates the download via the REST API
- **AND** displays a progress bar showing chunks received
- **AND** displays retry notifications if chunks fail
- **AND** displays success message with file path and checksum on completion

#### Scenario: CLI with watch flag
- **GIVEN** a download is initiated
- **WHEN** an operator uses `--watch` flag
- **THEN** the CLI displays real-time progress updates
- **AND** shows retry attempts as they happen
- **AND** shows final statistics (duration, retried chunks, checksum)

#### Scenario: CLI list clients
- **WHEN** an operator runs `silentmode clients list`
- **THEN** the CLI displays a formatted table of connected clients
- **AND** shows clientId, status, connectedAt, and lastHeartbeat

#### Scenario: CLI list downloads
- **WHEN** an operator runs `silentmode downloads list`
- **THEN** the CLI displays a formatted table of downloads
- **AND** supports `--status` filter flag

### Requirement: Chunked File Transfer

The system SHALL transfer files in 1MB chunks to handle large files efficiently.

#### Scenario: Large file transferred in chunks
- **GIVEN** a file of 100MB needs to be transferred
- **WHEN** the download is initiated
- **THEN** the file is split into 1MB chunks (approximately 100 chunks)
- **AND** each chunk is sent sequentially as FILE_CHUNK messages
- **AND** each chunk includes chunkIndex, data (base64), checksum, and size
- **AND** the server reassembles the chunks into the complete file

#### Scenario: Chunk checksum verification
- **GIVEN** a FILE_CHUNK message is received
- **WHEN** the server validates the chunk
- **THEN** the server computes SHA-256 of the decoded data
- **AND** compares with the provided checksum
- **AND** accepts the chunk only if checksums match

#### Scenario: Final file integrity verification
- **GIVEN** all chunks have been received
- **WHEN** the client sends DOWNLOAD_COMPLETE with full file checksum
- **THEN** the server computes SHA-256 of the assembled file
- **AND** verifies it matches the provided checksum
- **AND** marks download as successful only if checksums match

### Requirement: Download Retry Mechanism

The server SHALL automatically retry failed chunks with exponential backoff.

#### Scenario: Retry on chunk checksum failure
- **GIVEN** a FILE_CHUNK is received with invalid checksum
- **WHEN** the server detects the mismatch
- **THEN** the server sends RETRY_CHUNK to the client
- **AND** includes chunkIndex, attempt number, and reason "CHECKSUM_FAILED"
- **AND** the client re-reads and re-sends the chunk

#### Scenario: Retry with exponential backoff
- **GIVEN** a chunk retry is needed
- **WHEN** multiple retries are required
- **THEN** delays follow exponential backoff: 1s, 2s, 4s
- **AND** maximum 3 retry attempts per chunk

#### Scenario: Chunk fails after max retries
- **GIVEN** a chunk has failed 3 retry attempts
- **WHEN** the third retry also fails
- **THEN** the download is marked as "failed"
- **AND** error code is CHUNK_TRANSFER_FAILED
- **AND** includes the failed chunk index in error details
- **AND** partial file is cleaned up

#### Scenario: No retry for permanent errors
- **GIVEN** a download request results in FILE_NOT_FOUND
- **WHEN** the error is received
- **THEN** the server does NOT retry
- **AND** immediately marks download as failed

### Requirement: Health Check API

The server SHALL provide a health check endpoint.

#### Scenario: Health check returns system status
- **WHEN** an operator calls `GET /api/v1/health`
- **THEN** the server returns status "healthy"
- **AND** includes uptime, connectedClients count, activeDownloads count, and version
