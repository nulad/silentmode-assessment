# Silentmode Assessment

A robust chunk-based file download system with WebSocket communication, automatic retry logic, and comprehensive error handling.

## What Is This?

This project implements a **distributed file download system** where:
- A **server** coordinates file downloads and manages chunks
- **Clients** serve files from their local filesystem
- Files are downloaded **in chunks** for reliability and progress tracking
- **WebSocket** communication enables real-time bidirectional data transfer
- **Automatic retry logic** handles network failures gracefully

Think of it as a reverse download system: instead of clients downloading from a server, the server downloads files from connected clients.

## Features

### Core Functionality

**Chunk-Based File Transfer**
- Files are split into configurable chunks (default: 1MB)
- Each chunk is transferred independently with checksum validation
- Enables download resumption and parallel processing
- Reduces memory footprint for large files

**WebSocket Communication**
- Real-time bidirectional messaging between server and clients
- Persistent connections with automatic heartbeat/ping-pong
- Low-latency chunk requests and transfers
- Automatic reconnection with exponential backoff

**Intelligent Retry Mechanism**
- Failed chunks are automatically retried with exponential backoff
- Configurable retry attempts (default: 3 attempts)
- Jitter to prevent thundering herd problems
- Detailed retry statistics and tracking

**Progress Tracking**
- Real-time download progress with percentage and bytes transferred
- Per-chunk status tracking (pending, received, failed, retried)
- Detailed statistics: chunks received, total chunks, retry counts
- Progress available via REST API and CLI

### API & Interfaces

**REST API**
- Full HTTP API for managing downloads and clients
- Health check endpoints for monitoring
- JSON responses with detailed status information
- Support for listing, creating, and querying downloads

**CLI Tool**
- Command-line interface for triggering downloads
- Interactive progress bars with real-time updates
- Client and download management commands
- Health check and status monitoring

**WebSocket Protocol**
- Well-defined message types for all operations
- Client registration and discovery
- Download lifecycle management (request, transfer, complete, cancel)
- Error handling and reporting

### Reliability & Monitoring

**Error Handling**
- Graceful handling of network failures
- Client disconnection recovery
- File not found and permission errors
- Timeout management for stalled downloads

**Health Monitoring**
- Server health check endpoints
- Client connection status tracking
- Active download monitoring
- Detailed logging (debug, info, warn, error levels)

**Testing**
- Comprehensive unit tests with Jest
- Full end-to-end test suite
- Automated test files generation
- WebSocket protocol validation tests

## TL;DR - Quick Commands

```bash
# 1. Run setup script (installs everything)
./scripts/setup.sh

# 2. Start server (Terminal 1)
cd server && npm start

# 3. Start client (Terminal 2)
cd client && CLIENT_ID=my-client npm start

# 4. Download a file (Terminal 3)
silentmode download my-client -f [absolute path of the file] --watch

# 5. Run E2E tests
./scripts/e2e-test.sh

# 6. Run unit tests
cd server && npm test
```

## Complete Guide - How to Run This Repo

This guide provides detailed step-by-step instructions.

## Table of Contents

