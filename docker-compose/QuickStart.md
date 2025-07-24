# **Randao Provider: Quick Start Guide**

This guide provides a quick way to get the Randao Provider running on your local machine using Docker Compose. This is ideal for development, testing, or non-appliance deployments.  
**Assumptions:**

- You have **Docker Desktop** (Windows/macOS) or **Docker Engine** (Linux) installed and running.
- You have basic command-line knowledge.
- You are using the official randao/orchestrator image, which has been pre-built with the necessary wallet management modifications.
- **You have a compatible Arweave wallet (JWK file or mnemonic seed phrase) ready.**

## **1\. Get the Project Files**

First, clone the Randao Provider repository from GitHub:
```sh
git clone https://github.com/RandAOLabs/Randomness-Provider.git randao-provider
```

Now, navigate into the Docker Compose directory:  
``sh
cd randao-provider/docker-compose/
``

## **2\. Prepare Configuration Files**

You need to create/edit two essential configuration files: .env (for database and logging) and your wallet key file (wallet.json or wallet.seed).

### **2.1. Create .env (Environment Variables)**

This file stores your database credentials and other settings.

1. Copy the example .env file:  
  cp .env.example .env
  
2. Open the newly created .env file in a text editor (e.g., nano .env or code .env) and **fill in your desired values** for the database user, password, and name. You can keep the defaults if running locally for testing.  
  \# .env  
  DB\_USER=myuser  
  DB\_PASSWORD=mypassword  
  DB\_NAME=mydatabase  
  DOCKER\_NETWORK=backend  
  LOG\_CONSOLE\_LEVEL=3 \# Set to 7 for verbose (DEBUG) logs
  

### **2.2. Create Wallet Key File (wallet.json or wallet.seed)**

This file contains your Arweave wallet's private key (JWK) or mnemonic seed phrase. The application will prioritize reading from wallet.json (JWK) if both are present. If neither file is found, it will fall back to environment variables. We recommend using Wander as the Chrome plugin integrates easily with our [Provider Portal](https://providers_randao.ar.io/providers). 

#### **Option A: Using wallet.json (JWK)**

1. Copy the example wallet.json file:  
  cp wallet.json.example wallet.json
  
2. Open wallet.json in a text editor and **replace its content with your actual Arweave wallet's JWK (JSON Web Key) data.**  
  **⚠️ IMPORTANT SECURITY WARNING ⚠️**
  
  - **NEVER use the example wallet content for a real wallet.** Always generate your own unique Arweave wallet.
  - **Keep your wallet.json file secure.** Do not share it or commit it to public repositories.
  - On Linux/macOS, it is highly recommended to set strict permissions:  
    chmod 600 wallet.json

#### **Option B: Using wallet.seed (Mnemonic Seed Phrase)**

1. Copy the example wallet.seed file:  
  cp wallet.seed.example wallet.seed
  
2. Open wallet.seed in a text editor and **replace its content with your actual Arweave wallet's mnemonic seed phrase.** The seed phrase must be 12, 18, or 24 words, separated by single spaces, with no extra characters.  
  **⚠️ IMPORTANT SECURITY WARNING ⚠️**
  
  - **NEVER use the example seed phrase for a real wallet.** Always generate your own unique Arweave wallet.
  - **Keep your wallet.seed file secure.** Do not share it or commit it to public repositories.
  - On Linux/macOS, it is highly recommended to set strict permissions:  
    chmod 600 wallet.seed

### **2.3. Alternative (Less Secure Fallback): Environment Variables**

If you prefer not to create wallet.json or wallet.seed files, you can instead add the wallet content directly into your .env file using the WALLET\_JSON or SEED\_PHRASE environment variables. The application will fall back to these if it cannot read from the mounted files.

- **For JWK:** Add WALLET\_JSON='{"your\_jwk\_content\_here"}' to your .env file.
- **For Seed Phrase:** Add SEED\_PHRASE="your seed phrase words here" to your .env file.

However, **this method is less secure as environment variables are easily inspectable.**

## **3\. Run the Randao Provider**

Now you can start your Docker Compose stack. This command will automatically pull the necessary Docker images and set up your services.  
docker compose up \-d \--pull=always

- \--pull=always: Ensures that Docker always checks for and pulls the latest versions of the images from Docker Hub.
- up: Starts the services in the foreground, showing their logs directly in your terminal.
- \-d: run the container in the background (detached mode)


## **4\. Monitor Logs**

To see the real-time output from your running services (especially for debugging wallet initialization):

`docker compose logs \-f`

## **5\. Stop the Randao Provider**

To stop and remove the running containers, networks, and volumes (excluding named volumes like pgdata):

`docker compose down`

You should now have your Randao Provider up and running locally\!