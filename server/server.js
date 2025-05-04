// server/server.js
require('dotenv').config();
const express = require('express');
const { Session } = require('@inrupt/solid-client-authn-node');
const { config, getConfigSummary } = require('./config');
const ModelService = require('./modelService');
const {
  getSolidDatasetWithAcl,
  getResourceAcl,
  createAcl,
  setAgentResourceAccess,
  saveAclFor,
  createContainerAt,
  setAgentDefaultAccess
} = require('@inrupt/solid-client');

const app = express();
app.use(express.json());

// Extract configuration
const {
  port: PORT,
  solid: { oidcIssuer, clientId, clientSecret, podRoot: POD_ROOT },
  aggregation: { 
    learningRate,
  }
} = config;

// Service account session
let serviceSession = null;
// Model service instance
let modelService = null;
// Ready flag to track initialization
let serverReady = false;
// Promise that resolves when initialization is complete
let initPromise = null;

/**
 * Initialize the server components
 * @returns {Promise<void>}
 */
async function initializeServer() {
  if (initPromise) {
    return initPromise;
  }

  initPromise = (async () => {
    try {
      console.log('Initializing server...');
      
      // Validate required configuration
      if (!oidcIssuer || !clientId || !clientSecret || !POD_ROOT) {
        throw new Error('Missing required Solid configuration in environment variables');
      }

      // Create and login the service session
      serviceSession = new Session();
      await serviceSession.login({
        oidcIssuer,
        clientId,
        clientSecret,
      });
      console.log('✅ Service logged in as', serviceSession.info.webId);
      console.log('📁 Pod Root:', POD_ROOT);
      console.log(`🔄 Learning Rate: ${learningRate}`);
      
      // Initialize model service
      modelService = new ModelService(serviceSession, POD_ROOT);
      
      // Set server as ready
      serverReady = true;
      console.log('🚀 Server initialization complete');
    } catch (error) {
      console.error('❌ Server initialization failed:', error);
      // Reset initialization promise to allow retry
      initPromise = null;
      throw error;
    }
  })();

  return initPromise;
}

/**
 * Middleware to ensure the server is initialized before handling requests
 */
function ensureInitialized(req, res, next) {
  if (serverReady) {
    // Server is already initialized, proceed
    return next();
  }

  // Server not initialized yet, try to initialize
  initializeServer()
    .then(() => next())
    .catch(error => {
      res.status(503).json({
        success: false,
        error: 'Server initialization in progress or failed',
        details: error.message
      });
    });
}

// — Ensure a container exists, else create it —
async function ensureContainer(url) {
  try {
    console.log(`Checking container: ${url}`);
    const head = await serviceSession.fetch(url, { method: 'HEAD' });
    if (!head.ok) {
      console.log(`🆕 Creating container: ${url}`);
      await createContainerAt(url, { fetch: serviceSession.fetch });
      console.log(`✅ Container created: ${url}`);
    } else {
      console.log(`✅ Container exists: ${url}`);
    }
    return true;
  } catch (e) {
    console.error(`❌ Container operation failed: ${e.message}`);
    return false;
  }
}

// — Ensure model files exist —
async function ensureModelFiles(modelFolderUrl) {
  try {
    // Check for globalModel.bin
    const globalModelUrl = `${modelFolderUrl}globalModel.bin`;
    const modelResponse = await serviceSession.fetch(globalModelUrl, { method: 'HEAD' });
    if (!modelResponse.ok) {
      console.log(`Creating empty globalModel.bin`);
      await serviceSession.fetch(globalModelUrl, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/octet-stream' },
        body: Buffer.from([]) // Empty file
      });
    }
    
    // Check for clientTrainer.py
    const trainerUrl = `${modelFolderUrl}clientTrainer.py`;
    const trainerResponse = await serviceSession.fetch(trainerUrl, { method: 'HEAD' });
    if (!trainerResponse.ok) {
      console.log(`Creating sample clientTrainer.py`);
      
      const sampleCode = `
# Sample federated learning trainer script
import numpy as np

# This is a placeholder. In a real system, this would train on local data
def train():
    print("Training on local data...")
    # Simulate training by creating random weights
    weights = np.random.rand(10)
    
    # Save as raw binary file
    with open('localWeights.bin', 'wb') as f:
        f.write(weights.tobytes())
    
    print("Training complete. Weights saved to localWeights.bin")

if __name__ == "__main__":
    train()
`;
      
      await serviceSession.fetch(trainerUrl, {
        method: 'PUT',
        headers: { 'Content-Type': 'text/plain' },
        body: sampleCode
      });
    }
    
    return true;
  } catch (e) {
    console.error(`Failed to ensure model files: ${e.message}`);
    return false;
  }
}

