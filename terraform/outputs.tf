# outputs.tf

# Outputs for resource information

output "database_endpoint" {
  description = "The connection endpoint for the RDS instance"
  value       = aws_db_instance.orchestrator.endpoint
}

output "orchestrator_service_name" {
  description = "The name of the ECS service running the orchestrator"
  value       = aws_ecs_service.orchestrator_service.name
}

output "cloudwatch_log_group" {
  description = "The CloudWatch log group for the orchestrator service"
  value       = aws_cloudwatch_log_group.orchestrator.name
}
