# outputs.tf

output "postgres_endpoint" {
  value = aws_db_instance.postgres.address
}
