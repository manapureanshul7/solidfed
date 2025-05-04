#!/usr/bin/env node
// client/cli.js
require('dotenv').config();
const fs = require('fs').promises;
const fetch = require('node-fetch');
const { execSync } = require('child_process');
const { loginWithClientCreds } = require('./auth');
const { downloadTrainingData, downloadFile } = require('./download');
const { applyDifferentialPrivacy, computePrivacyCost } = require('./privacy');
const { uploadWeights, uploadDPWeights, ask } = require('./upload');

let session = null;
let currentModelName = null;
let currentModelUrl = null; // URL to the model container

// Model options - could be fetched dynamically in future versions
const MODEL_OPTIONS = [
  'test-2',
  'final',
  'dummy',
];

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

/**
 * Display explanation about differential privacy
 */
async function showDPExplanation() {
  console.log('\n===== Differential Privacy Explanation =====');
  console.log('Differential privacy is a mathematical framework that provides strong privacy guarantees.');
  console.log('It ensures that model weights don\'t reveal information about specific training examples.');
  console.log('\nKey parameters:');
  console.log('  - Epsilon (ε): Privacy budget. Lower values (0.1-1.0) provide stronger privacy but may reduce');
  console.log('    model accuracy. Higher values (1.0-10.0) preserve more accuracy but offer less privacy.');
  console.log('  - Delta (δ): Probability of privacy failure. Should be very small (typically 1/training_size).');
  console.log('  - L2 Norm Clip: Limits the influence of any single training example. Lower values (0.1-1.0)');
  console.log('    provide stronger privacy guarantees but may impact convergence.');
  console.log('\nRecommended settings:');
  console.log('  - For strong privacy: ε=0.1, L2 Norm Clip=1.0');
  console.log('  - Balanced privacy/utility: ε=1.0, L2 Norm Clip=1.0');
  console.log('  - Better utility, less privacy: ε=10.0, L2 Norm Clip=1.0');
  console.log('\nPress Enter to continue...');
  return new Promise(resolve => {
    process.stdin.once('data', () => {
      resolve();
    });
  });
}

/**
 * Configure differential privacy parameters and upload weights
 */
