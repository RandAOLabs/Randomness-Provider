# AWS Secrets Manager resources

# Database credentials secret
resource "aws_secretsmanager_secret" "db_credentials" {
  name        = "${var.secrets_prefix}/${var.db_credentials_secret_name}"
  description = "Database credentials for the orchestrator service"
}

resource "aws_secretsmanager_secret_version" "db_credentials" {
  secret_id = aws_secretsmanager_secret.db_credentials.id
  secret_string = jsonencode({
    username = var.local_db_user
    password = var.local_db_password
  })
}

# Wallet secret
resource "aws_secretsmanager_secret" "wallet" {
  name        = "${var.secrets_prefix}/${var.wallet_secret_name}"
  description = "Wallet JSON for the orchestrator service"
}

resource "aws_secretsmanager_secret_version" "wallet" {
  secret_id = aws_secretsmanager_secret.wallet.id
  secret_string = var.local_wallet_json
}

# IAM policy for ECS tasks to access secrets
data "aws_iam_policy_document" "secrets_access" {
  statement {
    effect = "Allow"
    actions = [
      "secretsmanager:GetSecretValue",
      "secretsmanager:DescribeSecret"
    ]
    resources = [
      aws_secretsmanager_secret.db_credentials.arn,
      aws_secretsmanager_secret.wallet.arn
    ]
  }
}

resource "aws_iam_policy" "secrets_access" {
  name        = "orchestrator-secrets-access"
  description = "Allow access to orchestrator secrets"
  policy      = data.aws_iam_policy_document.secrets_access.json
}

# Attach secrets policy to ECS task role
resource "aws_iam_role_policy_attachment" "ecs_task_secrets" {
  role       = aws_iam_role.ecs_task_role.name
  policy_arn = aws_iam_policy.secrets_access.arn
}
