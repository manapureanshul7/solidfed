# SolidFed-server

This is the backend orchestrator for the SolidFed federated learning project. It provides endpoints to register clients, manage model containers on Solid pods, and upload global model updates.

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
SOLID_OIDC_ISSUER=<Your OIDC issuer, e.g. https://solidcommunity.net>
SOLID_CLIENT_ID=<Your Solid app client ID>
SOLID_CLIENT_SECRET=<Your Solid app client secret>
POD_ROOT=<Your Pod root URL, e.g. https://username.solidcommunity.net/solidfed/>
PORT=4000
```

## Usage

Start the server:

```bash
npm start
```

The server will log:

```
✅ Service logged in as <service WebID>
📁 Pod Root: <POD_ROOT>
🚀 Orchestrator listening on http://localhost:4000
```

## API Endpoints

### POST /register

Register a client to access a model container.

**Request Body** (JSON):

```json
{
  "webId": "https://user.solidcommunity.net/profile/card#me",
  "modelName": "my-model"
}
```

**Response** (JSON):

```json
{
  "success": true,
  "message": "Granted Reader on <modelFolderUrl> to <webId>",
  "modelUrl": "<modelFolderUrl>"
}
```

### POST /upload

Upload client model updates to the global model.

**Headers**:

* `webid`: Client's WebID
* `round`: Training round number
* `modelName`: Name of the model/container

**Request Body**: Raw binary (`application/octet-stream`) of the model weights.

**Response** (JSON):

```json
{
  "success": true,
  "url": "<globalModelUrl>",
  "modelUrl": "<modelFolderUrl>"
}
```