- [What Is This?](#what-is-this)
- [Features](#features)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Running the Application](#running-the-application)
- [Running E2E Tests](#running-e2e-tests)
- [Running Unit Tests](#running-unit-tests)
- [Architecture](#architecture)
- [Configuration](#configuration)
- [Troubleshooting](#troubleshooting)
- [Additional Resources](#additional-resources)

## Prerequisites

Before you begin, ensure you have the following installed:

- **Node.js 18 or higher** - [Download here](https://nodejs.org/)
- **npm 8 or higher** - Usually comes with Node.js
- **Git** - [Download here](https://git-scm.com/)

Verify your installation:
```bash
node --version  # Should be v18.x or higher
npm --version   # Should be 8.x or higher
```

**Note**: The setup script (`scripts/setup.sh`) automatically checks these prerequisites for you.

## Installation

### Method 1: Automated Setup (Recommended)

The easiest way to get started is using the setup script, which handles everything automatically:

```bash
# Clone the repository
git clone https://github.com/your-org/silentmode-assessment.git
cd silentmode-assessment

# Run the setup script
chmod +x scripts/setup.sh
./scripts/setup.sh
```

**The setup script will:**
- Check prerequisites (Node.js 18+, npm)
- Install all dependencies (root, server, client)
- Create necessary directories (logs, downloads)
- Set up environment files from templates
- Generate test files
- Verify the installation

### Method 2: Manual Installation

If you prefer to install manually:

```bash
# Clone the repository
git clone https://github.com/your-org/silentmode-assessment.git
cd silentmode-assessment

# Install server dependencies
cd server
npm install
cd ..

# Install client dependencies
cd client
npm install
cd ..
```

**Important**: Both server and client have separate `package.json` files and must be installed independently.

## Running the Application

Follow these steps to run the complete download system:

### Step 1: Start the Server

Open a terminal in the project root directory:

```bash
cd server
npm start
```

You should see output indicating the server has started:
- HTTP API Server: `http://localhost:3000`
- WebSocket Server: `ws://localhost:8080`

**Keep this terminal running** - the server must stay active for the system to work.

### Step 2: Create Test Data (Optional)

In a new terminal, create a test file for the client to serve:

```bash
mkdir -p ~/data
echo "This is a test file for download testing" > ~/data/test.txt
```

### Step 3: Start the Client

Open a **new terminal** (keep the server running in the first terminal):

```bash
cd client
CLIENT_ID=my-client npm start
```

The client will connect to the server via WebSocket. You should see connection confirmation in both terminals.

**Keep this terminal running** as well.

### Step 4: Initiate a Download

Open a **third terminal** to trigger downloads. You have two options:

#### Option A: Using the CLI Tool (Recommended for Testing)

```bash
# From the project root
node server/cli.js download -c my-client -f data/test.txt
```

This will:
- Request the file from the client
- Download it in chunks
- Save it to `server/downloads/`
- Show progress in real-time

#### Option B: Using the REST API

```bash
curl -X POST http://localhost:3000/api/v1/downloads \
  -H "Content-Type: application/json" \
  -d '{"clientId":"my-client","filePath":"data/test.txt"}'
```

### Step 5: Verify the Download

Check that the file was downloaded successfully:

```bash
ls -la server/downloads/
cat server/downloads/test.txt
```

You should see your test file in the downloads directory.

## Architecture Overview

```
┌─────────────────┐
│   CLI Tool      │  Triggers downloads
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  REST API       │  Port 3000 - HTTP endpoints
│  Server         │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  WebSocket      │  Port 8080 - Real-time communication
│  Server         │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Client         │  Serves files, sends chunks
│  (File Source)  │
└─────────────────┘
```

**Core Components:**
- **REST API Server**: Manages download requests and provides status endpoints
- **WebSocket Server**: Handles real-time bidirectional communication
- **Download Manager**: Coordinates chunk distribution and tracking
- **Retry Engine**: Automatically retries failed chunks with exponential backoff
- **Client**: Serves files from its local filesystem

## Configuration (Optional)

Both server and client work with default settings. You only need to create `.env` files if you want to customize behavior.

### Server Configuration (Optional)

Create `server/.env` to customize server settings:

```env
# Server ports
PORT=3000                      # REST API port
WS_PORT=8080                   # WebSocket port

# Download settings
DOWNLOAD_DIR=./downloads       # Where downloaded files are saved
CHUNK_SIZE=1048576             # Chunk size in bytes (default: 1MB)

# Retry settings
MAX_CHUNK_RETRY_ATTEMPTS=3     # Max retries for failed chunks
CHUNK_RETRY_DELAY=1000         # Base retry delay in ms

# Logging
LOG_LEVEL=info                 # Options: debug, info, warn, error
```

See `server/.env.example` for all available options.

### Client Configuration (Optional)

Create `client/.env` to customize client settings:

```env
# Client identity
CLIENT_ID=my-client            # Unique client identifier

# Server connection
SERVER_WS_URL=ws://localhost:8080  # WebSocket server URL

# Connection settings
RECONNECT_INTERVAL=5000        # Reconnect delay in ms
MAX_RECONNECT_ATTEMPTS=10      # Max reconnection attempts

# Logging
LOG_LEVEL=info                 # Options: debug, info, warn, error
```

See `client/.env.example` for all available options.

**Note**: You can also set environment variables directly when starting:
```bash
cd client
CLIENT_ID=custom-client LOG_LEVEL=debug npm start
```

## Running E2E Tests

End-to-end tests verify the complete system works together. The test script automatically starts the server and client, runs a full download, and verifies the results.

### Prerequisites for E2E Tests

Make sure you've completed the [Installation](#installation) steps first (dependencies must be installed).

### Step 1: Make the Test Script Executable

```bash
chmod +x scripts/e2e-test.sh
```

### Step 2: Run E2E Tests

From the project root directory:

```bash
./scripts/e2e-test.sh
```

### What the E2E Test Does

The test automatically:
1. Starts the server on ports 3000 (HTTP) and 8080 (WebSocket)
2. Starts a test client with a unique ID
3. Creates a test file in `~/data/`
4. Runs 11 test cases including:
   - Health check
   - Client connection
   - File download initiation
   - Download progress tracking
   - Download completion verification
   - Error handling (invalid IDs, missing files)
   - Client listing
5. Cleans up all processes and temporary files
6. Shows test results with pass/fail counts

### Reading E2E Test Results

The script outputs color-coded results:
- **Green [PASS]**: Test succeeded
- **Red [FAIL]**: Test failed
- **Yellow [INFO]**: Informational messages
- **Blue [TEST]**: Test being executed

Detailed logs are saved to: `logs/e2e-test-YYYYMMDD-HHMMSS.log`

### Example Output

```
[INFO] Starting E2E Test Suite
[PASS] Server started successfully (PID: 12345)
[PASS] Client started successfully (PID: 12346, ID: test-client-1234567890)
[TEST] Health Check
[PASS] Health Check
[TEST] Start Download
[PASS] Download started (ID: req-abc123)
[INFO] Download progress: 50.0%
[PASS] Download completed
...
[INFO] Test Results:
  Passed: 11
  Failed: 0
  Total: 11
[INFO] All tests passed! ✓
```

## Running Unit Tests

Unit tests verify individual components and functions.

### Run All Unit Tests

```bash
cd server
npm test
```

This runs the Jest test suite which includes:
- WebSocket server tests
- Chunk manager tests
- Validation tests
- REST API integration tests
- Download management tests

### Run Specific Test Files

```bash
cd server

# Test WebSocket functionality
npm test -- websocket-server.test.js

# Test chunk management
npm test -- chunk-manager.edge-cases.test.js

# Test validation
npm test -- validation.test.js
```

### Test Coverage

Generate a coverage report:

```bash
cd server
npm test -- --coverage
```

## Project Structure

```
silentmode-assessment/
├── client/                 # Client application
│   ├── src/               # Client source code
│   ├── data/              # Test data files
│   ├── logs/              # Client logs (auto-generated)
│   └── package.json       # Client dependencies
├── server/                # Server application
│   ├── src/               # Server source code
│   ├── cli.js             # CLI tool for downloads
│   ├── logs/              # Server logs (auto-generated)
│   ├── downloads/         # Downloaded files stored here
│   └── package.json       # Server dependencies
├── scripts/               # Utility scripts
│   └── e2e-test.sh        # End-to-end test script
└── README.md              # This file
```

## Troubleshooting

### Common Issues and Solutions

#### Error: "Cannot find module" or Missing Dependencies

**Problem**: You see errors about missing packages or modules.

**Solution**:

Option 1 - Re-run the setup script (easiest):
```bash
./scripts/setup.sh
```

Option 2 - Manual reinstall:
```bash
# Reinstall server dependencies
cd server
rm -rf node_modules package-lock.json
npm install
cd ..

# Reinstall client dependencies
cd client
rm -rf node_modules package-lock.json
npm install
cd ..
```

#### Error: "Port 3000 or 8080 already in use"

**Problem**: Another process is using the required ports.

**Solution**:
```bash
# Check what's using the ports
lsof -i :3000
lsof -i :8080

# Kill the processes (replace PID with actual process ID)
kill -9 <PID>

# Or kill all node processes (use with caution)
pkill -9 node
```

#### Error: "Client Can't Connect to Server"

**Problem**: Client shows connection errors or doesn't register with server.

**Solution**:
1. Verify the server is running:
   ```bash
   curl http://localhost:3000/api/v1/health
   ```
2. Check server logs: `server/logs/server.log`
3. Check client logs: `client/logs/client.log`
4. Verify WebSocket URL in `client/.env` is `ws://localhost:8080`
5. Check firewall isn't blocking port 8080

#### Error: "Download Fails" or "File Not Found"

**Problem**: Downloads fail or can't find the file.

**Solution**:
1. Verify the file path is **relative to the client's home directory** (e.g., `data/test.txt` for `~/data/test.txt`)
2. Check the file exists on the **client machine** (not server):
   ```bash
   ls -la ~/data/test.txt
   ```
3. Ensure client has read permissions for the file
4. Check server logs for error details: `server/logs/server.log`

#### E2E Tests Fail

**Problem**: E2E test script exits with errors.

**Solution**:
1. Make sure all dependencies are installed (see [Installation](#installation))
2. Kill any existing server/client processes:
   ```bash
   pkill -9 node
   ```
3. Check test logs: `logs/e2e-test-YYYYMMDD-HHMMSS.log`
4. Verify ports 3000 and 8080 are available
5. Run the script with verbose output to see what fails

#### Enable Debug Mode

For detailed logging to troubleshoot issues:

```bash
# Server debug mode
cd server
LOG_LEVEL=debug npm start

# Client debug mode
cd client
LOG_LEVEL=debug npm start
```

Logs are written to:
- `server/logs/server.log`
- `client/logs/client.log`

#### Check System Health

Verify everything is running:

```bash
# Check server health
curl http://localhost:3000/api/v1/health

# List connected clients
curl http://localhost:3000/api/v1/clients

# Check active downloads
curl http://localhost:3000/api/v1/downloads
```

## Additional Resources

### Useful Scripts

```bash
# Setup script - Install everything and set up environment
./scripts/setup.sh

# E2E test script - Run complete end-to-end tests
./scripts/e2e-test.sh

# Generate test files - Create test files of any size
node scripts/generate-test-files.js [filename] [sizeMB]
```

### CLI Commands Reference

```bash
# Download a file
node server/cli.js download -c <clientId> -f <filePath> [options]
  -w, --watch          # Show progress bar
  -o, --output <path>  # Output directory (default: ./downloads)

# List clients
node server/cli.js clients list

# Check download status
node server/cli.js downloads status <requestId>

# Check server health
node server/cli.js health
```

### REST API Endpoints

```
GET  /api/v1/health              # Server health check
GET  /api/v1/clients             # List connected clients
POST /api/v1/downloads           # Start a download
GET  /api/v1/downloads           # List all downloads
GET  /api/v1/downloads/:id       # Get download status
```

### Understanding the System

**How it works:**
1. **Client** runs on a machine with files to share (serves files)
2. **Server** coordinates downloads and manages chunk distribution
3. **CLI Tool** triggers downloads from the client through the server
4. Files are split into chunks, transferred via WebSocket, and reassembled on the server

**Data flow:**
```
CLI Request → Server → Client (via WebSocket)
Client reads file → Sends chunks → Server reassembles → Saves to downloads/
```

## Contributing

Contributions are welcome! Please:
1. Fork the repository
2. Create a feature branch
3. Add tests for new functionality
4. Run the test suite (`npm test` and `./scripts/e2e-test.sh`)
5. Submit a pull request

## License

MIT License - see LICENSE file for details.