const axios = require('axios');

class ApiClient {
  constructor(baseUrl = 'http://localhost:3000') {
    this.baseUrl = baseUrl;
  }

  async initiateDownload(clientId, filePath, options = {}) {
    try {
      const response = await axios.post(`${this.baseUrl}/api/v1/downloads`, {
        clientId,
        filePath,
        outputPath: options.outputPath,
        timeout: options.timeout
      });
      return response.data;
    } catch (error) {
      if (error.response) {
        throw new Error(`API Error: ${error.response.data.error || 'Unknown error'}`);
      }
      throw error;
    }
  }

  async getDownloadStatus(requestId) {
    try {
      const response = await axios.get(`${this.baseUrl}/api/v1/downloads/${requestId}`);
      return response.data;
    } catch (error) {
      if (error.response && error.response.status === 404) {
        return null;
      }
      if (error.response) {
        throw new Error(`API Error: ${error.response.data.error || 'Unknown error'}`);
      }
      throw error;
    }
  }
}

module.exports = ApiClient;
