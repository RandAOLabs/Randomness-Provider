# VPC Endpoints for AWS Services

# Use first subnet from local.subnet_ids
locals {
  endpoint_subnet_id = local.subnet_ids[0]
}

# Interface Endpoints
resource "aws_vpc_endpoint" "secretsmanager" {
  vpc_id             = data.aws_vpc.default.id
  service_name       = "com.amazonaws.${var.aws_region}.secretsmanager"
  vpc_endpoint_type  = "Interface"
  subnet_ids         = [local.endpoint_subnet_id]
  security_group_ids = [aws_security_group.vpc_endpoints.id]
  private_dns_enabled = true
  tags = {
    Name = "orchestrator-secretsmanager-endpoint"
  }
}

resource "aws_vpc_endpoint" "ecr_api" {
  vpc_id             = data.aws_vpc.default.id
  service_name       = "com.amazonaws.${var.aws_region}.ecr.api"
  vpc_endpoint_type  = "Interface"
  subnet_ids         = [local.endpoint_subnet_id]
  security_group_ids = [aws_security_group.vpc_endpoints.id]
  private_dns_enabled = true
  tags = {
    Name = "orchestrator-ecr-api-endpoint"
  }
}

resource "aws_vpc_endpoint" "ecr_dkr" {
  vpc_id             = data.aws_vpc.default.id
  service_name       = "com.amazonaws.${var.aws_region}.ecr.dkr"
  vpc_endpoint_type  = "Interface"
  subnet_ids         = [local.endpoint_subnet_id]
  security_group_ids = [aws_security_group.vpc_endpoints.id]
  private_dns_enabled = true
  tags = {
    Name = "orchestrator-ecr-dkr-endpoint"
  }
}

resource "aws_vpc_endpoint" "logs" {
  vpc_id             = data.aws_vpc.default.id
  service_name       = "com.amazonaws.${var.aws_region}.logs"
  vpc_endpoint_type  = "Interface"
  subnet_ids         = [local.endpoint_subnet_id]
  security_group_ids = [aws_security_group.vpc_endpoints.id]
  private_dns_enabled = true
  tags = {
    Name = "orchestrator-logs-endpoint"
  }
}

resource "aws_vpc_endpoint" "rds" {
  vpc_id             = data.aws_vpc.default.id
  service_name       = "com.amazonaws.${var.aws_region}.rds"
  vpc_endpoint_type  = "Interface"
  subnet_ids         = [local.endpoint_subnet_id]
  security_group_ids = [aws_security_group.vpc_endpoints.id]
  private_dns_enabled = true
  tags = {
    Name = "orchestrator-rds-endpoint"
  }
}

# Security group for VPC endpoints
resource "aws_security_group" "vpc_endpoints" {
  name        = "orchestrator-vpc-endpoints-sg"
  description = "Security group for VPC endpoints"
  vpc_id      = data.aws_vpc.default.id

  ingress {
    from_port       = 443
    to_port         = 443
    protocol        = "tcp"
    security_groups = local.ecs_security_groups
    description     = "Allow HTTPS from ECS tasks"
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
    description = "Allow all outbound traffic"
  }

  tags = {
    Name = "orchestrator-vpc-endpoints-sg"
  }
}

# Gateway Endpoints
resource "aws_vpc_endpoint" "s3" {
  vpc_id       = data.aws_vpc.default.id
  service_name = "com.amazonaws.${var.aws_region}.s3"
  vpc_endpoint_type = "Gateway"

  route_table_ids = [data.aws_route_table.default.id]

  tags = {
    Name = "orchestrator-s3-endpoint"
  }
}

# Get default route table
data "aws_route_table" "default" {
  vpc_id = data.aws_vpc.default.id
  filter {
    name   = "association.main"
    values = ["true"]
  }
}
