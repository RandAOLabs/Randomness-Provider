# RDS PostgreSQL Instance

# Security group for RDS
resource "aws_security_group" "rds" {
  name        = "orchestrator-rds-sg"
  description = "Security group for RDS instance"
  vpc_id      = data.aws_vpc.default.id

  ingress {
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = local.ecs_security_groups
    description     = "Allow PostgreSQL access from ECS tasks"
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
    description = "Allow all outbound traffic"
  }

  tags = {
    Name = "orchestrator-rds-sg"
  }
}

# RDS subnet group
resource "aws_db_subnet_group" "orchestrator" {
  name       = "orchestrator-subnet-group"
  subnet_ids = local.subnet_ids

  tags = {
    Name = "Orchestrator DB subnet group"
  }
}

# RDS PostgreSQL Instance
resource "aws_db_instance" "orchestrator" {
  identifier           = "orchestrator-db"
  engine              = "postgres"
  engine_version      = "13"
  instance_class      = "db.t3.micro"
  allocated_storage   = 20
  storage_type        = "gp2"
  
  db_name             = var.db_name
  username            = var.local_db_user
  password            = var.local_db_password
  
  vpc_security_group_ids = [aws_security_group.rds.id]
  db_subnet_group_name   = aws_db_subnet_group.orchestrator.name
  
  skip_final_snapshot    = true
  publicly_accessible    = false
  
  backup_retention_period = 7
  backup_window          = "03:00-04:00"
  maintenance_window     = "Mon:04:00-Mon:05:00"
  
  tags = {
    Name = "orchestrator-db"
  }
}
