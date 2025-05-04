// server/config.js
/**
 * Simplified configuration module for SolidFed server
 * Manages environment variables and default settings
 */
require('dotenv').config();

/**
 * Server configuration object
 * Loads values from environment or uses defaults
 */
const config = {
  // Server settings
  port: parseInt(process.env.PORT) || 4000,
  
  // Solid connection settings
  solid: {
    oidcIssuer: process.env.SOLID_OIDC_ISSUER || 'https://solidcommunity.net',
    clientId: process.env.SOLID_CLIENT_ID,
    clientSecret: process.env.SOLID_CLIENT_SECRET,
    podRoot: process.env.POD_ROOT || 'https://solidfed.solidcommunity.net/solidfed/'
  },
  
  // Aggregation settings
  aggregation: {
    historyDir: process.env.HISTORY_DIR || './aggregation_history',
    saveHistory: process.env.SAVE_HISTORY !== 'false',
    // Asynchronous aggregation settings
    learningRate: parseFloat(process.env.LEARNING_RATE) || 0.1, // Learning rate for async updates
    backupModels: process.env.BACKUP_MODELS !== 'false', // Enable model backups by default
    maxBackups: parseInt(process.env.MAX_BACKUPS) || 10, // Maximum number of model backups to keep
  }
};

/**
 * Validate the configuration and throw errors for missing required fields
 */
function validateConfig() {
  // Check required Solid settings
  if (!config.solid.oidcIssuer) {
    throw new Error('SOLID_OIDC_ISSUER is required');
  }
  if (!config.solid.clientId) {
    throw new Error('SOLID_CLIENT_ID is required');
  }
  if (!config.solid.clientSecret) {
    throw new Error('SOLID_CLIENT_SECRET is required');
  }
  if (!config.solid.podRoot) {
    throw new Error('POD_ROOT is required');
  }
  
  // Validate async settings
  if (config.aggregation.learningRate <= 0 || config.aggregation.learningRate > 1) {
    throw new Error('LEARNING_RATE must be between 0 and 1');
  }
  if (config.aggregation.maxBackups < 0) {
    throw new Error('MAX_BACKUPS must be non-negative');
  }
}

/**
 * Get a human-readable configuration summary
 * @returns {string} - Configuration summary
 */
function getConfigSummary() {
  return `
SolidFed Server Configuration:
------------------------------
Server Port: ${config.port}
Solid Pod Root: ${config.solid.podRoot}

Aggregation Settings:
- Learning Rate: ${config.aggregation.learningRate}
- Save History: ${config.aggregation.saveHistory ? 'Yes' : 'No'}
- History Directory: ${config.aggregation.historyDir}
- Backup Models: ${config.aggregation.backupModels ? 'Yes' : 'No'}
- Max Backups: ${config.aggregation.maxBackups}
`;
}

// Validate on module load
try {
  validateConfig();
  console.log(getConfigSummary());
} catch (error) {
  console.error(`Configuration error: ${error.message}`);
  process.exit(1);
}

// Export both config and getConfigSummary
module.exports = { 
  config, 
  getConfigSummary 
};