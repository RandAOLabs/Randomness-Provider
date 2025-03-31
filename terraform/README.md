# AWS Terraform Setup Guide

This guide walks you through deploying a randomness provider using Terraform and AWS cloud services for optimal performance and reliability.

## Prerequisites

- An AWS account with appropriate permissions
- Basic familiarity with AWS services and Terraform
- Terraform installed on your local machine

## Steps to Deploy

1. **Install Terraform**  
   Follow the [official Terraform installation guide](https://developer.hashicorp.com/terraform/tutorials/aws-get-started/install-cli).

2. **Set Up IAM User and Policy**
   1. Go to AWS IAM and create a new policy called `RandAO-Provider-Admin`
   2. Select the JSON tab and paste this policy:
   ```json
   {
      "Version": "2012-10-17",
      "Statement": [
          {
              "Effect": "Allow",
              "Action": [
                  "ecs:CreateCluster",
                  "ecs:DeleteCluster",
                  "ecs:CreateService",
                  "ecs:DeleteService",
                  "ecs:UpdateService",
                  "ecs:RegisterTaskDefinition",
                  "ecs:DeregisterTaskDefinition",
                  "ecs:ListTaskDefinitions",
                  "ecs:DescribeTaskDefinition",
                  "ecs:PutClusterCapacityProviders",
                  "ecs:DescribeClusters"
              ],
              "Resource": "*"
          },
          {
              "Effect": "Allow",
              "Action": [
                  "iam:CreateRole",
                  "iam:DeleteRole",
                  "iam:GetRole",
                  "iam:PutRolePolicy",
                  "iam:DeleteRolePolicy",
                  "iam:AttachRolePolicy",
                  "iam:DetachRolePolicy",
                  "iam:PassRole"
              ],
              "Resource": "arn:aws:iam::*:role/orchestrator-*"
          },
          {
              "Effect": "Allow",
              "Action": [
                  "secretsmanager:CreateSecret",
                  "secretsmanager:DeleteSecret",
                  "secretsmanager:GetSecretValue",
                  "secretsmanager:PutSecretValue",
                  "secretsmanager:UpdateSecret",
                  "secretsmanager:TagResource"
              ],
              "Resource": "arn:aws:secretsmanager:*:*:secret:/orchestrator/*"
          },
          {
              "Effect": "Allow",
              "Action": [
                  "rds:CreateDBInstance",
                  "rds:DeleteDBInstance",
                  "rds:ModifyDBInstance",
                  "rds:DescribeDBInstances",
                  "rds:CreateDBSubnetGroup",
                  "rds:DeleteDBSubnetGroup",
                  "rds:ModifyDBSubnetGroup",
                  "rds:AddTagsToResource"
              ],
              "Resource": "*"
          },
          {
              "Effect": "Allow",
              "Action": [
                  "logs:CreateLogGroup",
                  "logs:DeleteLogGroup",
                  "logs:PutRetentionPolicy"
              ],
              "Resource": "arn:aws:logs:*:*:log-group:*"
          },
          {
              "Effect": "Allow",
              "Action": [
                  "ec2:CreateSecurityGroup",
                  "ec2:DeleteSecurityGroup",
                  "ec2:AuthorizeSecurityGroupIngress",
                  "ec2:RevokeSecurityGroupIngress",
                  "ec2:CreateVpcEndpoint",
                  "ec2:DeleteVpcEndpoints",
                  "ec2:DescribeVpcEndpoints",
                  "ec2:DescribeSecurityGroups",
                  "ec2:DescribeNetworkInterfaces",
                  "ec2:CreateTags"
              ],
              "Resource": "*"
          }
      ]
   }
   ```
   3. Save the policy and name it
   4. Go to Users and create a new user called `TerraformDeployer`
   5. Attach the `RandAO-Provider-Admin` policy directly
   6. Create an access key for the user (choose CLI)
   7. Save the access key ID and secret access key for the next step

3. **Configure AWS Environment Variables**  
   Open a terminal and enter the following commands:
   ```bash
   export AWS_ACCESS_KEY_ID="your-access-key-id"
   export AWS_SECRET_ACCESS_KEY="your-secret-access-key"
   export AWS_REGION="your-region"  # e.g., us-east-1
   ```

4. **Set Up Terraform Variables**
   Navigate to the Terraform directory of the project:
   ```bash
   cp terraform.tfvars.example terraform.tfvars
   ```
   Edit the `terraform.tfvars` file and fill in all required variables:

   **Required Variables:**
   - `provider_id`: Your unique provider identifier
   - `local_db_user`: Database username
   - `local_db_password`: Database password
   - `local_wallet_json`: Wallet JSON (either direct or via file path)

   **Optional Variables (with defaults):**
   - `aws_region`: AWS region (default: us-east-1)
   - `db_name`: Database name (default: orchestrator_db)
   - `secrets_prefix`: Prefix for secrets (default: /orchestrator)

   The database configuration is highly suggested, and the secrets can be left at default values as they're just the names of the secrets.

5. **Initialize and Apply Terraform Configuration**
   Navigate to the Terraform directory of the project and run:
   ```bash
   terraform init
   terraform apply
   ```
   Type `yes` when prompted to confirm.

6. **Verify Deployment**
   Open the AWS console and navigate to the ECS console to view your running services.

## How It Works

This deployment creates the following AWS resources:

1. **ECS Cluster**: Runs the orchestrator service and puzzle generator jobs
2. **RDS**: PostgreSQL database for storing time lock puzzles and provider state
3. **Secrets Manager**: Securely stores database credentials and wallet information
4. **IAM**: Roles and policies for ECS tasks and secrets access
5. **CloudWatch**: Log groups for monitoring your provider

## Advantages of AWS Deployment

- **Cost Efficiency at Scale**: Most cost-effective for dedicated providers
- **Maximum Reliability**: AWS services offer SLAs for high availability
- **Automatic Scaling**: Resources scale based on demand
- **Managed Services**: AWS handles infrastructure maintenance
- **High Performance**: Optimized for speed and reliability

## Security Notes

- The `terraform.tfvars` file contains sensitive information and should never be committed to version control
- Add `terraform.tfvars` and `wallet.json` to your `.gitignore`
- In production, sensitive values are stored in AWS Secrets Manager
- Local development variables are only used for initial setup and testing

## Staking Process

After deployment, please open the AWS console and share the logs with Ethan to receive the tokens needed for staking. Follow the main documentation for the staking process.

---

[Return to Main Documentation](../README.md)
