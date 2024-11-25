# Get the default VPC
data "aws_vpc" "default" {
  default = true
}

# Fetch all subnets within the default VPC
data "aws_subnets" "default_vpc_subnets" {
  filter {
    name   = "vpc-id"
    values = [data.aws_vpc.default.id]
  }
}

# Use a local variable to store the subnet IDs
locals {
  subnet_ids = data.aws_subnets.default_vpc_subnets.ids
}

# Get the default security group within the VPC
data "aws_security_group" "default" {
  filter {
    name   = "vpc-id"
    values = [data.aws_vpc.default.id]
  }

  filter {
    name   = "group-name"
    values = ["default"]
  }
}
