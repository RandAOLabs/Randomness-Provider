# Node Provider Setup Guide

This guide will help you set up your randomness provider node and start earning rewards. The guide is split into a simple quickstart section followed by more detailed technical information.

## Table of Contents
1. [Quickstart Guide](#quickstart-guide)
2. [How It Works](#how-it-works)
3. [Hardware Requirements](#hardware-requirements)
4. [Detailed Setup Instructions](#detailed-setup-instructions)
5. [Maintenance](#maintenance)
6. [Graceful Shutdown](#graceful-shutdown)
7. [Troubleshooting](#troubleshooting)
8. [Frequently Asked Questions](#frequently-asked-questions)

---

## Quickstart Guide

Setting up your randomness provider is easy! Just follow these simple steps:

### Step 1: Install Docker
Install Docker and Docker Compose by following the [official Docker Compose installation guide](https://docs.docker.com/compose/install/) for your operating system.

### Step 2: Set Up Your Environment
1. Navigate to the Docker Compose directory
2. Copy the example environment file:
   ```
   cp .env.example .env
   ```
3. Edit the `.env` file and add your wallet information

### Step 3: Start Your Provider
Run this command to start your provider:
```
docker-compose up -d
```

### Step 4: Stake Your Node
1. Navigate to ar://randao
2. Connect your wallet
3. Follow the staking instructions to activate your provider

That's it! Your node is now running and will start generating randomness for the network.

**Need help?** Check the [Troubleshooting](#troubleshooting) section or [Frequently Asked Questions](#frequently-asked-questions) below.

---

## How It Works

Your provider performs 3 main functions:
1. It creates and stores random values that others can request
2. It responds when someone requests a random value
3. It submits final verified random values to the blockchain

The better your provider performs these functions, the more rewards you'll receive. Providers with faster response times earn more!

---

## Hardware Requirements

To run a node, you'll need:
- At least 4 GB memory
- At least 2 CPU cores
- Reliable internet connection

**Note:** These requirements may increase over time as the network grows.

---

## Detailed Setup Instructions

### Prerequisites
- A machine meeting the minimum hardware requirements
- Docker and Docker Compose installed
- Reliable internet connection
- Ability to ensure 100% uptime or follow the [Graceful Shutdown](#graceful-shutdown) procedures

### Setup Steps

1. **Configure Environment Variables**
   Navigate to the Docker Compose directory and create your environment file:
   ```bash
   cp .env.example .env
   ```

   Then edit the `.env` file and fill in all required variables:

   **Required Variables:**
   - `provider_id`: Your unique provider identifier
   - `local_db_user`: Database username
   - `local_db_password`: Database password
   - `local_wallet_json`: Your wallet information (either directly pasted or as a file path)

   **Optional Variables (with defaults):**
   - `db_name`: Database name (default: orchestrator_db)
   - `secrets_prefix`: Prefix for secrets (default: /orchestrator)

2. **Deploy Your Provider**
   From the Docker Compose directory, run:
   ```bash
   docker-compose up -d
   ```

3. **Verify Deployment**
   Check the status of your containers:
   ```bash
   docker-compose ps
   ```

   View logs to ensure everything is running correctly:
   ```bash
   docker-compose logs -f
   ```

4. **Staking**
   After successfully setting up your node:
   1. Show logs from the node setup to Ethan for verification
   2. Upon confirmation, Ethan will provide your provider address with the necessary funds
   3. Navigate to ar://randao to stake your funds and configure your provider information

By completing this process, you will fully activate your node and ensure it is ready for network participation.

---

## Maintenance

To update your provider when new versions are released:

```bash
docker-compose pull
docker-compose down
docker-compose up -d
```

Remember to follow the graceful shutdown procedure when performing maintenance to avoid penalties.

---

## Graceful Shutdown

If you need to perform maintenance or temporarily shut down your provider, it's critical to follow these steps to avoid being penalized:

1. Go to ar://randao
2. Navigate to your node
3. Select the "SHUT DOWN" button and sign the transaction
4. Wait for your provider to complete all pending requests (check logs)
5. Once all pending requests are complete, you can safely shut down your provider

After maintenance is complete and your provider is back online:
1. Click the "START UP" button
2. This will signal your provider to resume serving random values

**Warning:** Failing to follow the graceful shutdown procedure may result in penalties to your stake!

---

## Troubleshooting

If you encounter issues with your provider, here are some common problems and solutions:

### "Provider Not Found" Error
- Ensure your provider is properly staked at ar://randao
- Wait for blockchain confirmation (it may take some time for your stake to be recognized)
- Check your wallet configuration in the `.env` file

### Network Connectivity Issues
- If your provider can't connect to the network, check your internet connection
- Check your firewall settings to ensure the required ports are open
- Wait for network conditions to improve before attempting to restart

### Slow or Unresponsive Provider
- Check system resources to ensure your host has sufficient CPU and memory
- Monitor the logs for any error messages or warnings:
  ```bash
  docker-compose logs -f
  ```
- If the puzzle generator is struggling, consider scaling up your hardware

### General Issues
- Try restarting the containers:
  ```bash
  docker-compose restart
  ```
- For more persistent issues, you can try a full reset:
  ```bash
  docker-compose down
  docker-compose up -d
  ```
- Ensure your container has the latest version:
  ```bash
  docker-compose pull
  docker-compose down
  docker-compose up -d
  ```

### Database Issues
- If the database container fails to start, check logs for specific errors:
  ```bash
  docker-compose logs db
  ```
- Ensure the database password in your `.env` file doesn't contain special characters that need escaping
- Verify database volume permissions if running on Linux

---

## Frequently Asked Questions

### What is a randomness provider?
A randomness provider generates verifiable random numbers that are used in various decentralized applications on the blockchain. These random numbers are crucial for fair and transparent operation of many applications.

### How do I earn rewards?
You earn rewards by providing random values to users who request them. The rewards depend on your provider's performance, reliability, and response time.

### What happens if my provider goes offline?
If your provider goes offline without following the graceful shutdown procedure, you may be penalized (slashed). Always follow the [Graceful Shutdown](#graceful-shutdown) procedure before taking your provider offline.

### How much can I earn as a provider?
Earnings depend on network demand, your provider's performance, and the amount you have staked. Better-performing providers with higher stakes tend to earn more.

### Can I run multiple providers?
Yes, you can run multiple providers. Each provider needs its own unique wallet and must be staked separately.

### What is the recommended hardware for optimal performance?
While the minimum requirements are 4GB RAM and 2 CPU cores, we recommend at least 8GB RAM and 4 CPU cores for optimal performance.

### Do I need technical knowledge to run a provider?
Basic familiarity with command line operations and Docker is helpful, but the quickstart guide is designed to be accessible even to those with limited technical experience.

### How often do I need to update my provider?
Updates will be announced in the community channels. We recommend keeping your provider updated to the latest version for optimal performance and security.

---

Thank you for contributing to the network's success!
