# Configure AWS Provider
provider "aws" {
  region = var.aws_region
}

# Configure required providers
terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }

  required_version = ">= 1.2.0"
}
