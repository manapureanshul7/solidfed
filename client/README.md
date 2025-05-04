# SolidFed Client

This is the client application for SolidFed, an asynchronous federated learning system built on Solid Pods. The system allows users to participate in collaborative machine learning while maintaining data sovereignty and privacy.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Configuration](#configuration)
- [Usage](#usage)
  - [Authentication](#authentication)
  - [Model Registration](#model-registration)
  - [Data Download](#data-download)
  - [Model Download](#model-download)
  - [Local Training](#local-training)
  - [Weight Upload](#weight-upload)
- [CLI Commands](#cli-commands)
- [Troubleshooting](#troubleshooting)
- [Advanced Usage](#advanced-usage)
- [Architecture Overview](#architecture-overview)

## Prerequisites

Before using the SolidFed Client, you need:

- **Node.js** (v14 or higher)
- **npm** (v6 or higher)
- **Python** (v3.6 or higher) for running the training scripts
- **A Solid Pod** (e.g., on [SolidCommunity.net](https://solidcommunity.net/))
- **Client ID & Secret** for your Solid account

## Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/solidfed.git
   cd solidfed/client
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Install Python dependencies for training scripts:
   ```bash
   pip install numpy tensorflow pandas
   ```

## Configuration

Create a `.env` file in the client directory with the following variables:

```
# Required: Your Solid Pod authentication details
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

The SolidFed client provides a command-line interface (CLI) for all operations. Launch it with:

```bash
npm start
```

This will start the interactive CLI menu with the following options:

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

This step authenticates you with your Solid Pod using the client credentials flow.

If you have already configured `SOLID_CLIENT_ID` and `SOLID_CLIENT_SECRET` in your `.env` file, the client will use those credentials. Otherwise, you will be prompted to enter them manually.

```
Enter your Token Identifier: your_client_id
Enter your Token Secret: your_client_secret
```

Upon successful authentication, the CLI will display:
```
✅ Logged in as https://yourusername.solidcommunity.net/profile/card#me
```

### Model Registration

**Option 2: Register for a model**

This step connects you to the orchestrator server and requests access to a specific federated learning model. You must be logged in first.

1. Select a model from the list:
   ```
   ===== Select a Model =====
   1. breast-cancer-detection
   2. movie-recommendation
   3. dummy-model
   4. Back to main menu
   ```

2. The client sends a registration request to the server:
   ```
   Registering for model: breast-cancer-detection...
   ```

3. The server creates necessary containers and grants you read permissions:
   ```
   ✅ Successfully registered for breast-cancer-detection
   📁 Model URL: https://solidfed.solidcommunity.net/solidfed/breast-cancer-detection/
   ```

The model URL is stored for future operations, allowing direct access to the model files.

### Data Download

**Option 3: Download training data**

This step downloads training datasets for local use. If `CLIENT_DATASET_URL` is set in your `.env` file, it will use that location; otherwise, you will be prompted for a URL.

```
↓ Fetching container: https://yourusername.solidcommunity.net/datasets/
↓ Downloading train.csv → ./dataset/train.csv
↓ Downloading test.csv → ./dataset/test.csv
✅ Downloaded 2 file(s) into ./dataset
```

### Model Download

**Option 4: Download model & trainer code**

This step downloads the global model and trainer script from the Solid Pod. It uses the model URL obtained during registration.

```
Downloading model and trainer for: breast-cancer-detection...
Using stored model URL: https://solidfed.solidcommunity.net/solidfed/breast-cancer-detection/
↓ Fetching globalModel.bin from https://solidfed.solidcommunity.net/solidfed/breast-cancer-detection/
✅ Downloaded globalModel.bin using direct fetch
↓ Fetching clientTrainer.py from https://solidfed.solidcommunity.net/solidfed/breast-cancer-detection/
✅ Downloaded clientTrainer.py using direct fetch
✅ Downloaded model and trainer successfully
```

The files are saved to your local directory and can be examined or modified as needed.

### Local Training

**Option 5: Train locally & upload weights**

This step executes the trainer script on your local data and then uploads the resulting weights to contribute to the global model.

1. The client executes the trainer script:
   ```
   Running local training...
   Executing clientTrainer.py...
   Training on local data...
   Training complete. Weights saved to localWeights.bin
   ```

2. Enter the round number when prompted:
   ```
   Federated round number (default: 1): 2
   ```

3. The client uploads your weights to the orchestrator:
   ```
   Uploading weights for model breast-cancer-detection, round 2...
   ✅ Uploaded to https://solidfed.solidcommunity.net/solidfed/breast-cancer-detection/globalModel.bin
   ```

## CLI Commands

The SolidFed client is designed with an interactive menu, but if you prefer direct commands, here's a reference:

- **Login**: `node cli.js login`
- **Register**: `node cli.js register MODEL_NAME`
- **Download data**: `node cli.js download-data [URL]`
- **Download model**: `node cli.js download-model MODEL_NAME`
- **Train**: `node cli.js train MODEL_NAME ROUND`
- **Logout**: `node cli.js logout`

## Troubleshooting

### Permission Issues

If you encounter 403 Forbidden errors when trying to download files:

1. **Check Registration**: Ensure you've successfully registered for the model
2. **Try Direct Fetch**: The client will attempt both direct fetch and library-based methods
3. **Check URLs**: Verify the URLs in the debug output match your expected pod structure
4. **Pod ACLs**: Check permissions on your Solid Pod through its web interface

### Training Errors

If the training script fails:

1. **Check Python Version**: Ensure you're using Python 3.6+
2. **Check Dependencies**: Install required packages with `pip install -r requirements.txt`
3. **Data Path**: The trainer expects data in the `./dataset` directory
4. **Model Format**: Ensure `globalModel.bin` is in the correct format (binary NumPy array)

## Advanced Usage

### Custom Training Scripts

You can modify the `clientTrainer.py` script to implement your own training logic:

1. Download the script: `Option 4`
2. Modify the script to change architecture, hyperparameters, etc.
3. Run training with your changes: `Option 5`

The only requirement is that your script should save weights to `localWeights.bin` in the format expected by the server.

### Multiple Models

You can work with multiple models simultaneously:

1. Register for different models: `Option 2`
2. Download each model separately: `Option 4`
3. Train on each model locally
4. Upload weights for each model: `Option 5`

The client will keep track of the current model, which you can see displayed in the main menu.

## Architecture Overview

The SolidFed system follows an asynchronous federated learning approach where:

1. **Server Orchestrator**: Central coordinator that manages registrations and updates
2. **Solid Pods**: Decentralized storage for model files and data
3. **Client CLI**: Interface for users to interact with the system

The workflow consists of:
- Registration: Client requests access to a model
- Download: Client retrieves model files directly from Pods
- Training: Client trains locally on their data
- Upload: Client contributes weights back to the global model

This architecture ensures data sovereignty while enabling collaborative learning across distributed clients.
