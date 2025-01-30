# variables.tf

variable "aws_region" {
  description = "The AWS region to deploy resources in"
  type        = string
  default     = "us-east-1"
}

# Database Configuration
variable "db_name" {
  description = "The PostgreSQL database name"
  type        = string
  default     = "orchestrator_db"
}

# Secrets Manager Variables
variable "secrets_prefix" {
  description = "Prefix for secrets in AWS Secrets Manager"
  type        = string
  default     = "/orchestrator"
}

variable "db_credentials_secret_name" {
  description = "Name of the secret containing database credentials"
  type        = string
  default     = "db-credentials"
}

variable "wallet_secret_name" {
  description = "Name of the secret containing the wallet JSON"
  type        = string
  default     = "wallet-json"
}

# Provider Configuration
variable "provider_id" {
  description = "The unique identifier for this provider"
  type        = string
}

# Local Development Overrides (for testing only)
variable "local_db_user" {
  description = "Local PostgreSQL username (for development only)"
  type        = string
  default     = "myuser"
  sensitive   = true
}

variable "local_db_password" {
  description = "Local PostgreSQL password (for development only)"
  type        = string
  default     = "mypassword"
  sensitive   = true
}

variable "local_wallet_json" {
  description = "Local wallet JSON (for development only)"
  type        = string
  default     = "{\"dummy\":\"wallet\"}"
  sensitive   = true
}
