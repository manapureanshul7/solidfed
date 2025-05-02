// server/server.js
require('dotenv').config();
const express = require('express');
const { Session } = require('@inrupt/solid-client-authn-node');
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

const {
  SOLID_OIDC_ISSUER,
  SOLID_CLIENT_ID,
  SOLID_CLIENT_SECRET,
  POD_ROOT,    // e.g. https://solidfed.solidcommunity.net/solidfed/
  PORT = 4000,
} = process.env;

// — Service account login —
const serviceSession = new Session();
(async () => {
  await serviceSession.login({
    oidcIssuer: SOLID_OIDC_ISSUER,
    clientId: SOLID_CLIENT_ID,
    clientSecret: SOLID_CLIENT_SECRET,
  });
  console.log('✅ Service logged in as', serviceSession.info.webId);
  console.log('📁 Pod Root:', POD_ROOT);
})().catch(err => {
  console.error('❌ Service login failed:', err);
  process.exit(1);
});

// — Helper: derive a model folder URL —
function getModelFolderUrl(modelName) {
  // Replace spaces with hyphens and ensure URL-safe
  const safeModelName = modelName.replace(/\s+/g, '-').replace(/[^a-zA-Z0-9-]/g, '');
  return `${POD_ROOT}${safeModelName}/`;
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
    np.save('localWeights.bin', weights)
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

// — Registration endpoint —  
app.post('/register', async (req, res) => {
  const { webId, modelName } = req.body;
  if (!webId || !modelName) return res.status(400).json({ error: 'Missing webId or modelName' });

  try {
    // 1. Get the model folder URL
    const modelFolderUrl = getModelFolderUrl(modelName);
    console.log(`Processing registration for ${webId} on model: ${modelName}`);
    console.log(`Model folder URL: ${modelFolderUrl}`);

    // 2. Ensure the container exists
    if (!await ensureContainer(modelFolderUrl)) {
      return res.status(500).json({ error: `Failed to ensure container at ${modelFolderUrl}` });
    }
    
    // 3. Ensure model files exist
    if (!await ensureModelFiles(modelFolderUrl)) {
      console.warn(`⚠️ Warning: Could not create model files`);
      // Continue anyway - files may be created later
    }

    // 4. Grant permissions with inheritance
    if (!await grantFolderAccessWithInheritance(modelFolderUrl, webId)) {
      return res.status(500).json({ error: `Failed to set permissions for ${webId}` });
    }

    // 5. IMPORTANT: Return the model folder URL to the client
    res.json({
      success: true,
      message: `Granted Reader on ${modelFolderUrl} to ${webId}`,
      modelUrl: modelFolderUrl
    });
  } catch (e) {
    console.error('Registration error:', e);
    res.status(500).json({ error: e.message });
  }
});

// — Upload endpoint —  
app.post('/upload', express.raw({ type: 'application/octet-stream', limit: '100mb' }), async (req, res) => {
  const webId = req.header('webid');
  const round = req.header('round');
  const modelName = req.header('modelName');  // Take the model name from header
  if (!webId || !round || !modelName) {
    return res.status(400).json({ error: 'Missing headers: webid, round or modelName' });
  }

  try {
    // 1) Build the model's folder URL
    const modelFolderUrl = getModelFolderUrl(modelName);
    console.log(`Processing upload for ${modelName} from ${webId}, round ${round}`);

    // 2) Ensure that model folder exists
    if (!await ensureContainer(modelFolderUrl)) {
      return res.status(500).json({ error: `Failed to ensure container at ${modelFolderUrl}` });
    }

    // 3) Update the global model with the new weights
    const globalModelUrl = `${modelFolderUrl}globalModel.bin`;
    console.log(`Uploading to ${globalModelUrl}`);
    
    // This is where you would implement FedAsync merge logic if needed
    
    const response = await serviceSession.fetch(globalModelUrl, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: req.body,
    });
    
    if (!response.ok) {
      throw new Error(`Upload failed with status ${response.status}`);
    }
    
    console.log(`✅ Upload successful`);
    
    // 4) Return the globalModel URL in the response
    res.json({ 
      success: true, 
      url: globalModelUrl,
      modelUrl: modelFolderUrl  // Also include the model folder URL for consistency
    });
  } catch (e) {
    console.error('Upload error:', e);
    res.status(500).json({ error: e.message });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Orchestrator listening on http://localhost:${PORT}`);
});