# ECS Cluster and Services
resource "aws_ecs_cluster" "fargate_cluster" {
  name = "orchestrator-cluster"
}

resource "aws_ecs_cluster_capacity_providers" "fargate_providers" {
  cluster_name = aws_ecs_cluster.fargate_cluster.name

  capacity_providers = ["FARGATE", "FARGATE_SPOT"]

  default_capacity_provider_strategy {
    base              = 1
    weight            = 100
    capacity_provider = "FARGATE_SPOT"
  }
}

# Orchestrator Service
resource "aws_ecs_service" "orchestrator_service" {
  name            = "orchestrator-service"
  cluster         = aws_ecs_cluster.fargate_cluster.id
  task_definition = aws_ecs_task_definition.orchestrator_service.arn
  desired_count   = 1
  launch_type     = "FARGATE"

  network_configuration {
    subnets         = local.subnet_ids
    security_groups = local.ecs_security_groups
    assign_public_ip = true
  }
}

# VDF Job Service
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
    security_groups = local.ecs_security_groups
    assign_public_ip = true
  }
}

# Task Definitions
resource "aws_ecs_task_definition" "orchestrator_service" {
  family                   = "orchestrator-service"
  network_mode            = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                     = "512"
  memory                  = "1024"
  execution_role_arn      = aws_iam_role.ecs_execution_role.arn
  task_role_arn           = aws_iam_role.ecs_task_role.arn

  container_definitions = jsonencode([
    {
      name  = "orchestrator"
      image = "randao/orchestrator:v0.4.55"
      environment = [
        {
          name  = "ENVIRONMENT"
          value = "cloud"
        },
        {
          name  = "PROVIDER_ID"
          value = var.provider_id
        },
        {
          name  = "DB_HOST"
          value = split(":", aws_db_instance.orchestrator.endpoint)[0]
        },
        {
          name  = "DB_PORT"
          value = "5432"
        },
        {
          name  = "DB_NAME"
          value = var.db_name
        },
        {
          name  = "MAX_RETRIES"
          value = "10"
        },
        {
          name  = "RETRY_DELAY_MS"
          value = "10000"
        },
        {
          name  = "PGCONNECT_TIMEOUT"
          value = "30"
        },
        {
          name  = "AWS_REGION"
          value = var.aws_region
        },
        {
          name  = "ECS_CLUSTER_NAME"
          value = aws_ecs_cluster.fargate_cluster.name
        }
      ]
      secrets = [
        {
          name      = "DB_USER"
          valueFrom = "${aws_secretsmanager_secret.db_credentials.arn}:username::"
        },
        {
          name      = "DB_PASSWORD"
          valueFrom = "${aws_secretsmanager_secret.db_credentials.arn}:password::"
        },
        {
          name      = "WALLET_JSON"
          valueFrom = aws_secretsmanager_secret.wallet.arn
        }
      ]
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          awslogs-group         = "/ecs/orchestrator"
          awslogs-region        = var.aws_region
          awslogs-stream-prefix = "orchestrator"
        }
      }
    }
  ])
}

# VDF Task Definition
resource "aws_ecs_task_definition" "vdf_job" {
  family                   = "vdf-job"
  network_mode            = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                     = "2048"  # 2 vCPU
  memory                  = "4096"  # 4GB
  execution_role_arn      = aws_iam_role.ecs_execution_role.arn
  task_role_arn           = aws_iam_role.ecs_task_role.arn

  container_definitions = jsonencode([
    {
      name  = "vdf_job_container"
      image = "randao/puzzle-gen:v0.1.1"
      command = ["python", "main.py"],
      environment = [
        {
          name  = "DATABASE_TYPE"
          value = "postgresql"
        },
        {
          name  = "DATABASE_HOST"
          value = split(":", aws_db_instance.orchestrator.endpoint)[0]
        },
        {
          name  = "DATABASE_PORT"
          value = "5432"
        },
        {
          name  = "DATABASE_NAME"
          value = var.db_name
        }
      ]
      secrets = [
        {
          name      = "DATABASE_USER"
          valueFrom = "${aws_secretsmanager_secret.db_credentials.arn}:username::"
        },
        {
          name      = "DATABASE_PASSWORD"
          valueFrom = "${aws_secretsmanager_secret.db_credentials.arn}:password::"
        }
      ]
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          awslogs-group         = "/ecs/vdf-job"
          awslogs-region        = var.aws_region
          awslogs-stream-prefix = "vdf"
        }
      }
    }
  ])
}

# IAM Roles
resource "aws_iam_role" "ecs_execution_role" {
  name = "orchestrator-ecs-execution-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "ecs-tasks.amazonaws.com"
        }
      }
    ]
  })
}

resource "aws_iam_role" "ecs_task_role" {
  name = "orchestrator-ecs-task-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "ecs-tasks.amazonaws.com"
        }
      }
    ]
  })
}

# Attach AWS managed policy for ECS task execution
resource "aws_iam_role_policy_attachment" "ecs_task_execution_role_policy" {
  role       = aws_iam_role.ecs_execution_role.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

# Add ECS permissions to task role
resource "aws_iam_role_policy" "ecs_task_permissions" {
  name = "orchestrator-ecs-permissions"
  role = aws_iam_role.ecs_task_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "ecs:RunTask",
          "ecs:StopTask",
          "ecs:DescribeTasks",
          "ecs:ListTasks",
          "ecs:DescribeTaskDefinition",
          "ecs:ListTaskDefinitions",
          "ecs:DescribeServices",
          "ecs:ListServices",
          "ecs:DescribeClusters",
          "ecs:ListClusters",
          "iam:PassRole"
        ]
        Resource = "*"
      }
    ]
  })
}

# Add networking permissions to task role
resource "aws_iam_role_policy" "ecs_task_networking_policy" {
  name = "orchestrator-networking-policy"
  role = aws_iam_role.ecs_task_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "ec2:DescribeNetworkInterfaces",
          "ec2:CreateNetworkInterface",
          "ec2:DeleteNetworkInterface",
          "ec2:DescribeInstances",
          "ec2:AttachNetworkInterface"
        ]
        Resource = ["*"]
      }
    ]
  })
}

# Add Secrets Manager access to execution role
resource "aws_iam_role_policy" "ecs_execution_secrets_policy" {
  name = "orchestrator-secrets-access"
  role = aws_iam_role.ecs_execution_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "secretsmanager:GetSecretValue",
          "secretsmanager:DescribeSecret",
          "kms:Decrypt"
        ]
        Resource = [
          aws_secretsmanager_secret.db_credentials.arn,
          aws_secretsmanager_secret.wallet.arn
        ]
      }
    ]
  })
}

# CloudWatch Log Groups
resource "aws_cloudwatch_log_group" "orchestrator" {
  name              = "/ecs/orchestrator"
  retention_in_days = 30
}

resource "aws_cloudwatch_log_group" "vdf" {
  name              = "/ecs/vdf-job"
  retention_in_days = 30
}
