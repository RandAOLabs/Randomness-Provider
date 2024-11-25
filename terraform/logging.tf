# logging.tf

resource "aws_cloudwatch_log_group" "ecs_orchestrator_service" {
  name              = "ecs-orchestrator-service"
  retention_in_days = 30  # Adjust retention as needed
}
