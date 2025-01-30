# Terraform Configuration for Randomness Provider

This Terraform configuration sets up:
- One orchestrator service on ECS Fargate
- One PostgreSQL RDS instance
- VDF Fargate spot job configuration
- AWS Secrets Manager for sensitive data

## Setup Instructions

1. Copy the example variables file:
```bash
cp terraform.tfvars.example terraform.tfvars
```

2. Edit `terraform.tfvars` with your configuration:
   - Set your database credentials
   - Set your provider ID
   - Copy your wallet JSON and paste it into the `local_wallet_json` variable

Example wallet JSON format:
```json
{
  "address": "your-wallet-address",
  "privateKey": "your-private-key"
}
```

Note: The wallet JSON should be pasted directly into the terraform.tfvars file using the heredoc syntax (<<EOT) as shown in the example file. Do not try to use the file() function in terraform.tfvars as it's not supported there.

3. Initialize Terraform:
```bash
terraform init
```

4. Review the planned changes:
```bash
terraform plan
```

5. Apply the configuration:
```bash
terraform apply
```

## Security Notes

- The `terraform.tfvars` file contains sensitive information and should never be committed to version control
- Add `terraform.tfvars` and `wallet.json` to your `.gitignore`
- In production, sensitive values are stored in AWS Secrets Manager
- Local development variables are only used for initial setup and testing

## Infrastructure Components

- **ECS Cluster**: Runs the orchestrator service and VDF jobs
- **RDS**: PostgreSQL database for the orchestrator
- **Secrets Manager**: Securely stores database credentials and wallet
- **IAM**: Roles and policies for ECS tasks and secrets access
- **CloudWatch**: Log groups for monitoring

## Variables Reference

Required variables:
- `provider_id`: Your unique provider identifier
- `local_db_user`: Database username
- `local_db_password`: Database password
- `local_wallet_json`: Wallet JSON (either direct or via file)

Optional variables (with defaults):
- `aws_region`: AWS region (default: us-east-1)
- `db_name`: Database name (default: orchestrator_db)
- `secrets_prefix`: Prefix for secrets (default: /orchestrator)