async function configureDPAndUpload(session, modelName, round) {
  console.log('\n===== Configure Differential Privacy =====');
  console.log('Setting privacy parameters:');
  
  // Get epsilon (privacy budget)
  console.log('\nEpsilon (ε) - Privacy Budget:');
  console.log('  - Low values (0.1-1.0): High privacy, potentially lower utility');
  console.log('  - Medium values (1.0-5.0): Good privacy-utility tradeoff');
  console.log('  - High values (5.0+): Prioritizes utility over privacy');
  const epsilonStr = await ask('Enter epsilon value', '1.0');
  let epsilon = parseFloat(epsilonStr);
  if (isNaN(epsilon) || epsilon <= 0) {
    console.log('Invalid epsilon value, using default (1.0)');
    epsilon = 1.0;
  }
  
  // Get delta (failure probability)
  console.log('\nDelta (δ) - Privacy Failure Probability:');
  console.log('  - Should be very small, typically 1/N where N is your training dataset size');
  console.log('  - Example: For 10,000 training examples, use 0.0001 or smaller');
  const deltaStr = await ask('Enter delta value', '1e-5');
  let delta = parseFloat(deltaStr);
  if (isNaN(delta) || delta <= 0 || delta >= 1) {
    console.log('Invalid delta value, using default (1e-5)');
    delta = 1e-5;
  }
  
  // Get L2 norm clipping threshold
  console.log('\nL2 Norm Clipping Threshold:');
  console.log('  - Controls the maximum influence of any training example');
  console.log('  - Lower values (0.1-1.0) limit influence but may slow convergence');
  console.log('  - Higher values (1.0+) allow more influence but may reduce privacy');
  const clipStr = await ask('Enter L2 norm clipping threshold', '1.0');
  let l2NormClip = parseFloat(clipStr);
  if (isNaN(l2NormClip) || l2NormClip <= 0) {
    console.log('Invalid L2 norm clipping value, using default (1.0)');
    l2NormClip = 1.0;
  }
  
  // Estimate dataset size for privacy analysis
  console.log('\nApproximate Training Dataset Size:');
  console.log('  - Used to calculate privacy cost over multiple rounds');
  const dataSizeStr = await ask('Enter approximate number of training examples', '1000');
  let dataSize = parseInt(dataSizeStr, 10);
  if (isNaN(dataSize) || dataSize <= 0) {
    console.log('Invalid dataset size, using default (1000)');
    dataSize = 1000;
  }
  
  // Calculate sample rate
  const sampleRate = 1.0 / dataSize;
  
  // Create DP parameters object
  const dpParams = {
    epsilon,
    delta,
    l2NormClip,
    sampleRate
  };
  
  // Calculate privacy cost for the current round
  if (round > 1) {
    const cost = computePrivacyCost(epsilon, delta, round, sampleRate);
    console.log(`\n📊 Estimated cumulative privacy cost after ${round} rounds:`);
    console.log(`  - Epsilon: ${cost.epsilon.toFixed(4)}`);
    console.log(`  - Delta: ${cost.delta.toExponential(4)}`);
    
    // Warn if privacy budget is high
    if (cost.epsilon > 10) {
      console.log('⚠️ Warning: High cumulative epsilon value may provide limited privacy guarantees.');
      const confirmHighEpsilon = await ask('Continue with these settings? (yes/no)', 'yes');
      if (confirmHighEpsilon.toLowerCase() !== 'yes' && confirmHighEpsilon.toLowerCase() !== 'y') {
        return configureDPAndUpload(session, modelName, round);
      }
    }
  }
  
  // Read weights file
  try {
    console.log('\nReading weights file...');
    const weightsBuffer = await fs.readFile('./localWeights.bin');
    
    // Apply differential privacy
    console.log('Applying differential privacy to weights...');
    const dpWeightsBuffer = applyDifferentialPrivacy(weightsBuffer, dpParams);
    
    // Save DP weights to temporary file
    await fs.writeFile('./dp_weights.bin', dpWeightsBuffer);
    console.log('✅ Applied differential privacy and saved to dp_weights.bin');
    
    // Upload the DP weights
    await uploadDPWeights(session, modelName, round, dpParams);
    
    // Cleanup temporary file
    await fs.unlink('./dp_weights.bin').catch(() => {});
    
  } catch (err) {
    console.error(`❌ Error: ${err.message}`);
  }
}

/**
 * Show menu for upload options after training
 * Allows choosing between regular upload and differential privacy
 */
async function showUploadMenu(session, modelName, round) {
  console.log('\n===== Upload Options =====');
  console.log('1. Upload weights without privacy protection');
  console.log('2. Upload weights with differential privacy');
  console.log('3. View differential privacy explanation');
  console.log('4. Cancel upload');
  
  const choice = await ask('Select an option');
  
  switch (choice) {
    case '1':
      console.log('\n⚠️ Warning: Uploading weights without privacy protection may leak information about your training data.');
      const confirmNoDP = await ask('Are you sure you want to continue? (yes/no)', 'no');
      if (confirmNoDP.toLowerCase() === 'yes' || confirmNoDP.toLowerCase() === 'y') {
        await uploadWeights(session, modelName, round);
      } else {
        return showUploadMenu(session, modelName, round);
      }
      break;
      
    case '2':
      await configureDPAndUpload(session, modelName, round);
      break;
      
    case '3':
      await showDPExplanation();
      return showUploadMenu(session, modelName, round);
      
    case '4':
      console.log('Upload canceled.');
      break;
      
    default:
      console.log('Invalid selection, please choose 1-4.');
      return showUploadMenu(session, modelName, round);
  }
}

/**
 * Start local training and show upload options afterward
 */
async function trainLocallyAndShowUploadOptions(session, modelName) {
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
    
    // Get the round number
    const roundStr = await ask('Federated round number', '1');
    const round = parseInt(roundStr, 10);
    if (isNaN(round) || round < 1) {
      throw new Error('Invalid round number');
    }
    
    // Show upload options menu
    await showUploadMenu(session, modelName, round);
    
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
          // Call the modified function that shows upload options after training
          await trainLocallyAndShowUploadOptions(session, currentModelName);
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