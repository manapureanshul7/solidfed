// client/train.js
/**
 * Training utilities for SolidFed client
 * Handles local training and integration with differential privacy
 */
const fs = require('fs').promises;
const { execSync } = require('child_process');
const { uploadWeights, uploadDPWeights, ask } = require('./upload');
const { applyDifferentialPrivacy, computePrivacyCost } = require('./privacy');

/**
 * Train locally on the current model and upload the weights
 * @param {Object} session - The authenticated Solid session
 * @param {String} modelName - Name of the model to train on
 * @returns {Promise<void>}
 */
async function trainAndUpload(session, modelName) {
  if (!modelName) {
    console.log('No model selected. Please register for a model first.');
    return;
  }
  
  console.log('Running local training...');
  
  try {
    // Execute the Python training script
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
    
    // Upload the weights
    await uploadWeights(session, modelName, round);
    
  } catch (err) {
    console.error(`❌ ${err.message}`);
  }
}

/**
 * Train with differential privacy options
 * @param {Object} session - The authenticated Solid session
 * @param {String} modelName - Name of the model to train on
 * @param {Object} dpOptions - Differential privacy options
 * @returns {Promise<void>}
 */
async function trainWithDP(session, modelName, dpOptions = {}) {
  if (!modelName) {
    console.log('No model selected. Please register for a model first.');
    return;
  }
  
  console.log('Running local training with differential privacy...');
  
  try {
    // Execute the Python training script
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
    
    // Configure differential privacy
    const epsilon = dpOptions.epsilon || parseFloat(await ask('Privacy parameter epsilon (lower = more privacy)', '1.0'));
    const delta = dpOptions.delta || parseFloat(await ask('Privacy parameter delta (typically 1/dataset_size)', '1e-5'));
    const l2NormClip = dpOptions.l2NormClip || parseFloat(await ask('L2 norm clipping threshold', '1.0'));
    
    // Estimate dataset size for privacy accounting
    const datasetSize = dpOptions.datasetSize || parseInt(await ask('Approximate number of training examples', '1000'), 10);
    const sampleRate = 1.0 / datasetSize;
    
    // Create DP parameters object
    const dpParams = {
      epsilon,
      delta,
      l2NormClip,
      sampleRate
    };
    
    // Calculate privacy cost if multiple rounds
    if (round > 1) {
      const cost = computePrivacyCost(epsilon, delta, round, sampleRate);
      console.log(`\n📊 Estimated cumulative privacy cost after ${round} rounds:`);
      console.log(`  - Epsilon: ${cost.epsilon.toFixed(4)}`);
      console.log(`  - Delta: ${cost.delta.toExponential(4)}`);
    }
    
    // Read weights and apply differential privacy
    console.log('Reading model weights...');
    const weightsBuffer = await fs.readFile('./localWeights.bin');
    
    console.log('Applying differential privacy...');
    const dpWeightsBuffer = applyDifferentialPrivacy(weightsBuffer, dpParams);
    
    // Save DP weights to temporary file
    await fs.writeFile('./dp_weights.bin', dpWeightsBuffer);
    console.log('✅ Applied differential privacy and saved to dp_weights.bin');
    
    // Upload the DP weights
    await uploadDPWeights(session, modelName, round, dpParams);
    
    // Cleanup temporary file
    await fs.unlink('./dp_weights.bin').catch(() => {});
    
  } catch (err) {
    console.error(`❌ ${err.message}`);
  }
}

/**
 * Run the training process with extended options
 * @param {Object} session - The authenticated Solid session
 * @param {String} modelName - Name of the model to train on
 * @param {Object} options - Additional training options
 * @returns {Promise<void>}
 */
async function runTrainingWithOptions(session, modelName, options = {}) {
  if (!modelName) {
    console.log('No model selected. Please register for a model first.');
    return;
  }
  
  console.log(`Running local training for ${modelName} with custom options...`);
  
  try {
    // Build command with options
    let command = 'python clientTrainer.py';
    
    // Add any custom options as command line arguments
    if (options.epochs) {
      command += ` --epochs ${options.epochs}`;
    }
    
    if (options.batchSize) {
      command += ` --batch_size ${options.batchSize}`;
    }
    
    if (options.learningRate) {
      command += ` --learning_rate ${options.learningRate}`;
    }
    
    // Add any other custom training parameters
    if (options.customParams) {
      for (const [key, value] of Object.entries(options.customParams)) {
        command += ` --${key} ${value}`;
      }
    }
    
    console.log(`Executing: ${command}`);
    execSync(command, { stdio: 'inherit' });
    
    // If training succeeded but user doesn't want to upload weights
    if (options.skipUpload) {
      console.log('✅ Training completed. Skipping upload as requested.');
      return;
    }
    
    // Check if user wants to use differential privacy
    if (options.useDP) {
      // Configure DP options
      const dpOptions = {
        epsilon: options.epsilon,
        delta: options.delta,
        l2NormClip: options.l2NormClip,
        datasetSize: options.datasetSize
      };
      
      // Run DP training and upload
      await trainWithDP(session, modelName, dpOptions);
    } else {
      // Run regular upload
      await uploadWeights(session, modelName, options.round);
    }
    
  } catch (err) {
    console.error(`❌ Training error: ${err.message}`);
  }
}

module.exports = {
  trainAndUpload,
  trainWithDP,
  runTrainingWithOptions
};