// server/aggregation.js
/**
 * Simplified model aggregation module for SolidFed server
 * Handles asynchronous federated averaging
 */
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

/**
 * Main aggregation function for model updates
 * Performs standard federated averaging
 * @param {Array} modelUpdates - Array of model updates (buffers) with metadata
 * @param {string} modelName - Name of the model being aggregated
 * @param {Object} options - Aggregation options
 * @returns {Buffer} - Aggregated model weights
 */
async function aggregateModels(modelUpdates, modelName, options = {}) {
  try {
    // Default options
    const defaultOptions = {
      saveHistory: true,         // Whether to save aggregation history
      historyDir: './history',   // Directory to save aggregation history
      learningRate: 0.1,         // Learning rate for async updates
      currentGlobalModel: null,  // Current global model for async updates
      isAsyncUpdate: false       // Whether this is an async update
    };
    
    // Merge options with defaults
    const config = { ...defaultOptions, ...options };
    
    console.log(`Aggregating ${modelUpdates.length} updates for model "${modelName}" using FedAvg`);
    
    // Perform standard federated averaging
    const aggregatedModel = await federatedAverage(modelUpdates, config);
    
    // If requested, save aggregation history
    if (config.saveHistory) {
      await saveAggregationHistory(modelUpdates, aggregatedModel, modelName, config);
    }
    
    return aggregatedModel;
  } catch (error) {
    console.error(`Aggregation error: ${error.message}`);
    throw error;
  }
}

/**
 * Standard Federated Averaging (FedAvg) algorithm
 * Supports async updates with existing global model
 * @param {Array} modelUpdates - Array of model updates with metadata
 * @param {Object} options - Additional options including currentGlobalModel
 * @returns {Buffer} - Aggregated model
 */
async function federatedAverage(modelUpdates, options = {}) {
  try {
    // Extract options
    const currentGlobalModel = options.currentGlobalModel;
    const learningRate = options.learningRate || 0.1; // Default learning rate for async updates
    const isAsyncUpdate = options.isAsyncUpdate || false;
    
    // Convert all updates to Float32Array for easier manipulation
    const updates = modelUpdates.map(update => {
      return {
        weights: bufferToFloat32Array(update.data),
        clientId: update.clientId,
        round: update.round
      };
    });
    
    // Check that all updates have the same shape
    const firstUpdateSize = updates[0].weights.length;
    for (let i = 1; i < updates.length; i++) {
      if (updates[i].weights.length !== firstUpdateSize) {
        throw new Error(`Model update ${i} has different size (${updates[i].weights.length}) than expected (${firstUpdateSize})`);
      }
    }
    
    // Initialize weights array
    let aggregatedWeights;
    
    // If we have a current global model and this is an async update
    if (currentGlobalModel && isAsyncUpdate) {
      // Convert global model to Float32Array
      const globalWeights = bufferToFloat32Array(currentGlobalModel);
      
      // Check if global model has compatible dimensions
      if (globalWeights.length !== firstUpdateSize) {
        console.warn(`Global model size (${globalWeights.length}) doesn't match updates (${firstUpdateSize}). Using standard averaging.`);
        // Fall back to standard initialization
        aggregatedWeights = new Float32Array(firstUpdateSize).fill(0);
        
        // Standard averaging
        for (const update of updates) {
          for (let i = 0; i < firstUpdateSize; i++) {
            aggregatedWeights[i] += update.weights[i] / updates.length;
          }
        }
      } else {
        // Initialize with global model
        aggregatedWeights = new Float32Array(globalWeights);
        console.log(`Using async update with learning rate ${learningRate}`);
        
        // Average the client updates first
        const clientUpdatesAvg = new Float32Array(firstUpdateSize).fill(0);
        for (const update of updates) {
          for (let i = 0; i < firstUpdateSize; i++) {
            clientUpdatesAvg[i] += update.weights[i] / updates.length;
          }
        }
        
        // Apply client updates with learning rate
        for (let i = 0; i < firstUpdateSize; i++) {
          // Weighted average: (1-lr)*global + lr*client_avg
          aggregatedWeights[i] = (1 - learningRate) * aggregatedWeights[i] + 
                                learningRate * clientUpdatesAvg[i];
        }
      }
    } else {
      // No global model or not an async update, use standard FedAvg
      aggregatedWeights = new Float32Array(firstUpdateSize).fill(0);
      
      // Simple averaging of all updates (equal weight for all clients)
      for (const update of updates) {
        for (let i = 0; i < firstUpdateSize; i++) {
          aggregatedWeights[i] += update.weights[i] / updates.length;
        }
      }
    }
    
    console.log('✅ FedAvg aggregation completed successfully');
    
    // Convert back to Buffer for storage/transmission
    return Buffer.from(aggregatedWeights.buffer);
  } catch (error) {
    console.error(`FedAvg error: ${error.message}`);
    throw error;
  }
}

/**
 * Save aggregation history for analysis and debugging
 * @param {Array} modelUpdates - Original model updates
 * @param {Buffer} aggregatedModel - Aggregated model
 * @param {string} modelName - Name of the model
 * @param {Object} config - Aggregation configuration
 */
async function saveAggregationHistory(modelUpdates, aggregatedModel, modelName, config) {
  try {
    // Create history directory if it doesn't exist
    const historyDir = path.join(config.historyDir, modelName);
    await fs.mkdir(historyDir, { recursive: true });
    
    // Generate timestamp and unique ID
    const timestamp = new Date().toISOString().replace(/:/g, '-');
    const aggregationId = crypto.randomBytes(4).toString('hex');
    const filename = `${timestamp}_${aggregationId}.json`;
    
    // Create history object
    const history = {
      timestamp,
      id: aggregationId,
      modelName,
      config: {
        ...config,
        // Don't include the actual model data in the history
        currentGlobalModel: config.currentGlobalModel ? 'present' : 'absent'
      },
      numUpdates: modelUpdates.length,
      clientIds: modelUpdates.map(update => update.clientId),
      round: modelUpdates[0]?.round || 'unknown'
    };
    
    // Write history to file
    await fs.writeFile(
      path.join(historyDir, filename),
      JSON.stringify(history, null, 2)
    );
    
    console.log(`✅ Saved aggregation history to ${path.join(historyDir, filename)}`);
  } catch (error) {
    console.warn(`Failed to save aggregation history: ${error.message}`);
    // Don't throw error, just log warning
  }
}

/**
 * Convert Buffer to Float32Array
 * @param {Buffer} buffer - Input buffer
 * @returns {Float32Array} - Float32Array representation
 */
function bufferToFloat32Array(buffer) {
  return new Float32Array(
    buffer.buffer.slice(
      buffer.byteOffset,
      buffer.byteOffset + buffer.byteLength
    )
  );
}

module.exports = {
  aggregateModels,
  federatedAverage,
  bufferToFloat32Array
};