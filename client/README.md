# SolidFed Client

This is the client application for SolidFed, an asynchronous federated learning system built on Solid Pods. The system allows users to participate in collaborative machine learning while maintaining data sovereignty and privacy.

## Table of Contents

- [Features](#features)
- [Architecture Overview](#architecture-overview)
- [Dataflow Overview](#dataflow-overview)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Configuration](#configuration)
- [Usage](#usage)
  - [CLI Interface](#cli-interface)
  - [Authentication](#authentication)
  - [Model Registration](#model-registration)
  - [Data and Model Management](#data-and-model-management)
  - [Training and Contribution](#training-and-contribution)
- [Privacy Features](#privacy-features)
- [API Examples](#api-examples)
- [Troubleshooting](#troubleshooting)
- [Contributing](#contributing)
- [License](#license)

## Features

* **Interactive CLI** - User-friendly command-line interface for all operations
* **Solid Pod Integration** - Direct access to decentralized data storage
* **Asynchronous Participation** - Contribute to federated learning on your own schedule
* **Privacy Protection** - Built-in differential privacy options to protect training data
* **Flexible Training** - Support for custom training scripts and parameters
* **Multi-Model Support** - Work with multiple federated learning models simultaneously

## Architecture Overview

The SolidFed client is part of a larger federated learning ecosystem with the following components:

### Core Components

1. **Client Application** - This command-line tool that enables users to participate in federated learning
2. **Solid Pod Storage** - Decentralized storage infrastructure that hosts data and model files
3. **Server Orchestrator** - Central service that manages model registration and updates
4. **Training Engine** - Python-based local training environment that runs on the client's machine

### Key Architectural Principles

- **Data Sovereignty**: Local data never leaves the user's device; only model updates are shared
- **Privacy Preservation**: Differential privacy mechanisms protect against data extraction
- **Decentralized Storage**: All shared model files are hosted on Solid Pods rather than centralized servers
- **Asynchronous Updates**: Clients can contribute to the global model at any time
- **Flexible Integration**: Support for various ML frameworks and training algorithms

## Dataflow Overview

The client participates in federated learning through these dataflow steps:

1. **Authentication and Registration**
   ```
   Client --> Solid Pod: Authenticate using client credentials
   Client --> Server: Register for model access
   Server --> Solid Pod: Configure permissions for client
   Server --> Client: Return model URL
   ```

2. **Model and Data Acquisition**
   ```
   Client --> Solid Pod: Fetch current global model
   Client --> Local Storage: Download training data (optional)
   Client --> Local Storage: Save model and trainer script
   ```

3. **Local Training**
   ```
   Client: Execute training script on local data
   Client: Generate model update
   Client: Apply differential privacy (optional)
   ```

4. **Model Contribution**
   ```
   Client --> Server: Upload model update
   Server --> Solid Pod: Integrate update with global model
   Server --> Client: Confirm successful contribution
   ```

## Prerequisites

* **Node.js** (v14 or higher)
* **npm** (v6 or higher)
* **Python** (v3.6 or higher) for running the training scripts
* **A Solid Pod** (e.g., on [SolidCommunity.net](https://solidcommunity.net/))
* **Client ID & Secret** for your Solid account (authentication details)

## Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/manapureanshul7/solidfed.git
   cd solidfed/client
   ```

2. Install Node.js dependencies:
   ```bash
   npm install
   ```

3. Install Python dependencies for training scripts:
   ```bash
   pip install numpy tensorflow pandas
   ```

4. Make the CLI executable (optional):
   ```bash
   chmod +x cli.js
   ```

## Configuration

Create a `.env` file in the client directory with the following variables:

```dotenv
# Required: Solid Pod authentication details
SOLID_OIDC_ISSUER=https://solidcommunity.net
SOLID_CLIENT_ID=your_client_id
SOLID_CLIENT_SECRET=your_client_secret

# Optional: Pre-configured settings
ORCHESTRATOR_URL=http://localhost:4000
SOLIDFED_POD_ROOT=https://solidfed.solidcommunity.net/solidfed/
CLIENT_DATASET_URL=https://yourusername.solidcommunity.net/datasets/
```

### Getting Your Client ID & Secret

To generate your Client ID & Secret on SolidCommunity.net:
1. Go to https://solidcommunity.net/.account/login/password/ and log in
2. Scroll to "Credential tokens" → "Create token"
3. Copy the returned "id" as Client ID and "secret" as Client Secret

## Usage

### CLI Interface

Start the SolidFed client CLI with:

```bash
npm start
```

Or directly:

```bash
./cli.js
```

The interactive menu provides the following options:

```
===== SolidFed CLI =====
1. Login to Solid Pod
2. Register for a model
3. Download training data
4. Download model & trainer code
5. Train locally & upload weights
6. How to get your Client ID & Secret
7. Logout
8. Exit
```

### Authentication

**Option 1: Login to Solid Pod**

This authenticates with your Solid Pod using client credentials:

```bash
# Using curl
curl -X POST -H "Content-Type: application/json" \
  -d '{"clientId": "your_client_id", "clientSecret": "your_client_secret"}' \
  https://solidcommunity.net/.oidc/token
```

If you've configured your `.env` file, the CLI will use those credentials automatically. Otherwise, you'll be prompted:

```
Enter your Token Identifier: your_client_id
Enter your Token Secret: your_client_secret
```

Upon successful authentication, you'll see:
```
✅ Logged in as https://yourusername.solidcommunity.net/profile/card#me
```

### Model Registration

**Option 2: Register for a model**

This connects you to the orchestrator server and requests access to a specific model:

1. Select a model from the list:
   ```
   ===== Select a Model =====
   1. breast-cancer-detection
   2. movie-recommender
   3. dummy-model
   4. Back to main menu
   ```
This are currently statically updated, new functionality is to be added to fetch them directly from the Server's pod.

2. The client registers with the server:
   ```
   Registering for model: test-2...
   ✅ Successfully registered for test-2
   📁 Model URL: https://solidfed.solidcommunity.net/solidfed/test-2/
   ```

### Data and Model Management

**Option 3: Download training data**

Download datasets for local training:

```
↓ Fetching container: https://yourusername.solidcommunity.net/datasets/
↓ Downloading train.csv → ./dataset/train.csv
✅ Downloaded 1 file(s) into ./dataset
```

**Option 4: Download model & trainer code**

Fetch the current global model and training script:

```
Downloading model and trainer for: test-2...
↓ Fetching globalModel.bin from https://solidfed.solidcommunity.net/solidfed/test-2/
✅ Downloaded globalModel.bin using direct fetch
↓ Fetching clientTrainer.py from https://solidfed.solidcommunity.net/solidfed/test-2/
✅ Downloaded clientTrainer.py using direct fetch
```

### Training and Contribution

**Option 5: Train locally & upload weights**

Execute training and contribute your model updates:

```
Running local training...
Executing clientTrainer.py...
Training on local data...
Training complete. Weights saved to localWeights.bin

===== Upload Options =====
1. Upload weights without privacy protection
2. Upload weights with differential privacy
3. View differential privacy explanation
4. Cancel upload
```

If you choose differential privacy:

```
===== Configure Differential Privacy =====
Epsilon (ε) - Privacy Budget: 1.0
Delta (δ) - Privacy Failure Probability: 1e-5
L2 Norm Clipping Threshold: 1.0
Approximate Training Dataset Size: 1000

Applying differential privacy with parameters:
  - Epsilon: 1.0
  - Delta: 0.00001
  - L2 Norm Clip: 1.0
  - Sample Rate: 0.001
```

## Privacy Features

The SolidFed client offers built-in differential privacy to protect your training data:

- **Noise Injection**: Adds calibrated Gaussian noise to model updates
- **L2 Norm Clipping**: Limits the influence of any single training example
- **Privacy Budget Management**: Tracks cumulative privacy cost across rounds
- **Privacy-Utility Tradeoff**: Configurable parameters to balance protection and model quality

Configure privacy settings directly in the upload menu:

```
===== Configure Differential Privacy =====
Epsilon (ε) - Privacy Budget:
  - Low values (0.1-1.0): High privacy, potentially lower utility
  - Medium values (1.0-5.0): Good privacy-utility tradeoff
  - High values (5.0+): Prioritizes utility over privacy
```

## API Examples

### Model Registration with Curl

```bash
curl -X POST http://localhost:4000/register \
  -H "Content-Type: application/json" \
  -d '{
    "webId": "https://user.solidcommunity.net/profile/card#me",
    "modelName": "test-2"
  }'
```

### Upload Model Weights with Curl

```bash
curl -X POST http://localhost:4000/upload \
  -H "Content-Type: application/octet-stream" \
  -H "webid: https://user.solidcommunity.net/profile/card#me" \
  -H "round: 1" \
  -H "modelName: test-2" \
  --data-binary @./localWeights.bin
```

### Using the Client from NodeJS

```javascript
const { loginWithClientCreds } = require('./auth');
const { downloadModelAndTrainer } = require('./download');
const { trainWithDP } = require('./train');

async function runFederatedLearningWorkflow() {
  // 1. Authenticate
  const session = await loginWithClientCreds();
  
  // 2. Register for a model (if not already registered)
  // ... registration code ...
  
  // 3. Download model and trainer
  await downloadModelAndTrainer(session, 'test-2');
  
  // 4. Train with differential privacy
  const dpOptions = {
    epsilon: 1.0,
    delta: 1e-5,
    l2NormClip: 1.0,
    datasetSize: 1000
  };
  
  await trainWithDP(session, 'test-2', dpOptions);
}
```

## Troubleshooting

### Authentication Issues

- **Invalid Credentials**: Ensure your Client ID and Secret are correct and not expired
- **OIDC Issuer**: Confirm the SOLID_OIDC_ISSUER value matches your identity provider
- **Session Expiration**: Re-login if your session has timed out

### File Access Problems

- **403 Forbidden**: Ensure you've properly registered for the model
- **File Not Found**: Check that the model URLs are correct
- **Network Errors**: Verify your internet connection and Pod provider availability

### Training Errors

- **Python Environment**: Ensure Python 3.6+ is installed with required packages
- **Training Script**: Check that clientTrainer.py is compatible with your local setup
- **Dataset Structure**: Verify dataset folder exists with expected files

### Upload Issues

- **Weights Format**: Ensure localWeights.bin is generated in the correct format
- **Server Connection**: Verify the ORCHESTRATOR_URL is correct and server is running
- **Permission Errors**: Check that your WebID has proper access permissions

## Contributing

Contributions are welcome! To contribute to SolidFed Client:

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Commit your changes: `git commit -m 'Add amazing feature'`
4. Push to the branch: `git push origin feature/amazing-feature`
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details.