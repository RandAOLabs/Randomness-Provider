# variables.tf

variable "aws_region" {
  description = "The AWS region to deploy resources in"
  type        = string
  default     = "us-east-1"
}

variable "db_user" {
  description = "The PostgreSQL username"
  type        = string
  default     = "myuser"
}

variable "db_password" {
  description = "The PostgreSQL password"
  type        = string
  default     = "mypassword"
}

variable "db_name" {
  description = "The PostgreSQL database name"
  type        = string
  default     = "mydatabase"
}
