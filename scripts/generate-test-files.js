#!/usr/bin/env node

/**
 * Test File Generator
 * 
 * Generates test files of various sizes for testing the chunk download system.
 * Supports generating files with specific patterns for verification.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

class TestFileGenerator {
    constructor() {
        this.defaultOutputDir = path.join(__dirname, '..', 'test-files');
        this.chunkSize = 1024 * 1024; // 1MB chunks
    }

    /**
     * Generate a test file with specific size
     * @param {string} filename - Output filename
     * @param {number} sizeMB - Size in megabytes
     * @param {Object} options - Additional options
     */
    generateFile(filename, sizeMB, options = {}) {
        const {
            outputDir = this.defaultOutputDir,
            pattern = 'random',
            chunkMarkers = true
        } = options;

        const outputPath = path.join(outputDir, filename);
        const totalBytes = sizeMB * 1024 * 1024;
        
        // Ensure output directory exists
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }

        console.log(`Generating ${sizeMB}MB test file: ${filename}`);
        
        const writeStream = fs.createWriteStream(outputPath);
        let bytesWritten = 0;
        let chunkNumber = 0;

        return new Promise((resolve, reject) => {
            const writeChunk = () => {
                while (bytesWritten < totalBytes) {
                    const remainingBytes = totalBytes - bytesWritten;
                    const chunkBytes = Math.min(this.chunkSize, remainingBytes);
                    
                    let chunk;
                    
                    switch (pattern) {
                        case 'sequential':
                            chunk = this.generateSequentialChunk(chunkBytes, chunkNumber);
                            break;
                        case 'random':
                            chunk = this.generateRandomChunk(chunkBytes);
                            break;
                        case 'pattern':
                            chunk = this.generatePatternChunk(chunkBytes, chunkNumber);
                            break;
                        default:
                            chunk = this.generateRandomChunk(chunkBytes);
                    }
                    
                    // Add chunk marker if enabled
                    if (chunkMarkers && chunkNumber % 10 === 0) {
                        const marker = `\n\n=== CHUNK ${chunkNumber} ===\n\n`;
                        const markerBytes = Buffer.from(marker);
                        
                        // Adjust chunk size to accommodate marker
                        if (chunkBytes > markerBytes.length) {
                            chunk = chunk.slice(0, chunkBytes - markerBytes.length);
                            chunk = Buffer.concat([chunk, markerBytes]);
                        }
                    }
                    
                    const canContinue = writeStream.write(chunk);

                    bytesWritten += chunkBytes;
                    chunkNumber++;

                    if (!canContinue) {
                        writeStream.once('drain', writeChunk);
                        return;
                    }
                    
                    // Progress indicator
                    if (chunkNumber % 10 === 0) {
                        const progress = ((bytesWritten / totalBytes) * 100).toFixed(1);
                        process.stdout.write(`\rProgress: ${progress}%`);
                    }
                }
                
                writeStream.end();
            };
            
            writeStream.on('finish', () => {
                console.log(`\n✓ Generated ${filename} (${bytesWritten} bytes)`);
                resolve(outputPath);
            });
            
            writeStream.on('error', reject);
            
            writeChunk();
        });
    }

    /**
     * Generate a chunk with sequential bytes
     */
    generateSequentialChunk(size, chunkNumber) {
        const chunk = Buffer.alloc(size);
        const startByte = (chunkNumber * size) % 256;
        
        for (let i = 0; i < size; i++) {
            chunk[i] = (startByte + i) % 256;
        }
        
        return chunk;
    }

    /**
     * Generate a chunk with random bytes
     */
    generateRandomChunk(size) {
        return crypto.randomBytes(size);
    }

    /**
     * Generate a chunk with a repeating pattern
     */
    generatePatternChunk(size, chunkNumber) {
        const pattern = `CHUNK-${chunkNumber.toString().padStart(4, '0')}-`;
        const patternBytes = Buffer.from(pattern);
        const chunk = Buffer.alloc(size);
        
        let offset = 0;
        while (offset < size) {
            const remaining = size - offset;
            const toWrite = Math.min(patternBytes.length, remaining);
            patternBytes.copy(chunk, offset, 0, toWrite);
            offset += toWrite;
        }
        
        return chunk;
    }

    /**
     * Generate a checksum file for verification
     */
    generateChecksum(filePath) {
        const hash = crypto.createHash('sha256');
        const stream = fs.createReadStream(filePath);
        
        return new Promise((resolve, reject) => {
            stream.on('data', data => hash.update(data));
            stream.on('end', () => {
                const checksum = hash.digest('hex');
                const checksumFile = filePath + '.sha256';
                fs.writeFileSync(checksumFile, checksum);
                console.log(`✓ Checksum saved: ${checksumFile}`);
                resolve(checksum);
            });
            stream.on('error', reject);
        });
    }

    /**
     * Generate multiple test files
     */
    async generateSuite() {
        console.log('Generating test file suite...\n');
        
        const files = [
            { name: 'test-1mb.dat', size: 1, pattern: 'sequential' },
            { name: 'test-10mb.dat', size: 10, pattern: 'random' },
            { name: 'test-50mb.dat', size: 50, pattern: 'pattern' },
            { name: 'test-100mb.dat', size: 100, pattern: 'random' },
            { name: 'test-large-chunk.dat', size: 5, pattern: 'sequential', chunkMarkers: true }
        ];
        
        for (const file of files) {
            await this.generateFile(file.name, file.size, {
                pattern: file.pattern,
                chunkMarkers: file.chunkMarkers || false
            });
            await this.generateChecksum(path.join(this.defaultOutputDir, file.name));
        }
        
        console.log('\n✓ Test file suite generation complete!');
    }
}

// CLI interface
if (require.main === module) {
    const generator = new TestFileGenerator();
    const args = process.argv.slice(2);
    
    if (args.length === 0) {
        // Generate full suite
        generator.generateSuite().catch(console.error);
    } else if (args[0] === '--help' || args[0] === '-h') {
        console.log(`
Test File Generator

Usage:
  node generate-test-files.js [filename] [sizeMB] [pattern]

Options:
  filename    Output filename (optional, default: generates full suite)
  sizeMB      File size in MB (required if filename provided)
  pattern     Pattern type: random | sequential | pattern (default: random)

Examples:
  node generate-test-files.js                    # Generate full test suite
  node generate-test-files.js test.dat 100       # Generate 100MB random file
  node generate-test-files.js test.dat 50 seq    # Generate 50MB sequential file
        `);
    } else {
        const [filename, sizeMB, pattern] = args;
        const size = parseInt(sizeMB);
        
        if (!filename || !size || isNaN(size)) {
            console.error('Error: Please provide filename and valid size');
            process.exit(1);
        }
        
        generator.generateFile(filename, size, { pattern })
            .then(path => generator.generateChecksum(path))
            .catch(console.error);
    }
}

module.exports = TestFileGenerator;
