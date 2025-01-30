import AWS from 'aws-sdk';

export interface NetworkConfig {
  subnets: string[];
  securityGroups: string[];
}

export async function getNetworkConfig(ecs: AWS.ECS): Promise<NetworkConfig> {
  // Get the task definition to extract network configuration
  const taskDef = await ecs.describeTaskDefinition({ taskDefinition: 'vdf-job' }).promise();
  
  // Get the service to extract network configuration
  const services = await ecs.listServices({ cluster: process.env.ECS_CLUSTER_NAME }).promise();
  const serviceArn = services.serviceArns?.find(arn => arn.includes('vdf-job-service'));
  
  if (!serviceArn) {
    throw new Error('VDF job service not found');
  }
  
  const service = await ecs.describeServices({
    cluster: process.env.ECS_CLUSTER_NAME,
    services: [serviceArn]
  }).promise();

  const networkConfig = service.services?.[0]?.networkConfiguration?.awsvpcConfiguration;
  
  if (!networkConfig?.subnets || !networkConfig?.securityGroups) {
    throw new Error('Network configuration not found');
  }

  return {
    subnets: networkConfig.subnets,
    securityGroups: networkConfig.securityGroups
  };
}

export async function launchVDFTask(ecs: AWS.ECS, networkConfig: NetworkConfig): Promise<string | null> {
  const result = await ecs.runTask({
    cluster: process.env.ECS_CLUSTER_NAME,
    taskDefinition: 'vdf-job',
    capacityProviderStrategy: [
      {
        capacityProvider: 'FARGATE_SPOT',
        weight: 1
      }
    ],
    networkConfiguration: {
      awsvpcConfiguration: {
        subnets: networkConfig.subnets,
        securityGroups: networkConfig.securityGroups,
        assignPublicIp: 'ENABLED'
      }
    },
    count: 1
  }).promise();

  const taskArn = result.tasks?.[0]?.taskArn;
  return taskArn || null;
}
