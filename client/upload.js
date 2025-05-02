// client/upload.js
require('dotenv').config();
const fetch = require('node-fetch');
const fs = require('fs').promises;

const ORCHESTRATOR = process.env.ORCHESTRATOR_URL || 'http://localhost:4000';

/**
 * Uploads a local weights file to the orchestrator.
 */
async function uploadWeights(session, filePath, round, modelName) {
  if (!modelName) {
    throw new Error('Model name is required for upload');
  }

  let data;
  try {
    data = await fs.readFile(filePath);
  } catch (e) {
    throw new Error(`Cannot read file "${filePath}": ${e.message}`);
  }

  const res = await fetch(`${ORCHESTRATOR}/upload`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/octet-stream',
      'webid': session.info.webId,
      'round': round.toString(),
      'modelName': modelName 
    },
    body: data,
  });
  
  const json = await res.json();
  if (!json.success) {
    throw new Error(`Upload failed: ${json.error}`);
  }
  return json.url;
}

module.exports = { uploadWeights };