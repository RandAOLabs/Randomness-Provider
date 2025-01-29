# task_definitions.tf - Updated to Add VDF Job Task and Connect Orchestrator to RDS

resource "aws_ecs_task_definition" "orchestrator_service" {
  family                   = "orchestrator-service"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = "256"
  memory                   = "512"

container_definitions = jsonencode([{
  name      = "orchestrator"
  image     = "randao/orchestrator:v0.2.0"
  essential = true
  environment = [
    { name = "ENVIRONMENT", value = "cloud" },
    { name = "DB_HOST", value = aws_db_instance.postgres.address },
    { name = "DB_PORT", value = "5432" },
    { name = "DB_USER", value = var.db_user },
    { name = "DB_PASSWORD", value = var.db_password },
    { name = "DB_NAME", value = var.db_name },
    { name = "ECS_CLUSTER_NAME", value = aws_ecs_cluster.fargate_cluster.name },
    { name = "SUBNET_ID", value = local.subnet_ids[0] },           # First subnet from your VPC
    { name = "SECURITY_GROUP", value = data.aws_security_group.default.id }  # Default security group
  ]
  logConfiguration = {
    logDriver = "awslogs"
    options = {
      awslogs-group         = aws_cloudwatch_log_group.ecs_orchestrator_service.name
      awslogs-region        = var.aws_region
      awslogs-stream-prefix = "orchestrator"
    }
  }
}])



  execution_role_arn = aws_iam_role.execution_role.arn
  task_role_arn      = aws_iam_role.task_role.arn
}

resource "aws_ecs_task_definition" "vdf_job" {
  family                   = "vdf-job"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = "256"
  memory                   = "512"

container_definitions = jsonencode([{
  name      = "vdf_job_container"
  image     = "randao/vdf_job:v0.1.4"
  essential = true
  command   = ["python", "main.py"]  # Set the default command to run
  environment = [
    { name = "DB_HOST", value = aws_db_instance.postgres.address },
    { name = "DB_PORT", value = "5432" },
    { name = "DB_USER", value = var.db_user },
    { name = "DB_PASSWORD", value = var.db_password },
    { name = "DB_NAME", value = var.db_name }
  ]
  logConfiguration = {
    logDriver = "awslogs"
    options = {
      awslogs-group         = aws_cloudwatch_log_group.ecs_orchestrator_service.name
      awslogs-region        = var.aws_region
      awslogs-stream-prefix = "vdf-job"
    }
  }
}])


  execution_role_arn = aws_iam_role.execution_role.arn
  task_role_arn      = aws_iam_role.task_role.arn
}
