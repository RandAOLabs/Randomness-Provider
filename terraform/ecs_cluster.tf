# ecs_cluster.tf
resource "aws_ecs_cluster" "fargate_cluster" {
  name = "fargate-cluster"
}

# Configure the Capacity Providers for the ECS Cluster
resource "aws_ecs_cluster_capacity_providers" "fargate_cluster_capacity" {
  cluster_name = aws_ecs_cluster.fargate_cluster.name

  capacity_providers = ["FARGATE", "FARGATE_SPOT"]

  default_capacity_provider_strategy {
    capacity_provider = "FARGATE_SPOT"
    weight            = 1
  }
}
