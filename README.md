# Silentmode Assessment

A robust chunk-based file download system with retry logic, WebSocket communication, and comprehensive error handling.

## Features

- **Chunk-based Downloads**: Large files are downloaded in manageable chunks for reliability
- **WebSocket Communication**: Real-time bidirectional communication between client and server
- **Retry Logic**: Automatic retry with exponential backoff for failed chunks
- **Progress Tracking**: Real-time download progress with ETA calculation
- **Concurrent Downloads**: Support for multiple simultaneous downloads
- **File Integrity**: SHA256 checksum verification for downloaded files
- **CLI Tool**: Command-line interface for easy interaction
- **REST API**: RESTful endpoints for download management
- **Comprehensive Testing**: E2E tests, retry scenario tests, and unit tests

## Quick Start

### Prerequisites

- Node.js 18 or later
- npm 8 or later
- Python 3 (optional, for some test utilities)

### Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd silentmode-assessment
```

2. Run the setup script:
```bash
./scripts/setup.sh
```

This will:
- Install all dependencies
- Create necessary directories
- Generate test files
- Set up environment configuration

### Running the System

#### Start the Server
```bash
npm run server:start
```

The server will start on `http://localhost:3000` by default.

#### Start the Client
```bash
npm run client:start
```

#### Use the CLI Tool
```bash
# List available commands
node cli.js --help

# Start a download
node cli.js download <download-id> --output <filename>

# List all downloads
node cli.js list

# Check download status
node cli.js status <download-id>

# Cancel a download
node cli.js cancel <download-id>
```

## Architecture

The system consists of three main components:

### Server
- WebSocket server for real-time chunk delivery
- REST API for download management
- Chunk manager with retry logic
- File serving and integrity verification

### Client
- WebSocket client for receiving chunks
- Download manager with progress tracking
- Automatic retry with exponential backoff
- File reconstruction and verification

### CLI Tool
- Command-line interface for all operations
- Progress bars and status reporting
- Batch operations support

## API Documentation

### REST Endpoints

- `GET /health` - Health check
- `POST /api/clients` - Register a new client
- `GET /api/clients` - List all clients
- `GET /api/clients/{id}` - Get client details
- `POST /api/downloads` - Start a new download
- `GET /api/downloads` - List all downloads
- `GET /api/downloads/{id}` - Get download status
- `DELETE /api/downloads/{id}` - Cancel/delete a download

### WebSocket Messages

#### Client to Server
```json
{
  "type": "download",
  "id": "download-id"
}
```

#### Server to Client
```json
{
  "type": "chunk",
  "chunkNumber": 1,
  "totalChunks": 100,
  "data": "base64-encoded-chunk-data"
}
```

## Testing

### Run All Tests
```bash
npm test
```

### E2E Tests
```bash
./scripts/e2e-test.sh
```

### Retry Scenario Tests
```bash
./scripts/retry-test.sh
```

### Generate Test Files
```bash
# Generate a 100MB test file
./scripts/generate-test.sh test-100mb.dat 100

# Generate multiple test files
./scripts/generate-test.sh
```

## Configuration

### Environment Variables

#### Server (.env)
```
PORT=3000
HOST=localhost
DOWNLOAD_DIR=./downloads
CHUNK_SIZE=1048576
MAX_CONCURRENT_DOWNLOADS=10
```

#### Client (.env)
```
SERVER_URL=ws://localhost:3000
RETRY_ATTEMPTS=3
RETRY_DELAY=1000
CHUNK_TIMEOUT=5000
```

## Development

### Project Structure
```
silentmode-assessment/
├── client/                 # Client application
│   ├── src/
│   │   ├── index.js       # Main client entry point
│   │   ├── file-handler.js # File operations
│   │   └── config.js      # Client configuration
│   └── package.json
├── server/                 # Server application
│   ├── src/
│   │   ├── index.js       # Main server entry point
│   │   ├── chunk-manager.js # Chunk management
│   │   └── utils/         # Server utilities
│   └── package.json
├── shared/                 # Shared code
│   └── protocol.js        # WebSocket protocol definitions
├── scripts/               # Utility scripts
│   ├── setup.sh          # Environment setup
│   ├── e2e-test.sh       # End-to-end tests
│   ├── retry-test.sh     # Retry scenario tests
│   └── generate-test.sh  # Test file generator
├── cli.js                # CLI tool
└── package.json          # Root package.json
```

### Adding New Features

1. Server-side features go in `server/src/`
2. Client-side features go in `client/src/`
3. Shared code goes in `shared/`
4. Update protocol definitions in `shared/protocol.js`
5. Add tests for new functionality

### Code Style

- Use ESLint configuration
- Follow JavaScript Standard Style
- Add JSDoc comments for public APIs
- Write unit tests for new modules

## Troubleshooting

### Common Issues

1. **Server won't start**
   - Check if port 3000 is available
   - Verify all dependencies are installed
   - Check server logs in `logs/server.log`

2. **Client can't connect**
   - Ensure server is running
   - Check firewall settings
   - Verify WebSocket URL in client config

3. **Downloads fail**
   - Check available disk space
   - Verify file permissions
   - Check retry configuration

4. **Tests fail**
   - Ensure test files are generated
   - Check if server is running for E2E tests
   - Verify all dependencies are installed

### Debug Mode

Enable debug logging:
```bash
DEBUG=* npm run server:start
DEBUG=* node cli.js download <id>
```

## Performance Tuning

### Server Optimization
- Adjust `CHUNK_SIZE` based on network conditions
- Tune `MAX_CONCURRENT_DOWNLOADS` based on server capacity
- Use compression for large files

### Client Optimization
- Adjust retry parameters for your network
- Tune chunk timeout values
- Use parallel chunk downloads for faster speeds

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Run the test suite
6. Submit a pull request

## License

[License information]

## Support

For support and questions:
- Check the documentation in `docs/`
- Review the test scripts in `scripts/`
- Check the logs in `logs/`