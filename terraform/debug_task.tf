# debug_task.tf

resource "aws_ecs_task_definition" "debug_task" {
  family                   = "debug-task"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = "512"
  memory                   = "1024"

  container_definitions = jsonencode([
    {
      name      = "debug-container"
      image     = "amazonlinux"
      essential = true
      command   = ["/bin/sh", "-c", "while true; do sleep 60; done"]
      environment = [
        { name = "DB_HOST", value = "postgres" },
        { name = "DB_PORT", value = "5432" },
        { name = "DB_USER", value = "myuser" },
        { name = "DB_PASSWORD", value = "mypassword" },
        { name = "DB_NAME", value = "mydatabase" }
      ],
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          awslogs-group         = "/ecs/debug-task"
          awslogs-region        = var.aws_region
          awslogs-stream-prefix = "debug-container"
        }
      }
    }
  ])

  execution_role_arn = aws_iam_role.execution_role.arn
  task_role_arn      = aws_iam_role.task_role.arn
}
