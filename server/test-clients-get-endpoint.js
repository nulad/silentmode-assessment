const axios = require('axios');

const SERVER_URL = 'http://localhost:3001';

async function testClientsGetEndpoint() {
  console.log('Testing GET /api/v1/clients/:clientId endpoint...\n');
  
  try {
    // First, get all clients to find a valid client ID
    const listResponse = await axios.get(`${SERVER_URL}/api/v1/clients`);
    
    if (!listResponse.data.success) {
      throw new Error('Failed to get clients list');
    }
    
    if (listResponse.data.clients.length === 0) {
      console.log('No clients connected. Skipping tests.');
      return;
    }
    
    const testClient = listResponse.data.clients[0];
    const clientId = testClient.clientId;
    
    // Test 1: Get existing client
    console.log('1. Testing get existing client...');
    const response = await axios.get(`${SERVER_URL}/api/v1/clients/${clientId}`);
    
    if (!response.data.success) {
      throw new Error('Expected success response');
    }
    
    if (!response.data.client) {
      throw new Error('Expected client object in response');
    }
    
    if (response.data.client.clientId !== clientId) {
      throw new Error('Client ID mismatch');
    }
    
    console.log('✓ Successfully retrieved client details');
    console.log(`  Client ID: ${response.data.client.clientId}`);
    console.log(`  Status: ${response.data.client.status}`);
    console.log(`  Connected At: ${response.data.client.connectedAt}\n`);
    
    // Test 2: Get non-existent client
    console.log('2. Testing get non-existent client...');
    try {
      await axios.get(`${SERVER_URL}/api/v1/clients/non-existent-client-12345`);
      throw new Error('Expected 404 error');
    } catch (error) {
      if (error.response && error.response.status === 404) {
        console.log('✓ Correctly returned 404 for non-existent client');
        if (error.response.data.success === false && error.response.data.error) {
          console.log(`  Error message: ${error.response.data.error}\n`);
        }
      } else {
        throw error;
      }
    }
    
    console.log('✅ All endpoint tests passed!');
    
  } catch (error) {
    if (error.code === 'ECONNREFUSED') {
      console.error('Server is not running. Please start the server first.');
    } else {
      console.error('Test failed:', error.message);
    }
    process.exit(1);
  }
}

testClientsGetEndpoint();
