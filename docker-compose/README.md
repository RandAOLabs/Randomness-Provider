# Docker Compose Setup Guide

This guide walks you through deploying a randomness provider using Docker Compose on your own hardware.

## Prerequisites

- A machine meeting the minimum hardware requirements (4 GB memory, 2 CPU cores)
- Reliable internet connection
- Ability to ensure 100% uptime or follow graceful shutdown procedures

## Steps to Deploy

1. **Install Docker and Docker Compose**  
   Follow the [official Docker Compose installation guide](https://docs.docker.com/compose/install/) for your operating system.

2. **Configure Environment Variables**
   Navigate to the Docker Compose directory and create your environment file:
   ```bash
   cp .env.example .env
   ```

   Then edit the `.env` file and fill in all required variables:

   **Required Variables:**
   - `provider_id`: Your unique provider identifier
   - `local_db_user`: Database username
   - `local_db_password`: Database password
   - `local_wallet_json`: Wallet JSON (either direct or via file path)

   **Optional Variables (with defaults):**
   - `aws_region`: AWS region (default: us-east-1)
   - `db_name`: Database name (default: orchestrator_db)
   - `secrets_prefix`: Prefix for secrets (default: /orchestrator)

3. **Deploy Your Provider**
   From the Docker Compose directory, run:
   ```bash
   docker-compose up -d
   ```

4. **Verify Deployment**
   Check the status of your containers:
   ```bash
   docker-compose ps
   ```

   View logs to ensure everything is running correctly:
   ```bash
   docker-compose logs -f
   ```

## How It Works

This deployment creates three containerized services:

1. **Provider Service**: Handles the main provider functionality and communicates with the blockchain
2. **Database**: Stores cryptographic time lock puzzles and provider state
3. **Puzzle Generator**: Creates time lock puzzles through the "mining" process

## Advantages of Docker Compose

- **Easier Setup**: More straightforward for those with existing hardware
- **Direct Control**: Full control over your infrastructure
- **Simplified Management**: Easy to manage with standard Docker commands
- **Lower Technical Barrier**: Simpler for those familiar with containerization

## Troubleshooting

If you encounter issues with your provider, here are some common problems and solutions:

### "Provider Not Found" Error
- Ensure your provider is properly staked at https://providers_randao.ar.io
- Wait for blockchain confirmation as it may take some time for your stake to be recognized
- Check your wallet configuration in the `.env` file

### Network Connectivity Issues
- If your provider can't connect to the network, it may be due to network congestion
- Wait for network conditions to improve before attempting to restart
- Check your internet connection and firewall settings

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

## Maintenance

Remember to follow the graceful shutdown procedure in the main documentation when performing maintenance on your Docker-based provider. Never kill the containers without proper shutdown or you risk being slashed.

To update your provider when new versions are released:

```bash
docker-compose pull
docker-compose down
docker-compose up -d
```

---

[Return to Main Documentation](../README.md)
