# DELETE /api/v1/downloads/:requestId

Cancels an in-progress download request.

## Request

```http
DELETE /api/v1/downloads/:requestId
```

### Parameters

- `requestId` (path, required): The unique identifier of the download request to cancel

## Response

### Success (200)

Returns a success response with the cancelled download status.

```json
{
  "success": true,
  "requestId": "req_1234567890_abcdef",
  "status": "cancelled"
}
```

### Errors

#### 404 Not Found

Download with the specified `requestId` does not exist.

```json
{
  "success": false,
  "error": "Download not found"
}
```

#### 409 Conflict

Cannot cancel a download that is already completed or failed.

```json
{
  "success": false,
  "error": "Cannot cancel completed download"
}
```

## Behavior

When a download is successfully cancelled:

1. The download status is updated to `cancelled`
2. A `CANCEL_DOWNLOAD` message is sent to the client handling the download
3. Temporary files associated with the download are cleaned up
4. The download can no longer be resumed or retried

## Example

```bash
# Cancel a download
curl -X DELETE http://localhost:3000/api/v1/downloads/req_1234567890_abcdef

# Response
{
  "success": true,
  "requestId": "req_1234567890_abcdef",
  "status": "cancelled"
}
```

## Notes

- Only downloads with status `pending` or `in_progress` can be cancelled
- Completed downloads cannot be cancelled (returns 409)
- Failed downloads cannot be cancelled (returns 409)
- The cancellation is irreversible once processed
