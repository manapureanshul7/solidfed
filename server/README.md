# SolidFed-server

This is the backend orchestrator for the SolidFed federated learning project. It provides endpoints to register clients, manage model containers on Solid pods, and handle asynchronous federated learning using a Solid-based infrastructure.

## Table of Contents
- [Features](#features)
- [Architecture Overview](#architecture-overview)
- [Dataflow Overview](#dataflow-overview)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Configuration](#configuration)
- [Usage](#usage)
- [API Endpoints](#api-endpoints)
  - [GET /health](#get-health)
  - [GET /config](#get-config)
  - [POST /register](#post-register)
  - [POST /upload](#post-upload)
- [Aggregation Method](#aggregation-method)
- [Troubleshooting](#troubleshooting)
- [License](#license)
- [Contributing](#contributing)

## Features

* **Asynchronous Federated Learning** - Supports asynchronous model updates with configurable learning rate
* **Solid Pod Integration** - Uses Solid Pods for secure, decentralized storage of model files
* **Immediate Model Aggregation** - Performs immediate aggregation when clients upload model updates
* **Automatic Container Setup** - Initializes model containers with proper permissions
* **History Tracking** - Logs aggregation events for debugging and analysis
* **Model Backup** - Creates local backups of model states

## Architecture Overview

SolidFed implements a Solid-based asynchronous federated learning architecture with the following components:

### Core Components

1. **SolidFed Server** - Central orchestrator that manages model registration, ACL permissions, and aggregation logic
2. **Solid Pod Storage** - Decentralized storage infrastructure that hosts model weights and training scripts
3. **Client Devices** - Edge devices that perform local training and contribute model updates
4. **Aggregation Module** - Implements asynchronous FedAvg algorithm for continuous model improvement

### Key Architectural Principles

- **Decentralized Storage**: All model files are stored on Solid Pods, promoting data sovereignty
- **Asynchronous Updates**: Clients can submit updates at any time without coordination with other clients
- **Immediate Aggregation**: Each client update is immediately integrated into the global model
- **Permission-Based Access**: ACL permissions control read/write access to model files
- **Stateless Design**: The server maintains no in-memory state between requests

## Dataflow Overview

The federated learning process follows these dataflow steps:

1. **Client Registration**
   ```
   Client --> Server: Register for model access
   Server --> Solid Pod: Create model container if needed
   Server --> Solid Pod: Set up ACL permissions
   Server --> Client: Return model URL
   ```

2. **Model Distribution**
   ```
   Client --> Solid Pod: Fetch current global model
   Solid Pod --> Client: Return model weights
   ```

3. **Local Training**
   ```
   Client: Train model on local data
   Client: Generate model update
   ```

4. **Model Update**
   ```
   Client --> Server: Upload model update
   Server --> Solid Pod: Fetch current global model
   Server: Perform aggregation (current_model * (1-lr) + client_update * lr)
   Server --> Solid Pod: Save updated global model
   Server --> Client: Confirm successful update
   ```

5. **History Tracking**
   ```
   Server: Log aggregation metadata
   Server: Save model backup (if enabled)
   ```

## Prerequisites

* Node.js v16 or higher
* NPM
* A Solid identity provider and application credentials (OIDC issuer, client ID, client secret)
* A Solid Pod for storing model files

## Installation

1. Clone the repository and navigate to the server directory:

   ```bash
   git clone https://github.com/manapureanshul7/solidfed.git
   cd solidfed/server
   ```
2. Install dependencies:

   ```bash
   npm install
   ```

## Configuration

Create a `.env` file in the server directory with the following environment variables:

```dotenv
# Required Solid connection settings
SOLID_OIDC_ISSUER=<Your OIDC issuer, e.g. https://solidcommunity.net>
SOLID_CLIENT_ID=<Your Solid app client ID>
SOLID_CLIENT_SECRET=<Your Solid app client secret>
POD_ROOT=<Your Pod root URL, e.g. https://username.solidcommunity.net/solidfed/>

# Server settings
PORT=4000

# Aggregation settings (optional)
LEARNING_RATE=0.1               # Learning rate for asynchronous aggregation (0-1)
HISTORY_DIR=./aggregation_history  # Directory to save aggregation history
SAVE_HISTORY=true               # Whether to save aggregation history (true/false)
BACKUP_MODELS=true              # Enable model backups (true/false)
MAX_BACKUPS=10                  # Maximum number of model backups to keep
```

### ⚠️ Important: Solid Pod Permissions Setup

**Server administrators must complete a critical one-time setup step for each new model:**

1. Login to your Solid Pod at your Pod provider (e.g., `https://yourpod.solidcommunity.net`)
2. Navigate to your SolidFed folder (as specified in `POD_ROOT`)
3. For each new model folder, click on the folder's permissions panel
4. Click the "Set specific sharing for this folder" button

This manual step is required only once per model. If this step is skipped, the server code will attempt to create ACL permissions itself when registering clients, but in doing so, the server may lose control access to its own Pod. This issue will be addressed in a future update.

After completing this step, the server can properly manage permissions for multiple clients on its own.

## Usage

Start the server:

```bash
npm start
```

The server will log:

```
✅ Service logged in as <service WebID>
📁 Pod Root: <POD_ROOT>
🔄 Learning Rate: 0.1
🚀 Orchestrator listening on http://localhost:4000
```

## API Endpoints

### GET /health

**What it does:** Checks if the server is running properly.

**How to use it:**
```bash
# Using curl
curl -X GET http://localhost:4000/health

# Using wget
wget -O - http://localhost:4000/health
```

**Example response:**
```json
{
  "success": true,
  "status": "ok",
  "ready": true,
  "version": "0.1.0",
  "learningRate": 0.1
}
```

### GET /config

**What it does:** Shows the current server configuration.

**How to use it:**
```bash
# Using curl
curl -X GET http://localhost:4000/config

# Using wget
wget -O - http://localhost:4000/config
```

**Example response:**
```json
{
  "success": true,
  "config": {
    "port": 4000,
    "podRoot": "https://username.solidcommunity.net/solidfed/",
    "aggregation": {
      "learningRate": 0.1,
      "saveHistory": true,
      "historyDir": "<configured>"
    }
  },
  "summary": "SolidFed Server Configuration: ..." 
}
```

### POST /register

**What it does:** Registers a client to participate in federated learning for a specific model.

**How to use it:**
```bash
# Using curl
curl -X POST http://localhost:4000/register \
  -H "Content-Type: application/json" \
  -d '{"webId": "https://user.solidcommunity.net/profile/card#me", "modelName": "my-model"}'
```

**Example response:**
```json
{
  "success": true,
  "message": "Granted Reader on https://username.solidcommunity.net/solidfed/my-model/ to https://user.solidcommunity.net/profile/card#me",
  "modelUrl": "https://username.solidcommunity.net/solidfed/my-model/",
  "learningRate": 0.1
}
```

### POST /upload

**What it does:** Uploads client model updates for aggregation with the global model.

**How to use it:**
```bash
# Using curl with a binary file
curl -X POST http://localhost:4000/upload \
  -H "Content-Type: application/octet-stream" \
  -H "webid: https://user.solidcommunity.net/profile/card#me" \
  -H "round: 1" \
  -H "modelName: my-model" \
  --data-binary @./path/to/local/model-weights.bin
```

**Example response:**
```json
{
  "success": true,
  "message": "Update received and model aggregated",
  "url": "https://username.solidcommunity.net/solidfed/my-model/globalModel.bin",
  "modelUrl": "https://username.solidcommunity.net/solidfed/my-model/",
  "aggregationPerformed": true
}
```

## Aggregation Method

The server uses asynchronous federated averaging with a configurable learning rate:

* When a client uploads an update, it's immediately integrated with the global model
* The formula used is: `new_global = (1 - lr) * current_global + lr * client_update`
* This allows continuous model improvement without waiting for all clients

## Troubleshooting

### Common Issues

- **Authentication Failures**: Ensure your SOLID_CLIENT_ID and SOLID_CLIENT_SECRET are correct and the application is registered with your OIDC provider.
  
- **Permission Errors**: Make sure the service account has write access to the POD_ROOT location.
  
- **Container Creation Failures**: Check if the POD_ROOT path exists and the service account has permissions to create containers within it.

### Debugging

Set the NODE_DEBUG environment variable to get more detailed logs:

```bash
NODE_DEBUG=solidfed npm start
```

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.