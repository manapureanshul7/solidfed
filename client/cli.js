#!/usr/bin/env node
// client/cli.js
require('dotenv').config();
const readline = require('readline');
const fs = require('fs').promises;
const fetch = require('node-fetch');
const { loginWithClientCreds } = require('./auth');
const { downloadTrainingData } = require('./download');
const { downloadFile } = require('./download');
const { uploadWeights } = require('./upload');
const { execSync } = require('child_process');

let session = null;
let currentModelName = null;
let currentModelUrl = null; // New variable to store model URL

// Model options - could be fetched dynamically in future versions
const MODEL_OPTIONS = [
  'breast-cancer-detection',
  'movie-recommendation',
  'dummy',
  'dummy2',
  'dummy3',
  'dummy4',
];

/** Helper to ask a question and get an answer */
function ask(question, defaultVal = '') {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => {
    rl.question(
      defaultVal
        ? `${question} (default: ${defaultVal}): `
        : `${question}: `,
      answer => {
        rl.close();
        resolve(answer.trim() || defaultVal);
      }
    );
  });
}

/** Show menu for model selection */
async function showModelMenu() {
  console.log('\n===== Select a Model =====');
  MODEL_OPTIONS.forEach((model, index) => {
    console.log(`${index + 1}. ${model}`);
  });
  console.log(`${MODEL_OPTIONS.length + 1}. Back to main menu`);

  const choice = await ask('Select a model');
  const choiceNum = parseInt(choice, 10);

  if (isNaN(choiceNum) || choiceNum < 1 || choiceNum > MODEL_OPTIONS.length + 1) {
    console.log('Invalid selection, please try again.');
    return showModelMenu();
  }

  if (choiceNum === MODEL_OPTIONS.length + 1) {
    return showMainMenu();
  }

  return MODEL_OPTIONS[choiceNum - 1];
}

/** Register client for a specific model */
async function registerForModel(session, modelName) {
  console.log(`Registering for model: ${modelName}...`);
  
  try {
    const ORCHESTRATOR = process.env.ORCHESTRATOR_URL || 'http://localhost:4000';
    const response = await fetch(`${ORCHESTRATOR}/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        webId: session.info.webId,
        modelName: modelName
      })
    });
    
    const result = await response.json();
    if (result.success) {
      console.log(`✅ Successfully registered for ${modelName}`);
      
      // Store model name and URL
      currentModelName = modelName;
      
      // IMPORTANT: Store the model URL from the server's response
      if (result.modelUrl) {
        // Store the model URL in memory
        currentModelUrl = result.modelUrl;
        console.log(`📁 Model URL: ${currentModelUrl}`);
      } else {
        console.warn(`⚠️ Server didn't return model URL, using default from .env`);
      }
    } else {
      console.error(`❌ Registration failed: ${result.error}`);
    }
  } catch (err) {
    console.error(`❌ Registration error: ${err.message}`);
  }
}

/** Download model and trainer code */
async function downloadModelAndTrainer(session, modelName) {
  if (!modelName) {
    console.log('No model selected. Please register for a model first.');
    return;
  }

  console.log(`Downloading model and trainer for: ${modelName}...`);
  
  try {
    let baseUrl;
    
    // 1. Try to use the stored model URL from registration first
    if (currentModelUrl) {
      baseUrl = currentModelUrl;
      console.log(`Using stored model URL: ${baseUrl}`);
    } 
    // 2. Fall back to constructing URL from .env if needed
    else {
      const POD_ROOT = process.env.SOLIDFED_POD_ROOT;
      if (!POD_ROOT) {
        throw new Error('SOLIDFED_POD_ROOT not set in .env file and no model URL available');
      }
      
      baseUrl = POD_ROOT + modelName + '/';
      console.log(`Using constructed URL from .env: ${baseUrl}`);
    }
    
    // 3. Fetch files using direct session.fetch as a first attempt (more reliable)
    try {
      console.log(`↓ Fetching globalModel.bin from ${baseUrl}`);
      const modelResponse = await session.fetch(baseUrl + 'globalModel.bin');
      if (modelResponse.ok) {
        const buffer = Buffer.from(await modelResponse.arrayBuffer());
        await fs.writeFile('./globalModel.bin', buffer);
        console.log(`✅ Downloaded globalModel.bin using direct fetch`);
      } else {
        throw new Error(`Failed with status ${modelResponse.status}`);
      }
    } catch (directFetchError) {
      console.log(`⚠️ Direct fetch failed: ${directFetchError.message}`);
      console.log(`↓ Falling back to downloadFile helper for globalModel.bin`);
      await downloadFile(session, baseUrl + 'globalModel.bin', './globalModel.bin');
    }
    
    try {
      console.log(`↓ Fetching clientTrainer.py from ${baseUrl}`);
      const trainerResponse = await session.fetch(baseUrl + 'clientTrainer.py');
      if (trainerResponse.ok) {
        const buffer = Buffer.from(await trainerResponse.arrayBuffer());
        await fs.writeFile('./clientTrainer.py', buffer);
        console.log(`✅ Downloaded clientTrainer.py using direct fetch`);
      } else {
        throw new Error(`Failed with status ${trainerResponse.status}`);
      }
    } catch (directFetchError) {
      console.log(`⚠️ Direct fetch failed: ${directFetchError.message}`);
      console.log(`↓ Falling back to downloadFile helper for clientTrainer.py`);
      await downloadFile(session, baseUrl + 'clientTrainer.py', './clientTrainer.py');
    }
    
    console.log('✅ Downloaded model and trainer successfully');
  } catch (err) {
    console.error(`❌ Download error: ${err.message}`);
  }
}

