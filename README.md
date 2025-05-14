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
A provider generates **verifiable random numbers** for decentralized applications using a commit-reveal mechanism with timelock puzzles. These random values are essential for fairness in blockchain-based systems.

### How do I earn rewards?
Once staked and online, you earn RNG-Test tokens based on:
- Your uptime
- Response speed
- Reliability in puzzle submission

> ⚠️ You **must stake RNG-Test tokens** through the web UI and keep your node online to earn rewards.

### How do I set up a provider?
1. Clone the repo.
2. Create a new wallet in your browser and send it RNG-Test tokens.
3. Stake using the site UI.
4. Place the wallet's **private key JSON** into your `.env` file.
5. Run `docker-compose up` from the repo directory.

Your provider will start serving randomness as soon as it's recognized.

### What are the minimum system requirements?
Minimum:
- 2 CPU cores
- 4 GB RAM
- Stable internet connection
- SSD or fast flash storage (not HDD)

Recommended:
- 4 CPU cores
- 8 GB RAM

Network stability and uptime matter more than CPU performance.

### Can I run this on a Raspberry Pi?
Yes. A Raspberry Pi 4 or 5 works great. This service is very lightweight, and Pis are ideal for 24/7 uptime with low power usage.

> 💡 Use fast external storage (USB SSD) if possible, and make sure your internet is reliable.

### I rebooted and now my local and on-chain values don’t match. Is that okay?
Yes. This is normal — local and on-chain values can differ slightly due to how often each updates. As long as:
- There are **no errors**
- The on-chain “Available Random” is **positive**

You’re fine. The system will reconcile automatically over time.

### My `.env` file might be broken — how do I check it?
Check the following:
- The file matches `.env.example`
- You correctly pasted your **wallet's private key JSON**
- There are no formatting issues (e.g. missing quotes or equals signs)

If unsure, restart your node with:
```bash
docker-compose down
docker-compose up
```

If it still fails, reach out in Discord.

### I staked tokens but I get “Failed to stake tokens.” What should I do?
- Create a fresh wallet using the browser interface
- Send it RNG-Test tokens
- Stake via the site UI (you should see your balance)
- Paste the wallet's private key JSON into `.env`
- Restart the node

If it still fails after confirming the above, open a support ticket in Discord.

### My node is running but DB size, on-chain, and local values are all 0. What’s wrong?
Most likely causes:
- `.env` is misconfigured or contains an invalid wallet JSON
- The puzzle generator Docker image failed to pull

Try:
- Checking `.env` for typos
- Pulling the image manually: `docker pull randao/puzzle-gen:v0.1.1`
- Restarting with `docker-compose down && docker-compose up`

### My node is running, but the site doesn’t recognize me as a provider. What’s missing?
Two things must happen:
1. You must **stake** using the browser wallet
2. The `.env` file must contain the exact wallet JSON used for staking

If either of these is missing or mismatched, the AO network won’t register you as an active provider.

### Port 3000 is already in use — can I change it?
No need. The provider runs inside a **Docker virtual network** using port 3000 internally. It won't conflict with other services on your host machine, even if they use port 3000.

> Your host system and other apps will not be affected.

### Getting error: `No such image: randao/puzzle-gen:v0.1.1` — how do I fix this?
Run this manually:
```bash
docker pull randao/puzzle-gen:v0.1.1
```
This will fetch the image in case there was a permissions issue or the auto-pull failed.

Once done, restart with `docker-compose up`.

### Can I run this node on the same VPS as my Ar.io Gateway node?
Yes — this is a great combo. There are **no known conflicts** when running them together. The two services don’t compete for ports or storage and run happily side-by-side.

> We are working on adding this provider as an optional Ar.io sidecar soon.

### My node shut down and “Random Available” shows -2. What does that mean?
Negative values mean your provider is **offline** or **disabled**:
- `-1`: You manually shut it down
- `-2`: AO disabled you for being too slow
- `-3`: Disabled by the team (rare)

Your provider won’t auto-recover. Go to the provider site and **toggle it back on manually**.

### What does “Random Available” mean?
- **Positive number**: You’re active and have this much randomness ready to serve
- **0**: You shut down gracefully
- **Negative number**: You’ve been disabled (see above)

Random must be generated **in advance** via timelock puzzles. That’s what’s reflected in this value.

### What are the minimum requirements to run the node smoothly?
You need:
- **Minimum**: 2 CPU cores, 4 GB RAM
- **Recommended**: 4 CPU cores, 8 GB RAM
- **Storage**: SSD or fast flash storage only (no HDDs)

The main requirement is **stable internet** and **high uptime**, not processing power.

### How many tokens do I need to become a full validator?
You need **10,000 RNG-Test tokens** to become a validator. These can be claimed cheaply from the faucet.

> Holding tokens alone does not qualify for airdrops — you must provide randomness (i.e. increase your served count).

### What happens if my provider goes offline?
- If you shut it down **gracefully** (SIGTERM or UI), it sets `availableRandom` to 0 and avoids slashing.
- If you shut it down **abruptly**, you may be slashed or marked inactive.

Always use the proper shutdown button or `CTRL+C` so the system knows you're offline safely.

### Can I run multiple providers?
Yes. Each provider:
- Needs a **unique wallet**
- Must be **staked separately**
- Requires its own `.env` file and Docker instance

You can scale across multiple servers or devices.

### Do I need technical knowledge to run a provider?
Not much. If you can:
- Copy and paste into a terminal
- Edit a `.env` file
- Run Docker

...you’re good to go. The setup is beginner-friendly and we offer full support via Discord.
