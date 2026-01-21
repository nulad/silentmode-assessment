// Integration example showing client registration protocol
import WebSocketClient from '../client/src/websocket-client.js';
import logger from '../client/src/utils/logger.js';

// Set environment variables
process.env.CLIENT_ID = 'restaurant-001';
process.env.SERVER_WS_URL = 'ws://localhost:8080';

async function demonstrateRegistration() {
  console.log('=== SilentMode Client Registration Example ===\n');
  
  const client = new WebSocketClient(process.env.CLIENT_ID);
  
  try {
    // Connect to server
    await client.connect();
    
    // Wait a moment for registration
    await new Promise(resolve => setTimeout(resolve, 500));
    
    if (client.isConnected()) {
      console.log('✓ Client successfully registered with server');
      console.log(`  Client ID: ${process.env.CLIENT_ID}`);
      console.log(`  Server: ${process.env.SERVER_WS_URL}`);
      
      // Example of requesting a download (will show not implemented yet)
      console.log('\nAttempting to request a file...');
      client.requestDownload('/path/to/menu.pdf');
      
      // Wait for response
      await new Promise(resolve => setTimeout(resolve, 500));
    } else {
      console.log('✗ Client registration failed');
    }
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    client.disconnect();
    console.log('\nDisconnected from server');
    process.exit(0);
  }
}

// Run demonstration
demonstrateRegistration();
