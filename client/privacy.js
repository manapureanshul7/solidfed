// client/privacy.js
/**
 * Differential privacy implementation for SolidFed
 * This module provides utilities for applying differential privacy
 * to model weights in federated learning.
 */
const crypto = require('crypto');

/**
 * Apply differential privacy to model weights
 * @param {Buffer|ArrayBuffer} weightsBuffer - Raw model weights
 * @param {Object} options - Privacy parameters
 * @param {number} options.epsilon - Privacy budget (lower = more privacy)
 * @param {number} options.delta - Failure probability
 * @param {number} options.l2NormClip - L2 norm clipping threshold
 * @param {number} options.sampleRate - Training data sampling rate
 * @returns {Buffer} - Differentially private weights
 */
function applyDifferentialPrivacy(weightsBuffer, options = {}) {
  // Default privacy parameters
  const epsilon = options.epsilon || 1.0;
  const delta = options.delta || 1e-5;
  const l2NormClip = options.l2NormClip || 1.0;
  const sampleRate = options.sampleRate || 0.01; // Default to 1% sample rate
  
  console.log(`Applying differential privacy with parameters:
  - Epsilon: ${epsilon}
  - Delta: ${delta}
  - L2 Norm Clip: ${l2NormClip}
  - Sample Rate: ${sampleRate}`);
  
  // Step 1: Clip weights to bound sensitivity
  const clippedWeights = clipWeights(weightsBuffer, l2NormClip);
  
  // Step 2: Calculate sensitivity based on clipping threshold
  const sensitivity = calculateSensitivity(l2NormClip);
  
  // Step 3: Calculate noise scale based on privacy parameters
  const noiseScale = calculateNoiseScale(epsilon, delta, sensitivity);
  
  // Step 4: Generate and add Gaussian noise
  const privatizedWeights = addGaussianNoise(clippedWeights, noiseScale);
  
  // Step 5: Convert back to Buffer
  return Buffer.from(privatizedWeights.buffer);
}

/**
 * Clip the L2 norm of the weights
 * This bounds the sensitivity of the weights to the clipping threshold
 * @param {Buffer|ArrayBuffer} weightsBuffer - Raw weights buffer
 * @param {number} clipThreshold - Threshold for clipping
 * @returns {Float32Array} - Clipped weights
 */
function clipWeights(weightsBuffer, clipThreshold) {
  // Convert buffer to Float32Array for mathematical operations
  const weights = bufferToFloat32Array(weightsBuffer);
  
  // Compute L2 norm of weights
  const l2Norm = computeL2Norm(weights);
  
  console.log(`Original weights L2 norm: ${l2Norm.toFixed(4)}`);
  
  // If the norm is greater than the threshold, scale the weights
  if (l2Norm > clipThreshold) {
    const scaleFactor = clipThreshold / l2Norm;
    for (let i = 0; i < weights.length; i++) {
      weights[i] *= scaleFactor;
    }
    console.log(`Weights clipped with scale factor: ${scaleFactor.toFixed(4)}`);
    console.log(`New L2 norm: ${clipThreshold.toFixed(4)}`);
  } else {
    console.log('No clipping necessary, weights norm within threshold');
  }
  
  return weights;
}

/**
 * Calculate the sensitivity of the weights
 * In federated learning, this is proportional to the clipping threshold
 * @param {number} l2NormClip - L2 norm clipping threshold
 * @returns {number} - Calculated sensitivity
 */
function calculateSensitivity(l2NormClip) {
  // In federated learning with differentially private SGD,
  // sensitivity is directly proportional to the clipping threshold
  return l2NormClip;
}

/**
 * Calculate noise scale for Gaussian mechanism
 * @param {number} epsilon - Privacy parameter
 * @param {number} delta - Failure probability
 * @param {number} sensitivity - Sensitivity of the function
 * @returns {number} - Noise scale (standard deviation)
 */
