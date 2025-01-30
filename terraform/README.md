#### Steps to Deploy:
1. **Install Terraform:**  
   Follow the [official Terraform installation guide](https://developer.hashicorp.com/terraform/tutorials/aws-get-started/install-cli).

2. **Log into AWS and set up IAM user and Policy**
   Go To IAM and create a new policy called RandAO-Provider-Admin
   Paste this in the JSON
   ```{
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
                "ecs:PutClusterCapacityProviders"
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
                "rds:ModifyDBSubnetGroup"
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
            "Resource": "arn:aws:logs:*:*:log-group:/ecs/*"
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
                "ec2:DescribeNetworkInterfaces"
            ],
            "Resource": "*"
        }
    ]
}```
   Save the JSON and name it
   Click on Users and create a new user called TeraformDeployer
   Attach this new policy directly
   Save the User
   Click on the user and go to the Security Credentials tab
   Create an access key and choose CLI
   Save the variables for the next step
   
3. **Configure AWS Environment Variables:**  
   Open a terminal and enter the following commands:
   ```bash
   export AWS_ACCESS_KEY_ID="your-access-key-id"
   export AWS_SECRET_ACCESS_KEY="your-secret-access-key"
   export AWS_REGION="your-region"  # e.g., us-east-1
   ```

3. **Initialize and Apply Terraform Configuration:**
   Navigate to the Terraform directory of the project and run:
   ```bash
   terraform init
   terraform apply
   ```
   Type `yes` when prompted to confirm.

This setup ensures your node is deployed with the highest uptime and optimal performance.


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


[Main docs](../README.md)