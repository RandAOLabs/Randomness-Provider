# ecs_service.tf - Updated to Only Deploy Orchestrator Service

resource "aws_ecs_service" "orchestrator_service" {
  name            = "orchestrator-service"
  cluster         = aws_ecs_cluster.fargate_cluster.id
  task_definition = aws_ecs_task_definition.orchestrator_service.arn
  desired_count   = 1
  launch_type     = "FARGATE"

  network_configuration {
    subnets         = local.subnet_ids
    security_groups = [data.aws_security_group.default.id]
    assign_public_ip = true
  }
}

resource "aws_ecs_service" "vdf_job_service" {
  name            = "vdf-job-service"
  cluster         = aws_ecs_cluster.fargate_cluster.id
  task_definition = aws_ecs_task_definition.vdf_job.arn
  desired_count   = 0

  capacity_provider_strategy {
    capacity_provider = "FARGATE_SPOT"
    weight            = 1
  }

  network_configuration {
    subnets         = local.subnet_ids
    security_groups = [data.aws_security_group.default.id]
    assign_public_ip = true
  }
}