// — Grant both resource AND default access for proper inheritance —
async function grantFolderAccessWithInheritance(resourceUrl, agentWebId) {
  try {
    console.log(`Setting resource and default access for ${agentWebId} on ${resourceUrl}`);
    
    // Get the dataset with its ACLs
    const dsWithAcl = await getSolidDatasetWithAcl(resourceUrl, { fetch: serviceSession.fetch });
    
    // CRITICAL: Get existing ACL or create a new one - preserves ownership rights
    let acl = getResourceAcl(dsWithAcl);
    if (!acl) {
      console.log('No existing ACL found, creating a new one');
      acl = createAcl(dsWithAcl);
    } else {
      console.log('Found existing ACL, preserving it');
    }
    
    // 1. Set resource access for the container itself
    console.log('Setting resource access (for container)');
    acl = setAgentResourceAccess(acl, agentWebId, {
      read: true,
      append: false,
      write: false,
      control: false,
    });
    
    // 2. Set default access for the contents inside the container
    console.log('Setting default access (for files inside)');
    acl = setAgentDefaultAccess(acl, agentWebId, {
      read: true,
      append: false,
      write: false,
      control: false,
    });
    
    // Save the ACL
    await saveAclFor(dsWithAcl, acl, { fetch: serviceSession.fetch });
    console.log(`✅ Access permissions granted to ${agentWebId}`);
    return true;
  } catch (e) {
    console.error(`❌ ACL error: ${e.message}`);
    throw e;
  }
}

// Apply the initialization middleware to all routes
app.use(ensureInitialized);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    success: true,
    status: 'ok',
    ready: serverReady,
    version: process.env.npm_package_version || '1.0.0',
    learningRate: learningRate
  });
});

// Registration endpoint
app.post('/register', async (req, res) => {
  const { webId, modelName } = req.body;
  
  // Validate required parameters
  if (!webId || !modelName) {
    return res.status(400).json({ 
      success: false, 
      error: 'Missing required parameters',
      details: 'Both webId and modelName are required'
    });
  }

  try {
    // Get the model folder URL
    const modelFolderUrl = modelService.getModelFolderUrl(modelName);
    console.log(`Processing registration for ${webId} on model: ${modelName}`);
    console.log(`Model folder URL: ${modelFolderUrl}`);

    // Ensure the container exists
    if (!await ensureContainer(modelFolderUrl)) {
      return res.status(500).json({ 
        success: false, 
        error: 'Registration failed',
        details: `Failed to ensure container at ${modelFolderUrl}`
      });
    }
    
    // Ensure model files exist
    if (!await ensureModelFiles(modelFolderUrl)) {
      console.warn(`⚠️ Warning: Could not create model files`);
      // Continue anyway - files may be created later
    }
    
    // Grant permissions with inheritance
    if (!await grantFolderAccessWithInheritance(modelFolderUrl, webId)) {
      return res.status(500).json({ 
        success: false, 
        error: 'Registration failed',
        details: `Failed to set permissions for ${webId}`
      });
    }

    // Return model folder URL and settings to the client
    res.json({
      success: true,
      message: `Granted Reader on ${modelFolderUrl} to ${webId}`,
      modelUrl: modelFolderUrl,
      learningRate: learningRate
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Registration failed',
      details: error.message
    });
  }
});

// Upload endpoint
app.post('/upload', express.raw({ type: 'application/octet-stream', limit: '100mb' }), async (req, res) => {
  try {
    // Extract required headers
    const webId = req.header('webid');
    const round = req.header('round');
    const modelName = req.header('modelName');
    
    // Validate required headers
    if (!webId || !round || !modelName) {
      return res.status(400).json({ 
        success: false, 
        error: 'Missing required headers',
        details: 'webid, round, and modelName headers are required'
      });
    }
    
    // Validate request body
    if (!req.body || req.body.length === 0) {
      return res.status(400).json({ 
        success: false, 
        error: 'Empty request body',
        details: 'No model weights data was provided'
      });
    }

    // Build the model's folder URL
    const modelFolderUrl = modelService.getModelFolderUrl(modelName);
    console.log(`Processing upload for ${modelName} from ${webId}, round ${round}`);

    // Ensure the container exists
    if (!await ensureContainer(modelFolderUrl)) {
      return res.status(500).json({ 
        success: false, 
        error: 'Upload failed',
        details: `Failed to ensure container at ${modelFolderUrl}`
      });
    }

    // Process the model update with metadata
    const metadata = {
      webId,
      modelName,
      round
    };
    
    // Process the update - this will now always aggregate immediately
    const aggregatedUrl = await modelService.processUpdate(modelName, round, req.body, metadata);
    
    // Send response
    res.json({
      success: true,
      message: 'Update received and model aggregated',
      url: aggregatedUrl,
      modelUrl: modelFolderUrl,
      aggregationPerformed: true
    });
  } catch (error) {
    console.error(`Error processing update: ${error.message}`);
    res.status(500).json({ 
      success: false, 
      error: 'Upload processing failed',
      details: error.message
    });
  }
});

// Configuration endpoint to view current settings
app.get('/config', (req, res) => {
  // Return a sanitized version of the config (without secrets)
  const sanitizedConfig = {
    port: config.port,
    podRoot: config.solid.podRoot,
    aggregation: {
      learningRate: config.aggregation.learningRate,
      saveHistory: config.aggregation.saveHistory,
      // Don't expose paths
      historyDir: '<configured>'
    }
  };
  
  res.json({
    success: true,
    config: sanitizedConfig,
    summary: getConfigSummary()
  });
});

// Start the initialization process
initializeServer().catch(error => {
  console.error('❌ Failed to initialize server:', error);
  process.exit(1);
});

// Start the server
const server = app.listen(PORT, () => {
  console.log(`🚀 Orchestrator listening on http://localhost:${PORT}`);
});

// Handle graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

// Export app for testing
module.exports = app;