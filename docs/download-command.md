# Download Command

## Overview

The `download` command initiates a file download from a connected client to the server. It supports progress monitoring, custom timeouts, and real-time progress tracking.

## Usage

```bash
silentmode download <clientId> [options]
```

### Required Arguments

- `clientId` - The ID of the client to download from

### Options

- `-f, --file-path <path>` - (Required) File path on the client
- `-o, --output <path>` - Output path on the server (optional)
- `-t, --timeout <ms>` - Timeout in milliseconds (default: 30000)
- `-w, --watch` - Watch progress in real-time
- `--api-url <url>` - API server URL (default: http://localhost:3000)
- `-h, --help` - Display help for command

## Examples

### Basic download
```bash
silentmode download client-123 -f /home/user/document.pdf
```

### Download with custom output path
```bash
silentmode download client-123 -f /home/user/document.pdf -o /downloads/my-document.pdf
```

### Download with real-time progress monitoring
```bash
silentmode download client-123 -f /home/user/large-file.zip -w
```

### Download with custom timeout
```bash
silentmode download client-123 -f /home/user/data.csv -t 60000
```

### Using a different server
```bash
silentmode download client-123 -f /home/user/file.txt --api-url http://server:8080
```

## Flow

1. The command sends a POST request to `/api/v1/downloads` to initiate the download
2. The server validates the client connection and sends a DOWNLOAD_REQUEST message
3. If `--watch` is specified, the command polls `/api/v1/downloads/:requestId` every second
4. Progress is displayed showing:
   - Percentage complete
   - Chunks received / total chunks
   - Bytes received (in MB)
5. The command exits when:
   - Download completes successfully
   - Download fails
   - Download is cancelled
   - User presses Ctrl+C (when watching)

## Exit Codes

- `0` - Success
- `1` - Error (missing required option, API error, etc.)

## Error Handling

The command handles various error conditions:
- Missing required `--file-path` option
- Client not connected
- Network errors
- Invalid responses from the server

## Related Commands

- `silentmode downloads status <requestId>` - Check download status
- `silentmode downloads cancel <requestId>` - Cancel a download
- `silentmode clients list` - List connected clients
