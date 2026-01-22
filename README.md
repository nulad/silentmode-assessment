# Silentmode Assessment

A robust chunk-based file download system with WebSocket communication, automatic retry logic, and comprehensive error handling.

## Features

- **Chunk-based Downloads**: Files are split into configurable chunks for efficient transfer
- **WebSocket Communication**: Real-time bidirectional communication between server and clients
- **Automatic Retry Logic**: Intelligent retry mechanism with exponential backoff
- **Progress Tracking**: Real-time progress reporting with detailed statistics
- **Multiple Client Types**: Support for CLI, web, and mobile clients
- **Health Monitoring**: Built-in health checks and monitoring endpoints
- **Comprehensive API**: RESTful API for download management
- **Error Handling**: Graceful error handling with detailed error codes

## Table of Contents

- [Installation](#installation)
- [Quick Start](#quick-start)
- [Architecture](#architecture)
- [API Documentation](#api-documentation)
- [WebSocket Protocol](#websocket-protocol)
- [CLI Usage](#cli-usage)
- [Configuration](#configuration)
- [Testing](#testing)
- [Contributing](#contributing)
- [License](#license)

## Installation

### Prerequisites

- Node.js 18 or higher
- npm 8 or higher
- Git

### Clone and Install

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

**Note**: Make sure to install dependencies for both server and client directories separately. The root `package.json` only contains shared dependencies.

## Quick Start

### 1. Install Dependencies

Make sure you've installed dependencies for both server and client:

```bash
# Install server dependencies
cd server
npm install
cd ..

# Install client dependencies
cd client
npm install
cd ..
```

### 2. Start the Server

```bash
# Navigate to server directory and start
cd server
npm start
```

The server will start on:
- HTTP API: http://localhost:3000
- WebSocket: ws://localhost:8080

### 3. Start a Client

```bash
# In a new terminal, navigate to client directory
cd client
CLIENT_ID=my-client npm start
```

### 4. Download a File

```bash
# Using the CLI
node server/cli.js download --clientId my-client --filePath /path/to/file.txt

# Or via REST API
curl -X POST http://localhost:3000/api/v1/downloads \
  -H "Content-Type: application/json" \
  -d '{"clientId":"my-client","filePath":"/path/to/file.txt"}'
```

## Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   CLI Tool      │     │   Web Client   │     │  Mobile Client  │
└─────────┬───────┘     └─────────┬───────┘     └─────────┬───────┘
          │                       │                       │
          └───────────────────────┴───────────────────────┘
                                  │
                    ┌─────────────┴─────────────┐
                    │      WebSocket Gateway    │
                    └─────────────┬─────────────┘
                                  │
                    ┌─────────────┴─────────────┐
                    │      Download Server      │
                    └─────────────┬─────────────┘
                                  │
          ┌───────────────────────┴───────────────────────┐
          │                       │                       │
┌─────────┴───────┐     ┌─────────┴───────┐     ┌─────────┴───────┐
│  File Storage   │     │   Redis Cache   │     │   PostgreSQL    │
└─────────────────┘     └─────────────────┘     └─────────────────┘
```

### Core Components

- **WebSocket Server**: Handles real-time communication with clients
- **REST API Server**: Manages download operations and client registration
- **Download Manager**: Coordinates chunk distribution and tracking
- **Retry Engine**: Handles failed chunk retries with intelligent backoff
- **Client Registry**: Manages connected clients and their metadata

## API Documentation

### Base URL

```
http://localhost:3000/api/v1
```

### Endpoints

#### Health Check

```http
GET /health
```

#### Client Management

```http
POST   /clients        # Register a new client
GET    /clients        # List all clients
GET    /clients/{id}   # Get client details
```

#### Download Management

```http
POST   /downloads           # Initiate a download
GET    /downloads           # List all downloads
GET    /downloads/{id}      # Get download status
DELETE /downloads/{id}      # Cancel/delete a download
GET    /downloads/{id}/chunks # Get chunk status
```

### Example Responses

#### Download Initiation

```json
{
  "success": true,
  "requestId": "req-123456",
  "status": "pending"
}
```

#### Download Status

```json
{
  "success": true,
  "requestId": "req-123456",
  "clientId": "client-001",
  "status": "downloading",
  "progress": {
    "chunksReceived": 45,
    "totalChunks": 100,
    "percentage": 45.0,
    "bytesReceived": 47185920,
    "retriedChunks": []
  },
  "retryStats": {
    "totalRetries": 0,
    "retriedChunks": [],
    "retrySuccessRate": 0
  }
}
```

## WebSocket Protocol

### Connection

```javascript
const ws = new WebSocket('ws://localhost:8080');
```

### Message Types

#### Client to Server

- `REGISTER` - Register client with server
- `DOWNLOAD_REQUEST` - Request a file download
- `DOWNLOAD_ACK` - Acknowledge download request
- `FILE_CHUNK` - Send file chunk
- `DOWNLOAD_COMPLETE` - Mark download as complete
- `RETRY_CHUNK` - Request chunk retry
- `CANCEL_DOWNLOAD` - Cancel active download
- `PING` - Heartbeat ping

#### Server to Client

- `REGISTER_ACK` - Registration confirmation
- `DOWNLOAD_REQUEST` - Server requests download
- `CHUNK_REQUEST` - Request specific chunk
- `ERROR` - Error notification
- `PONG` - Heartbeat response

### Example Messages

#### Client Registration

```json
{
  "type": "REGISTER",
  "clientId": "client-001",
  "clientType": "cli",
  "version": "1.0.0"
}
```

#### File Chunk Transfer

```json
{
  "type": "FILE_CHUNK",
  "requestId": "req-123456",
  "chunkIndex": 0,
  "totalChunks": 100,
  "data": "base64-encoded-data",
  "checksum": "sha256-hash"
}
```

## CLI Usage

The CLI tool provides command-line access to the download system.

### Commands

#### Download a File

```bash
node server/cli.js download [options]

Options:
  -c, --clientId <id>     Client ID (required)
  -f, --filePath <path>   File path (required)
  -o, --output <path>     Output directory (default: ./downloads)
  -w, --watch            Watch progress with progress bar
  -t, --timeout <ms>      Download timeout (default: 30000)
  -h, --help             Show help
```

Examples:

```bash
# Basic download
node server/cli.js download -c my-client -f /path/to/file.txt

# Download with progress bar
node server/cli.js download -c my-client -f /path/to/file.txt -w

# Download to specific directory
node server/cli.js download -c my-client -f /path/to/file.txt -o /tmp/downloads
```

#### List Clients

```bash
node server/cli.js clients list

Options:
  -t, --type <type>   Filter by client type (cli, web, mobile)
  -s, --status <status> Filter by status (active, inactive)
  -l, --limit <num>   Limit results (default: 10)
```

#### Download Status

```bash
node server/cli.js downloads status <requestId>

Options:
  -w, --watch    Watch status updates
  -j, --json     Output as JSON
```

#### Cancel Download

```bash
node server/cli.js downloads cancel <requestId>
```

#### Health Check

```bash
node server/cli.js health
```

## Configuration

Both server and client have their own `.env` files in their respective directories. They do **not** read from a root `.env` file.

### Server Configuration

Create `server/.env`:

```env
PORT=3000
WS_PORT=8080
DOWNLOAD_DIR=./downloads
LOG_LEVEL=info
CHUNK_SIZE=1048576
MAX_CHUNK_RETRY_ATTEMPTS=3
CHUNK_RETRY_DELAY=1000
HEARTBEAT_INTERVAL=30000
DOWNLOAD_TIMEOUT=300000
```

See `server/.env.example` for all available options.

### Client Configuration

Create `client/.env`:

```env
CLIENT_ID=my-client
SERVER_WS_URL=ws://localhost:8080
LOG_LEVEL=info
RECONNECT_INTERVAL=5000
MAX_RECONNECT_ATTEMPTS=10
HEARTBEAT_INTERVAL=30000
```

See `client/.env.example` for all available options.

## Testing

### Unit Tests

```bash
# Run server tests
cd server
npm test
```

### Manual Testing

Various test files are available in the server directory:
- `test-download.js` - Basic download test
- `test-heartbeat.js` - Heartbeat mechanism test
- `test-retry-*.js` - Retry functionality tests
- `rest-api.test.js` - REST API tests

Run individual tests:

```bash
cd server
node test-download.js
node test-heartbeat.js
```

## Development

### Project Structure

```
silentmode-assessment/
├── client/                 # Client application
│   ├── src/               # Client source code
│   ├── data/              # Test data files
│   ├── logs/              # Client logs
│   └── package.json
├── server/                # Server application
│   ├── src/               # Server source code
│   ├── cli.js             # CLI tool
│   ├── logs/              # Server logs
│   ├── downloads/         # Download directory
│   ├── test-*.js          # Test files
│   └── package.json
├── shared/                # Shared code
│   └── protocol/          # Protocol definitions
└── README.md
```

### Running in Development

```bash
# Start server
cd server
npm start

# Start client (in a new terminal)
cd client
npm start
```

### Logging

Configure logging level with `LOG_LEVEL` environment variable:

- `debug` - Detailed debugging information
- `info` - General information (default)
- `warn` - Warning messages
- `error` - Error messages only

Logs are written to:
- Console output
- `logs/server.log` (server logs)
- `logs/client.log` (client logs)

## Performance Considerations

### Chunk Size

The default chunk size is 1MB. Adjust based on:
- Network conditions
- File sizes
- Memory constraints

```env
CHUNK_SIZE=1048576  # 1MB chunks
```

### Concurrent Downloads

The server supports concurrent downloads. Configure limits:

```env
MAX_CONCURRENT_DOWNLOADS=10
MAX_DOWNLOADS_PER_CLIENT=5
```

### Retry Strategy

The retry mechanism uses:
- Exponential backoff: `delay = baseDelay * (2 ^ attempt)`
- Maximum attempts: 3 (configurable)
- Maximum delay: 30 seconds
- Jitter: ±25% random variation

## Troubleshooting

### Common Issues

#### Missing Dependencies

If you encounter "Cannot find module" errors:

```bash
# Reinstall server dependencies
cd server
npm install
cd ..

# Reinstall client dependencies
cd client
npm install
cd ..
```

Common missing packages:
- `express-validator` - Install with: `cd server && npm install express-validator`
- `ws` - Install with: `npm install ws` (in root, server, or client as needed)

#### Server Won't Start

```bash
# Check if ports are in use
netstat -tlnp | grep -E ":(3000|8080)"

# Kill existing processes
pkill -f "node server"
```

#### Client Can't Connect

1. Verify server is running
2. Check WebSocket URL in client config
3. Verify firewall settings
4. Check client logs for errors

#### Downloads Fail

1. Check file path exists on client
2. Verify client is registered
3. Check server logs for errors
4. Verify sufficient disk space

#### Performance Issues

1. Adjust chunk size
2. Check network bandwidth
3. Monitor memory usage
4. Review retry configuration

### Debug Mode

Enable debug logging:

```bash
LOG_LEVEL=debug npm start
```

### Health Checks

Monitor system health:

```bash
# Server health
curl http://localhost:3000/api/v1/health

# Client status
node server/cli.js clients list
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Run the test suite
6. Submit a pull request

### Code Style

- Use ESLint for JavaScript linting
- Follow conventional commit messages
- Add JSDoc comments for new functions
- Update documentation for API changes

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Support

For support and questions:

- Check the README and inline code documentation
- Review test files for usage examples
- Check server and client logs for debugging

## Changelog

### v1.0.0

- Initial release
- Chunk-based download system
- WebSocket communication
- Retry mechanism
- CLI tool
- REST API
- Comprehensive testing suite