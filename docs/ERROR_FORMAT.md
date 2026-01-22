# Error Response Format

This document describes the standardized error response format used across all SilentMode API endpoints.

## Error Response Structure

All error responses follow this consistent format:

```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human readable error message",
    "details": {},
    "timestamp": "2026-01-22T04:14:33.496Z"
  }
}
```

### Fields

- **success** (boolean): Always `false` for error responses
- **error** (object): Error details containing:
  - **code** (string): Machine-readable error code from the protocol
  - **message** (string): Human-readable description of the error
  - **details** (object): Additional context-specific error information
  - **timestamp** (string): ISO 8601 timestamp when the error occurred

## Error Codes

The following error codes are defined in the shared protocol:

| Error Code | HTTP Status | Description |
|------------|-------------|-------------|
| `CLIENT_NOT_FOUND` | 404 | Client ID not found in system |
| `CLIENT_NOT_CONNECTED` | 503 | Client exists but is not connected |
| `FILE_NOT_FOUND` | 404 | Requested file or download not found |
| `FILE_READ_ERROR` | 500 | Error reading file from disk |
| `PERMISSION_DENIED` | 403 | Insufficient permissions |
| `DOWNLOAD_IN_PROGRESS` | 409 | Download already in progress |
| `DOWNLOAD_TIMEOUT` | 408 | Download operation timed out |
| `CHUNK_CHECKSUM_FAILED` | 422 | Chunk checksum validation failed |
| `CHUNK_TRANSFER_FAILED` | 500 | Failed to transfer chunk |
| `INVALID_REQUEST` | 400 | Malformed or invalid request |

## Example Error Responses

### Download Not Found (404)

```json
{
  "success": false,
  "error": {
    "code": "FILE_NOT_FOUND",
    "message": "Download not found",
    "details": {},
    "timestamp": "2026-01-22T04:14:33.496Z"
  }
}
```

### Cannot Cancel Completed Download (409)

```json
{
  "success": false,
  "error": {
    "code": "DOWNLOAD_IN_PROGRESS",
    "message": "Cannot cancel completed download",
    "details": {},
    "timestamp": "2026-01-22T04:14:33.496Z"
  }
}
```

### Endpoint Not Found (404)

```json
{
  "success": false,
  "error": {
    "code": "FILE_NOT_FOUND",
    "message": "Endpoint not found",
    "details": {
      "method": "GET",
      "path": "/api/v1/nonexistent"
    },
    "timestamp": "2026-01-22T04:14:33.496Z"
  }
}
```

### Validation Error (400)

```json
{
  "success": false,
  "error": {
    "code": "INVALID_REQUEST",
    "message": "Validation failed",
    "details": {
      "field": "filePath",
      "value": "invalid/path"
    },
    "timestamp": "2026-01-22T04:14:33.496Z"
  }
}
```

## Error Handling Implementation

### Server-Side

The error handling is implemented using Express middleware:

1. **Error Handler Middleware** (`server/src/middleware/error-handler.js`)
   - Catches all unhandled errors
   - Formats responses consistently
   - Maps error codes to HTTP status codes

2. **Helper Functions**
   - `createErrorResponse()` - Creates standardized error objects
   - `createError()` - Creates custom errors with protocol codes
   - `asyncHandler()` - Wraps async routes to catch errors

3. **Integration**
   - All routes use `asyncHandler` to catch async errors
   - 404 handler uses standardized format
   - Global error handler ensures consistency

### Client-Side

When handling API responses, clients should:

1. Check the `success` field first
2. If `success` is `false`, read the `error` object
3. Use the `code` field for programmatic error handling
4. Display the `message` field to users
5. Use `details` for additional context if needed

## Best Practices

1. **Always use defined error codes** from the shared protocol
2. **Provide meaningful messages** that help users understand the issue
3. **Include relevant details** for debugging context
4. **Log full errors** server-side for troubleshooting
5. **Handle errors gracefully** on the client side
