// server/modelService.js
/**
 * Simplified Model service for SolidFed server
 * Handles immediate model updates with no buffering
 */
const { aggregateModels } = require('./aggregation');
const { config } = require('./config');
const fs = require('fs').promises;
const path = require('path');

/**
 * Service for managing model updates and aggregation
 */
class ModelService {
  /**
   * Create a new ModelService
   * @param {Object} session - Authenticated Solid session
   * @param {string} podRoot - Root URL for model storage
   */
  constructor(session, podRoot) {
    if (!session) {
      throw new Error('Session is required');
    }
    if (!podRoot) {
      throw new Error('Pod root URL is required');
    }
    
    this.session = session;
    this.podRoot = podRoot;
    
    // Extract configuration
    this.learningRate = config?.aggregation?.learningRate || 0.1;
    this.historyDir = config?.aggregation?.historyDir || './aggregation_history';
    
    // Create history directory if it doesn't exist
    this._ensureHistoryDir();
    
    console.log(`ModelService initialized with Pod root: ${this.podRoot}`);
    console.log(`Learning rate for async updates: ${this.learningRate}`);
  }
  
  /**
   * Ensure history directory exists
   * @private
   */
  async _ensureHistoryDir() {
    try {
      await fs.mkdir(this.historyDir, { recursive: true });
    } catch (error) {
      console.warn(`Failed to create history directory: ${error.message}`);
    }
  }
  
  /**
   * Get the URL for a model folder
   * @param {string} modelName - Name of the model 
   * @returns {string} - URL for the model folder
   */
  getModelFolderUrl(modelName) {
    // Replace spaces with hyphens and ensure URL-safe
    const safeModelName = modelName.replace(/\s+/g, '-').replace(/[^a-zA-Z0-9-]/g, '');
    return `${this.podRoot}${safeModelName}/`;
  }
  
  /**
   * Process a model update from a client - immediately download current global model,
   * aggregate with the new update, and save back to Pod
   * @param {string} modelName - Name of the model 
   * @param {string} round - Training round
   * @param {Buffer} modelData - Model update data
   * @param {Object} metadata - Metadata about the update
   * @returns {Promise<string>} - URL of aggregated model
   */
  async processUpdate(modelName, round, modelData, metadata) {
    try {
      console.log(`Processing update from ${metadata.webId} for ${modelName}, round ${round}`);
      
      // Create update object
      const update = {
        clientId: metadata.webId,
        data: modelData,
        timestamp: Date.now(),
        round: round
      };
      
      // Get the current global model
      const modelFolderUrl = this.getModelFolderUrl(modelName);
      const globalModelUrl = `${modelFolderUrl}globalModel.bin`;
      
      // Download the current global model
      let currentGlobalModel = null;
      try {
        console.log(`Downloading current global model from ${globalModelUrl}`);
        const response = await this.session.fetch(globalModelUrl);
        
        if (response.ok) {
          const arrayBuffer = await response.arrayBuffer();
          if (arrayBuffer.byteLength > 0) {
            currentGlobalModel = Buffer.from(arrayBuffer);
            console.log(`Downloaded current global model (${currentGlobalModel.length} bytes)`);
          } else {
            console.log(`Current global model exists but is empty, treating as new model`);
          }
        } else {
          console.log(`No existing global model found (status: ${response.status}), creating new model`);
        }
      } catch (error) {
        console.warn(`Error downloading global model: ${error.message}`);
        console.log(`Proceeding with creating a new global model`);
      }
      
      // Configure aggregation options - this is an async FL approach
      const aggregationOptions = {
        saveHistory: true,
        historyDir: this.historyDir,
        currentGlobalModel: currentGlobalModel,
        learningRate: this.learningRate,
        isAsyncUpdate: true
      };
      
      // Log aggregation approach
      if (currentGlobalModel) {
        console.log(`Using asynchronous aggregation with learning rate ${this.learningRate}`);
      } else {
        console.log(`Creating initial global model`);
      }
      
      // Perform aggregation with just this update
      const aggregatedModel = await aggregateModels([update], modelName, aggregationOptions);
      
      // Save the aggregated model to Pod
      const modelUrl = await this.saveGlobalModel(modelName, round, aggregatedModel, {
        updatesCount: 1,
        isAsyncUpdate: true
      });
      
      // Save a local backup if history dir exists
      try {
        const backupDir = path.join(this.historyDir, modelName, 'models');
        await fs.mkdir(backupDir, { recursive: true });
        
        const timestamp = new Date().toISOString().replace(/:/g, '-');
        const backupPath = path.join(backupDir, `global_model_r${round}_${timestamp}.bin`);
        await fs.writeFile(backupPath, aggregatedModel);
        console.log(`✅ Saved backup of model to ${backupPath}`);
      } catch (error) {
        console.warn(`Unable to save model backup: ${error.message}`);
      }
      
      return modelUrl;
    } catch (error) {
      console.error(`Error processing update: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Save the global model to the Pod with retries
   * @param {string} modelName - Name of the model
   * @param {string} round - Training round
   * @param {Buffer} modelData - Aggregated model data
   * @param {Object} metadata - Additional metadata
   * @returns {Promise<string>} - URL of the saved model
   */
  async saveGlobalModel(modelName, round, modelData, metadata = {}) {
    const modelFolderUrl = this.getModelFolderUrl(modelName);
    const globalModelUrl = `${modelFolderUrl}globalModel.bin`;
    
    console.log(`Saving aggregated model to ${globalModelUrl}`);
    
    // Set up headers with metadata
    const headers = {
      'Content-Type': 'application/octet-stream',
      'X-Aggregation-Round': round.toString(),
      'X-Aggregation-Type': 'fedavg',
      'X-Updates-Count': metadata.updatesCount?.toString() || '0',
      'X-Async-Update': 'true',
      'X-Timestamp': new Date().toISOString()
    };
    
    // Use retry logic for reliability
    const maxRetries = 3;
    let attempt = 0;
    let success = false;
    
    while (attempt < maxRetries && !success) {
      attempt++;
      try {
        console.log(`Attempt ${attempt}/${maxRetries} to save global model`);
        
        // Direct PUT request to update the file
        const response = await this.session.fetch(globalModelUrl, {
          method: 'PUT',
          headers: headers,
          body: modelData
        });
        
        if (!response.ok) {
          throw new Error(`Failed with status ${response.status}: ${response.statusText}`);
        }
        
        success = true;
        console.log(`✅ Successfully saved global model to ${globalModelUrl}`);
      } catch (error) {
        console.error(`❌ Save attempt ${attempt} failed: ${error.message}`);
        
        if (attempt < maxRetries) {
          // Wait before retrying
          const delay = 1000 * attempt; // Increasing delay with each attempt
          console.log(`Waiting ${delay}ms before retry...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        } else {
          console.error(`❌ All ${maxRetries} save attempts failed`);
          throw new Error(`Failed to save global model: ${error.message}`);
        }
      }
    }
    
    return globalModelUrl;
  }
}

module.exports = ModelService;