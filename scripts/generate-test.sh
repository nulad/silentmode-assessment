#!/bin/bash

# Test File Generator Script
# Usage: ./generate-test.sh [filename] [sizeMB]

set -e

FILENAME=${1:-"test-100mb.dat"}
SIZEMB=${2:-100}
OUTPUT_DIR="test-files"

# Create output directory
mkdir -p "$OUTPUT_DIR"

echo "Generating ${SIZEMB}MB test file: $FILENAME"

# Generate file with random data
dd if=/dev/urandom of="$OUTPUT_DIR/$FILENAME" bs=1M count="$SIZEMB" status=progress

# Generate checksum
echo "Generating checksum..."
sha256sum "$OUTPUT_DIR/$FILENAME" > "$OUTPUT_DIR/$FILENAME.sha256"
echo "Checksum saved to: $OUTPUT_DIR/$FILENAME.sha256"

# Generate file with pattern for testing verification
PATTERN_FILE="${FILENAME%.*}-pattern.dat"
echo "Generating pattern file: $PATTERN_FILE"
python3 -c "
import sys
size = $SIZEMB * 1024 * 1024
chunk_size = 1024 * 1024  # 1MB
pattern = b'TEST-PATTERN-' * (chunk_size // 14)

with open('$OUTPUT_DIR/$PATTERN_FILE', 'wb') as f:
    written = 0
    chunk_num = 0
    while written < size:
        chunk = pattern[:min(chunk_size, size - written)]
        if chunk_num % 10 == 0:
            marker = f'\\n\\n=== CHUNK {chunk_num} ===\\n\\n'.encode()
            chunk = chunk[:len(chunk)-len(marker)] + marker
        f.write(chunk)
        written += len(chunk)
        chunk_num += 1
        if chunk_num % 10 == 0:
            print(f'Progress: {written//(1024*1024)}/{size//(1024*1024)} MB', end='\\r')
    print()
"

sha256sum "$OUTPUT_DIR/$PATTERN_FILE" > "$OUTPUT_DIR/$PATTERN_FILE.sha256"

echo "✓ Test files generated successfully!"
echo ""
echo "Files created:"
ls -lh "$OUTPUT_DIR/$FILENAME" "$OUTPUT_DIR/$FILENAME.sha256" "$OUTPUT_DIR/$PATTERN_FILE" "$OUTPUT_DIR/$PATTERN_FILE.sha256"
