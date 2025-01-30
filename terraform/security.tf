# Security Groups

# Security group for ECS tasks
resource "aws_security_group" "ecs_tasks" {
  name        = "orchestrator-ecs-tasks-sg"
  description = "Security group for ECS tasks"
  vpc_id      = data.aws_vpc.default.id

  ingress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    self        = true
    description = "Allow all traffic between tasks"
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
    description = "Allow all outbound traffic"
  }

  tags = {
    Name = "orchestrator-ecs-tasks-sg"
  }
}

# Update references to use the new security group
locals {
  ecs_security_groups = [aws_security_group.ecs_tasks.id]
}
