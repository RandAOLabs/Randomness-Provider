# Randao Provider Configuration Guide

This document outlines how to deploy the Randao Provider application using Docker Compose, covering configurations for both standard user environments (e.g., Windows, macOS, Linux desktop) and dedicated Linux service/appliance environments.

-----

## 1\. Core Concepts & Files

The Randao Provider deployment relies on these key files:

  * **`docker-compose.yml`**: The **base** Docker Compose file. It defines the core services (orchestrator, PostgreSQL), their dependencies, and common environment variables. It uses relative paths for `wallet.json` and `postgresql.conf` for portability and serves as the default configuration for standard user environments.
  * **`.env`**: A plain text file storing environment variables (database credentials, network settings). This file is sourced by Docker Compose.
  * **`wallet.json`**: Your Arweave wallet's JWK (JSON Web Key) file. This contains sensitive private key information.
  * **`wallet.seed`** (Optional): If you use a mnemonic seed phrase instead of a JWK.
  * **`docker-compose.appliance.yml`**: An **override** Docker Compose file specifically for appliance deployments. It defines absolute paths for sensitive files (like `wallet.json`) and appliance-specific resource limits.
  * **`postgres/postgresql.conf`**: Custom PostgreSQL configuration for resource-constrained environments.
  * **Wallet Management**: The application's source code (specifically `walletUtils.ts`) has been modified to prioritize reading wallet information securely from mounted files (e.g., `wallet.json` or `wallet.seed`), falling back to environment variables (`WALLET_JSON` or `SEED_PHRASE`) if files aren't found. This guide assumes you are using an image that includes these modifications.

-----

## 2\. Why Use Wallet Files Instead of Environment Variables?

Using dedicated files (like `wallet.json` or `wallet.seed`) for sensitive wallet information is **strongly preferred for security reasons** over passing this data directly as environment variables (`WALLET_JSON` or `SEED_PHRASE`).

Here's why:

  * **Reduced Visibility (Primary Reason):**
      * **Environment Variables (`WALLET_JSON`, `SEED_PHRASE`):** These are notoriously insecure for sensitive data. Anyone with access to the Docker host (even a non-root user with `docker` group access) can easily inspect a running container's environment variables using the `docker inspect <container_id>` command. This means your full wallet private key could be displayed in plain text in the command's output.
      * **Files (`wallet.json`, `wallet.seed`):** When you mount a file into a container (e.g., `/etc/randao/wallet.json` into `/app/config/wallet.json`), the file's content is not directly exposed as an environment variable of the running process. An attacker would need filesystem access to `/etc/randao/wallet.json` on the host (which can be protected with strict permissions), *and* potentially shell access *inside* the container, to read the file.
  * **Principle of Least Privilege (Filesystem):** You can set very tight file permissions on the host (e.g., `chmod 640` or `600`) for `wallet.json` and `wallet.seed`. This allows only the necessary user (e.g., `root` for ownership, `randao_service` user for read access via group) to access the file, further limiting exposure.
  * **Best Practice:** Mounting sensitive data as files is the industry-standard best practice for secret management in containerized environments (e.g., Docker Secrets in Swarm mode, Kubernetes Secrets mounted as volumes).
  * **Logging:** Environment variables can sometimes inadvertently end up in logs if the application or logging system isn't carefully configured. File contents are less prone to this leakage.

While the application supports falling back to environment variables for convenience, **using the file-based method for your wallet is always the more secure choice, especially for production or appliance deployments.**

-----

## 3\. Setting Up the Project Directory

Begin by cloning the Randao Provider repository from GitHub and organizing your configuration files.

### **3.1. Clone the Repository:**

```bash
git clone https://github.com/RandAOLabs/Randomness-Provider.git your-randao-provider-repo
```

### **3.2. Navigate to the Docker Compose Directory:**

```bash
cd your-randao-provider-repo/docker-compose/
```

### **3.3. Project Directory Structure:**

Your directory should look similar to this:

```
your-randao-provider-repo/
├── docker-compose/
│   ├── docker-compose.yml              # Base Docker Compose file
│   ├── docker-compose.appliance.yml    # Appliance-specific overrides
│   ├── postgres/
│   │   └── postgresql.conf             # Custom Postgres config
│   ├── .env.example                    # Example .env file (for users to copy)
│   ├── wallet.json.example             # Example wallet.json (for users to copy)
│   └── wallet.seed.example             # Example wallet.seed (optional)
├── orchestrator/                       # Contains Dockerfile and walletUtils.ts (source, not used directly by docker compose up)
│   └── Dockerfile
│   └── src/walletUtils.ts
├── LICENSE
└── README.md
```

-----

## 4\. Configuration for a Standard Docker User (e.g., Windows, macOS, Linux Desktop)

This setup is for users who want to run the provider locally without systemd integration, using pre-built Docker images.

### **4.1. Prerequisites:**

  * **Docker Desktop** (Windows/macOS) or **Docker Engine** (Linux) installed and running.
  * Access to the command line/terminal.

### **4.2. Setup Steps:**

1.  **Navigate to the `docker-compose` directory** (if not already there):

    ```bash
    cd your-randao-provider-repo/docker-compose/
    ```

2.  **Create `.env` file:**
    Copy the example `.env` file and **fill in your database credentials**.

    ```bash
    cp .env.example .env
    # Open .env in a text editor and fill in DB_USER, DB_PASSWORD, DB_NAME, DOCKER_NETWORK, LOG_CONSOLE_LEVEL
    # Example .env content:
    # DB_USER=myuser
    # DB_PASSWORD=mypassword
    # DB_NAME=mydatabase
    # DOCKER_NETWORK=backend
    # LOG_CONSOLE_LEVEL=7
    ```

