# Steps to Deploy:
1. **Install Docker Compose:**  
   Follow the [official Docker Compose installation guide](https://docs.docker.com/compose/install/).


2. **Deploy Node:**
   Navigate to the Docker Compose directory and run:
   ```bash
   cp .env.example .env
   ```
Then fill in all of the variables:
Required variables:
- `provider_id`: Your unique provider identifier
- `local_db_user`: Database username
- `local_db_password`: Database password
- `local_wallet_json`: Wallet JSON (either direct or via file)

Optional variables (with defaults):
- `aws_region`: AWS region (default: us-east-1)
- `db_name`: Database name (default: orchestrator_db)
- `secrets_prefix`: Prefix for secrets (default: /orchestrator)

3. **Deploy Node:**
   Navigate to the Docker Compose directory and run:
   ```bash
   docker-compose up -d
   ```

This setup will work but may not guarantee the same performance or reliability as the AWS-based deployment.

---

[Main docs](../README.md)