/** Train locally and upload weights */
async function trainAndUpload(session, modelName) {
  if (!modelName) {
    console.log('No model selected. Please register for a model first.');
    return;
  }
  
  console.log('Running local training...');
  
  try {
    // Execute the Python training script (requires Python environment)
    console.log('Executing clientTrainer.py...');
    try {
      execSync('python clientTrainer.py', { stdio: 'inherit' });
    } catch (err) {
      throw new Error(`Training failed: ${err.message}`);
    }
    
    // Check if localWeights.bin was created
    try {
      await fs.access('./localWeights.bin');
    } catch (err) {
      throw new Error('Training did not produce localWeights.bin file');
    }
    
    // Upload the weights
    const roundStr = await ask('Federated round number', '1');
    const round = parseInt(roundStr, 10);
    if (isNaN(round) || round < 1) {
      throw new Error('Invalid round number');
    }
    
    console.log(`Uploading weights for model ${modelName}, round ${round}...`);
    const ORCHESTRATOR = process.env.ORCHESTRATOR_URL || 'http://localhost:4000';
    
    const response = await fetch(`${ORCHESTRATOR}/upload`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/octet-stream',
        'webid': session.info.webId,
        'modelName': modelName,
        'round': round.toString()
      },
      body: await fs.readFile('./localWeights.bin')
    });
    
    const result = await response.json();
    if (result.success) {
      console.log('✅ Uploaded to', result.url);
    } else {
      throw new Error(`Upload failed: ${result.error}`);
    }
  } catch (err) {
    console.error(`❌ ${err.message}`);
  }
}

async function showMainMenu() {
  console.log('\n===== SolidFed CLI =====');
  console.log('1. Login to Solid Pod');
  console.log('2. Register for a model');
  console.log('3. Download training data');
  console.log('4. Download model & trainer code');
  console.log('5. Train locally & upload weights');
  console.log('6. How to get your Client ID & Secret');
  console.log('7. Logout');
  console.log('8. Exit');
  
  if (currentModelName) {
    console.log(`\nCurrent model: ${currentModelName}`);
    if (currentModelUrl) {
      console.log(`Model URL: ${currentModelUrl}`);
    }
  }

  const choice = await ask('Select an option');
  try {
    switch (choice) {
      case '1':
        session = await loginWithClientCreds();
        break;

      case '2':
        if (!session) {
          console.log('Please login first (option 1).');
        } else {
          const modelName = await showModelMenu();
          if (modelName) {
            await registerForModel(session, modelName);
          }
        }
        break;

      case '3':
        if (!session) {
          console.log('Please login first (option 1).');
        } else {
          await downloadTrainingData(session);
        }
        break;

      case '4':
        if (!session) {
          console.log('Please login first (option 1).');
        } else {
          await downloadModelAndTrainer(session, currentModelName);
        }
        break;

      case '5':
        if (!session) {
          console.log('Please login first (option 1).');
        } else {
          await trainAndUpload(session, currentModelName);
        }
        break;

      case '6':
        console.log(`
To generate your Client ID & Secret on solidcommunity.net:
• Go to [https://solidcommunity.net/.account/login/password/] and log in
• Scroll to "Credential tokens" → "Create token"
• Copy the returned "id" as Client ID and "secret" as Client Secret
        `.trim());
        break;

      case '7':
        if (session) {
          await session.logout();
          session = null;
          currentModelName = null;
          currentModelUrl = null; // Clear the stored URL
          console.log('🔒 Logged out');
        } else {
          console.log('You are not logged in.');
        }
        break;

      case '8':
        console.log('Goodbye!');
        process.exit(0);

      default:
        console.log('Invalid selection, please choose 1–8.');
    }
  } catch (err) {
    console.error('⚠️  Error:', err.message);
  }

  await showMainMenu();
}

(async () => {
  console.log('Welcome to SolidFed CLI — FedAsync Implementation');
  await showMainMenu();
})();