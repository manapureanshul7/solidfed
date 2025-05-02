# SolidFed - Federated Learning on Solid Pods

This project implements a framework for federated learning using Solid Pods as the data storage backend. It enables privacy-preserving, personalized machine learning applications where users keep control of their data.

## Overview

SolidFed consists of:

1. **Authentication Module** - Connects to Solid Pods securely
2. **Data Management** - Fetches and stores training data and model parameters
3. **Local Training** - Runs machine learning on local data
4. **Model Aggregation** - Securely combines model updates

## Prerequisites

- Node.js (v14 or later)
- Python 3.7+ (for local training)
- Solid Pod account (you can create one at [solidcommunity.net](https://solidcommunity.net/register))

## Installation

1. Clone the repository:
   ```
   git clone [repository-url]
   cd solidfed
   ```

2. Install Node.js dependencies:
   ```
   npm init -y
   npm install
   ```

3. Install Python dependencies:
   ```
   pip install numpy pandas
   ```
   
   For a full implementation with machine learning capabilities, you'd also need:
   ```
   pip install tensorflow pandas scikit-learn
   ```

## Usage

### Command Line Interface

Run the CLI tool:
```
npm start
```

This will present a menu with the following options:

1. **Login to Solid Pod** - Authenticate with your Solid identity
2. **Create federated learning folders** - Set up necessary folders in your Pod
3. **Upload training data** - Send local data to your Pod
4. **Download training data** - Retrieve data from your Pod
5. **Run local training** - Execute training on your machine
6. **Upload model weights** - Send trained weights to your Pod
7. **Logout** - End your session
8. **Exit** - Close the application

### Authentication Flow

The authentication uses the Solid OIDC Device Flow for CLI applications:

1. Run the login command in the CLI
2. You'll be provided with a URL to visit in your browser
3. Authenticate with your Solid provider (e.g., solidcommunity.net)
4. After authentication, you'll be redirected to a callback URL
5. Copy the full redirect URL and paste it back into the CLI
6. The system will automatically discover your Pod URLs

## Project Structure

- `solidfed-auth.js`: Authentication module for Solid Pods
- `solidfed-cli.js`: Command-line interface 
- `train_model.py`: Python script for local model training (placeholder)
- `package.json`: Node.js dependencies and project metadata

## Key Features

- **Pod Discovery**: Automatically finds all available Pods for a WebID
- **Auto-creating Containers**: The system auto-creates containers when saving files
- **Streamlined File Handling**: Simple API for reading and writing files
- **Emojis in Console**: Visual indicators for different operations

## Extending the Project

This implementation provides the foundational components. To create a complete federated learning system:

1. **Model Aggregation Server**: Implement a server to collect and aggregate model updates
2. **Production Training**: Replace the placeholder training with actual ML frameworks
3. **Security Enhancements**: Add differential privacy, secure aggregation, etc.
4. **Advanced Consent Management**: Implement fine-grained permissions for data usage

## License

MIT

## References

- [Solid Project](https://solidproject.org/)
- [Inrupt Solid Client Libraries](https://docs.inrupt.com/developer-tools/javascript/client-libraries/)
- [Federated Learning](https://ai.googleblog.com/2017/04/federated-learning-collaborative.html)