function calculateNoiseScale(epsilon, delta, sensitivity) {
  // Calculate noise scale using the analytical Gaussian mechanism formula
  // based on the Gaussian differential privacy paper by Balle and Wang (2018)
  const c = Math.sqrt(2 * Math.log(1.25 / delta));
  const stdDev = (c * sensitivity) / epsilon;
  
  console.log(`Calculated noise scale (std dev): ${stdDev.toFixed(4)}`);
  
  return stdDev;
}

/**
 * Add Gaussian noise to weights
 * @param {Float32Array} weights - Input weights
 * @param {number} noiseScale - Noise scale (standard deviation)
 * @returns {Float32Array} - Noisy weights
 */
function addGaussianNoise(weights, noiseScale) {
  // Create noise array of the same length as weights
  const noise = generateGaussianNoise(weights.length, noiseScale);
  
  // Add noise to weights
  const noisyWeights = new Float32Array(weights.length);
  for (let i = 0; i < weights.length; i++) {
    noisyWeights[i] = weights[i] + noise[i];
  }
  
  return noisyWeights;
}

/**
 * Generate Gaussian noise
 * Using cryptographically secure random number generation for better privacy
 * @param {number} size - Size of the noise vector
 * @param {number} stdDev - Standard deviation of the noise
 * @returns {Float32Array} - Gaussian noise
 */
function generateGaussianNoise(size, stdDev) {
  // Generate Gaussian noise using Box-Muller transform
  const noise = new Float32Array(size);
  
  for (let i = 0; i < size; i += 2) {
    // Generate two uniform random numbers using crypto module
    const u1 = crypto.randomBytes(4).readUInt32LE(0) / 0xFFFFFFFF;
    const u2 = crypto.randomBytes(4).readUInt32LE(0) / 0xFFFFFFFF;
    
    // Box-Muller transform to generate Gaussian noise
    const radius = Math.sqrt(-2 * Math.log(u1));
    const theta = 2 * Math.PI * u2;
    
    // Generate two Gaussian samples
    noise[i] = radius * Math.cos(theta) * stdDev;
    if (i + 1 < size) {
      noise[i + 1] = radius * Math.sin(theta) * stdDev;
    }
  }
  
  return noise;
}

/**
 * Compute the privacy cost over multiple rounds
 * Using a simplified moments accountant approximation
 * @param {number} epsilon - Per-round privacy budget
 * @param {number} delta - Failure probability
 * @param {number} iterations - Number of training rounds
 * @param {number} sampleRate - Data sampling rate
 * @returns {Object} - Total privacy cost (epsilon, delta)
 */
function computePrivacyCost(epsilon, delta, iterations, sampleRate) {
  // This is a simplified privacy accounting based on advanced composition
  // For more accurate privacy accounting, libraries like TensorFlow Privacy should be used
  
  // Compute privacy amplification due to subsampling
  const amplification = Math.sqrt(Math.log(1/delta) * iterations * sampleRate);
  
  // Compute total epsilon
  const totalEpsilon = epsilon * amplification;
  
  return {
    epsilon: totalEpsilon,
    delta: delta
  };
}

/**
 * Convert Buffer to Float32Array
 * @param {Buffer|ArrayBuffer} buffer - Input buffer
 * @returns {Float32Array} - Float32Array view of the buffer
 */
function bufferToFloat32Array(buffer) {
  if (buffer instanceof Buffer) {
    // If it's a Node.js Buffer, get the underlying ArrayBuffer
    return new Float32Array(
      buffer.buffer.slice(
        buffer.byteOffset, 
        buffer.byteOffset + buffer.byteLength
      )
    );
  } else {
    // If it's already an ArrayBuffer
    return new Float32Array(buffer);
  }
}

/**
 * Compute L2 norm of a vector
 * @param {Float32Array} vector - Input vector
 * @returns {number} - L2 norm
 */
function computeL2Norm(vector) {
  let sumSquares = 0;
  for (let i = 0; i < vector.length; i++) {
    sumSquares += vector[i] * vector[i];
  }
  return Math.sqrt(sumSquares);
}

module.exports = {
  applyDifferentialPrivacy,
  clipWeights,
  generateGaussianNoise,
  computePrivacyCost,
  calculateSensitivity,
  computeL2Norm,
  bufferToFloat32Array
};