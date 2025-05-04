// client/upload.js
/**
 * Upload utilities for SolidFed client
 * Handles both regular and privacy-preserving uploads to orchestrator
 */
require('dotenv').config();
const fetch = require('node-fetch');
const fs = require('fs').promises;
const readline = require('readline');

const ORCHESTRATOR = process.env.ORCHESTRATOR_URL || 'http://localhost:4000';

/**
 * Helper to ask a question and get an answer
 * @param {string} question - Question to ask
 * @param {string} defaultVal - Default value
 * @returns {Promise<string>} - User's answer
 */
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

/**
 * Upload model weights to the server (without differential privacy)
 * @param {Object} session - The authenticated Solid session 
 * @param {String} modelName - Name of the model
 * @param {Number} round - Federated round number
 * @returns {Promise<Object>} Upload result
 */
async function uploadWeights(session, modelName, round) {
  try {
    if (!modelName) {
      throw new Error('Model name is required for upload');
    }
    
    console.log(`Uploading weights for model ${modelName}, round ${round}...`);
    
    // Check if weights file exists
    try {
      await fs.access('./localWeights.bin');
    } catch (err) {
      throw new Error('localWeights.bin file not found. Please train the model first.');
    }
    
    // Read the weights file
    const data = await fs.readFile('./localWeights.bin');
    
    // Upload to the orchestrator
    const response = await fetch(`${ORCHESTRATOR}/upload`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/octet-stream',
        'webid': session.info.webId,
        'modelName': modelName,
        'round': round.toString(),
        'privacy-applied': 'false'
      },
      body: data
    });
    
    const result = await response.json();
    if (result.success) {
      console.log('✅ Uploaded raw weights to', result.url);
      return result;
    } else {
      throw new Error(`Upload failed: ${result.error}`);
    }
  } catch (err) {
    console.error(`❌ ${err.message}`);
    return { success: false, error: err.message };
  }
}

/**
 * Upload differentially private weights to the server
 * @param {Object} session - The authenticated Solid session
 * @param {String} modelName - Model name
 * @param {Number} round - Training round
 * @param {Object} dpParams - Differential privacy parameters
 * @returns {Promise<Object>} Upload result
 */
async function uploadDPWeights(session, modelName, round, dpParams) {
  try {
    if (!modelName) {
      throw new Error('Model name is required for upload');
    }
    
    console.log(`Uploading differentially private weights for model ${modelName}, round ${round}...`);
    
    // Check if DP weights file exists
    try {
      await fs.access('./dp_weights.bin');
    } catch (err) {
      throw new Error('dp_weights.bin file not found. Please apply differential privacy first.');
    }
    
    // Read the weights file
    const data = await fs.readFile('./dp_weights.bin');
    
    // Upload to the orchestrator
    const response = await fetch(`${ORCHESTRATOR}/upload`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/octet-stream',
        'webid': session.info.webId,
        'modelName': modelName,
        'round': round.toString(),
        // Add privacy metadata to headers
        'privacy-applied': 'true',
        'privacy-epsilon': dpParams.epsilon.toString(),
        'privacy-delta': dpParams.delta.toString(),
        'privacy-l2-clip': dpParams.l2NormClip.toString()
      },
      body: data
    });
    
    const result = await response.json();
    if (result.success) {
      console.log('✅ Uploaded differentially private weights to', result.url);
      return result;
    } else {
      throw new Error(`Upload failed: ${result.error}`);
    }
  } catch (err) {
    console.error(`❌ ${err.message}`);
    return { success: false, error: err.message };
  }
}

module.exports = {
  uploadWeights,
  uploadDPWeights,
  ask
};