#!/usr/bin/env node
const axios = require('axios');

const SERVER_URL = process.env.SERVER_URL || 'http://localhost:3001';

async function testClientsGetEndpoint() {
  console.log('Testing GET /api/v1/clients/:clientId endpoint...\n');
  
  try {
    // First, get list of all clients to find a valid client ID
    console.log('1. Getting list of all clients...');
    const listResponse = await axios.get(`${SERVER_URL}/api/v1/clients`);
    
    if (!listResponse.data.success || listResponse.data.clients.length === 0) {
      console.log('No clients connected. Skipping specific client test.\n');
      return;
    }
    
    const testClient = listResponse.data.clients[0];
    console.log(`Found client: ${testClient.clientId}\n`);
    
    // Test getting specific client
    console.log(`2. Getting specific client: ${testClient.clientId}`);
    const getResponse = await axios.get(`${SERVER_URL}/api/v1/clients/${testClient.clientId}`);
    
    if (!getResponse.data.success) {
      console.error('Failed to get client details');
      console.error(getResponse.data);
      process.exit(1);
    }
    
    const client = getResponse.data.client;
    console.log('✓ Client details retrieved successfully:\n');
    console.log(`  Client ID:      ${client.clientId}`);
    console.log(`  Connection ID:  ${client.connectionId}`);
    console.log(`  Status:         ${client.status}`);
    console.log(`  Connected At:   ${client.connectedAt}`);
    console.log(`  Last Heartbeat: ${client.lastHeartbeat}`);
    
    if (Object.keys(client.metadata).length > 0) {
      console.log('  Metadata:');
      Object.entries(client.metadata).forEach(([key, value]) => {
        console.log(`    ${key}: ${value}`);
      });
    }
    
    // Test with non-existent client
    console.log('\n3. Testing with non-existent client ID...');
    try {
      await axios.get(`${SERVER_URL}/api/v1/clients/non-existent-client`);
      console.error('✗ Should have returned 404 for non-existent client');
      process.exit(1);
    } catch (error) {
      if (error.response && error.response.status === 404) {
        console.log('✓ Correctly returned 404 for non-existent client');
        console.log(`  Error: ${error.response.data.error}`);
      } else {
        console.error('✗ Unexpected error:', error.message);
        process.exit(1);
      }
    }
    
    console.log('\n✅ All tests passed!');
    
  } catch (error) {
    console.error('Test failed:', error.message);
    if (error.response) {
      console.error('Response:', error.response.data);
    }
    process.exit(1);
  }
}

testClientsGetEndpoint();