3.  **Create `wallet.json` (or `wallet.seed`):**
    Copy the example wallet file and **paste your actual Arweave wallet's JWK content** (or seed phrase) into it.

    ```bash
    cp wallet.json.example wallet.json
    # Open wallet.json in a text editor and paste your JWK content.
    # On Linux/macOS, set permissions for security:
    chmod 600 wallet.json
    ```

      * **Fallback Option:** If you prefer not to create `wallet.json` directly, you can put `WALLET_JSON='{"your_jwk_content"}'` directly into your `.env` file. The application code will fall back to this environment variable if it cannot read `wallet.json` from the mounted file. **Note that this fallback is less secure.**

4.  **Run the Docker Compose Stack:**
    Use the base `docker-compose.yml`. `docker compose` will pull the necessary images.

    ```bash
    docker compose up --pull=always
    ```

      * `--pull=always`: Ensures the latest image versions are pulled from Docker Hub.
      * `up`: Starts the services in the foreground. Add `-d` to run in detached mode (background).

5.  **Monitor Logs:**

    ```bash
    docker compose logs -f
    ```

-----

## 5\. Configuration for a Linux Service / Appliance

This setup provides robust, automated management via `systemd`, enhanced security, and consistent updates, using pre-built Docker images.

### **5.1. Prerequisites:**

  * **Debian/Ubuntu** (or similar Linux distribution) installed.
  * **Docker Engine** and **Docker Compose V2** installed.
  * **`randao_service` system user** created (e.g., `sudo adduser --system --no-create-home --group --uid 888 randao_service`).
  * `randao_service` user added to the `docker` group (e.g., `sudo usermod -aG docker randao_service`).
  * **Swap space** configured (highly recommended for low-RAM devices like H3).
  * **Ownership and permissions** for the project directory set for `randao_service`.
    ```bash
    sudo chown -R randao_service:randao_service /home/randao/Randomness-Provider.git/
    sudo chmod -R u=rwX,go=rX /home/randao/Randomness-Provider.git/
    ```

### **5.2. Setup Steps:**

1.  **Place Sensitive Configuration Files in `/etc/randao/`:**
    These files are managed by `root` but readable by `randao_service`. This is the **preferred and most secure location** for appliance secrets.

    ```bash
    # Create the directory
    sudo mkdir -p /etc/randao/

    # Copy your actual .env and wallet.json files from your local setup or provisioning source
    # Example (assuming they are temporarily available in /tmp/ during provisioning):
    sudo cp /tmp/.env /etc/randao/.env
    sudo cp /tmp/wallet.json /etc/randao/wallet.json
    sudo cp /tmp/wallet.seed /etc/randao/wallet.seed # If using seed file

    # Set ownership and permissions for the directory
    sudo chown root:root /etc/randao/
    sudo chmod 700 /etc/randao/ # Root only access to the directory itself

    # Set ownership and permissions for the files
    sudo chown root:randao_service /etc/randao/.env
    sudo chmod 640 /etc/randao/.env # Root R/W, randao_service group R, others no access

    sudo chown root:randao_service /etc/randao/wallet.json
    sudo chmod 640 /etc/randao/wallet.json

    # If wallet.seed is used
    sudo chown root:randao_service /etc/randao/wallet.seed
    sudo chmod 640 /etc/randao/wallet.seed
    ```

2.  **Place `docker-compose` Project Files:**
    Copy the cloned repository contents to a system location like `/home/randao/Randomness-Provider.git/`.

    ```bash
    # Example:
    sudo cp -r /path/to/your/cloned-repo/Randomness-Provider.git /home/randao/
    ```

3.  **Create Systemd Service Unit (`randao.service`):**
    Create `/etc/systemd/system/randao.service` with the following content:

    ```ini
    # /etc/systemd/system/randao.service
    [Unit]
    Description=RANDAO Provider
    Documentation=https://github.com/RandAOLabs/Randomness-Provider
    Requires=docker.service
    After=network-online.target docker.service

    [Service]
    Type=simple
    User=randao_service
    Group=randao_service
    WorkingDirectory=/home/randao/Randomness-Provider.git/docker-compose
    ExecStart=/usr/bin/docker compose -f docker-compose.yml -f docker-compose.appliance.yml --env-file /etc/randao/.env up --pull=always
    ExecStop=/usr/bin/docker compose down
    TimeoutStartSec=0
    Restart=on-failure
    RestartSec=5s

    [Install]
    WantedBy=multi-user.target
    ```

4.  **Create Systemd Timer Unit (`randao.timer`):**
    Create `/etc/systemd/system/randao.timer` with the following content for periodic updates:

    ```ini
    # /etc/systemd/system/randao.timer
    [Unit]
    Description=Timer to periodically restart RANDAO Provider for latest image pull

    [Timer]
    OnCalendar=*-*-* 00,12:00:00 # Restart every day at midnight and noon UTC
    RandomizedDelaySec=30min     # Add a random delay to prevent stampedes
    Persistent=true              # Trigger on boot if a scheduled run was missed
    OnBootSec=10s                # Start 10 seconds after system boot (initial run)

    [Install]
    WantedBy=timers.target
    ```

5.  **Enable & Start Services:**

    ```bash
    sudo systemctl daemon-reload           # Reload systemd to recognize new units
    sudo systemctl enable randao.timer     # Enable the timer for autostart on reboot
    sudo systemctl start randao.timer      # Start the timer immediately
    # The timer will then trigger randao.service (e.g., after 10 seconds due to OnBootSec)
    ```

6.  **Monitor Logs:**

    ```bash
    sudo journalctl -u randao.service -f   # Monitor real-time logs from your service
    sudo systemctl status randao.timer     # Check timer's status and next activation
    ```