# posgress.tf - Corrected to use db_name for PostgreSQL in AWS RDS

resource "aws_db_instance" "postgres" {
  allocated_storage    = 20
  storage_type         = "gp2"
  engine               = "postgres"
  engine_version       = "13"
  instance_class       = "db.t3.micro"
  db_name              = var.db_name  # Corrected argument
  username             = var.db_user
  password             = var.db_password
  skip_final_snapshot  = true
  publicly_accessible  = true  # Ensure this matches your security needs
  db_subnet_group_name = aws_db_subnet_group.default.name
  vpc_security_group_ids = [data.aws_security_group.default.id]
}

resource "aws_db_subnet_group" "default" {
  name       = "postgres-subnet-group"
  subnet_ids = local.subnet_ids
  tags = {
    Name = "postgres-subnet-group"
  }
}
