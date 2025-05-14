import os from 'os';
import fs from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';
import crypto from 'crypto';
import { version } from '../package.json';
import logger from './logger';

const execAsync = promisify(exec);

// Moving averages for each step
interface StepTimings {
  step1: number;
  step2: number;
  step3: number;
  step4: number;
  overall: number;
}

// Performance counters
interface NetworkCounters {
  rxBytes: number;
  txBytes: number;
  rxPackets: number;
  txPackets: number;
}

// Class to manage all monitoring data
export class MonitoringService {
  private static instance: MonitoringService;
  private machineId: string;
  
  // Metrics tracking
  private stepTimings: StepTimings = {
    step1: 0,
    step2: 0,
    step3: 0,
    step4: 0,
    overall: 0
  };
  
  private totalStepSamples: { [key: string]: number } = {
    step1: 0,
    step2: 0,
    step3: 0,
    step4: 0,
    overall: 0
  };
  
  private errorCount: number = 0;
  private previousNetworkStats: NetworkCounters | null = null;
  
  private constructor() {
    this.machineId = this.generateMachineId();
    
    // Initialize network stats
    this.updateNetworkStats().catch(err => 
      logger.error('Failed to initialize network stats:', err)
    );
  }
  
  public static getInstance(): MonitoringService {
    if (!MonitoringService.instance) {
      MonitoringService.instance = new MonitoringService();
    }
    return MonitoringService.instance;
  }
  
  private generateMachineId(): string {
    try {
      // Using stable hardware identifiers that won't change between restarts
      // but will be unique to physical/virtual machines
      
      // Get CPU information which is generally the same across containers on same host
      const cpuModel = os.cpus()[0]?.model || '';
      const cpuSpeed = os.cpus()[0]?.speed || 0;
      const totalCores = os.cpus().length;
      
      // System memory size is usually fixed for a machine
      const totalMemory = os.totalmem();
      
      // Combine all available identifiers with more hardware specs
      const hwInfo = `${cpuModel}-${cpuSpeed}-${totalCores}-${totalMemory}-${os.platform()}-${os.arch()}`;
      
      // Generate a shorter hash (first 16 chars of SHA-256) for easier identification while maintaining uniqueness
      return crypto.createHash('sha256').update(hwInfo).digest('hex').substring(0, 16);
    } catch (error) {
      logger.error('Error generating machine ID:', error);
      // Fallback to a less reliable but still somewhat useful ID
      return crypto.createHash('sha256').update(os.hostname() + os.platform()).digest('hex').substring(0, 16);
    }
  }
  
  private async updateNetworkStats(): Promise<NetworkCounters> {
    try {
      let networkStats: NetworkCounters = {
        rxBytes: 0,
        txBytes: 0,
        rxPackets: 0,
        txPackets: 0
      };
      
      if (process.platform === 'linux') {
        // Linux - read from /proc/net/dev
        const netDev = await fs.promises.readFile('/proc/net/dev', 'utf8');
        const interfaces = netDev.split('\n').filter(line => 
          line.includes(':') && !line.includes('lo:')
        );
        
        for (const intf of interfaces) {
          const parts = intf.trim().split(/\s+/);
          networkStats.rxBytes += parseInt(parts[1] || '0', 10);
          networkStats.rxPackets += parseInt(parts[2] || '0', 10);
          networkStats.txBytes += parseInt(parts[9] || '0', 10);
          networkStats.txPackets += parseInt(parts[10] || '0', 10);
        }
      } else if (process.platform === 'win32') {
        // Windows - use PowerShell to get network stats
        const { stdout } = await execAsync(
          'powershell "Get-NetAdapterStatistics | Select-Object ReceivedBytes,ReceivedPackets,SentBytes,SentPackets | ConvertTo-Json"'
        );
        
        try {
          const stats = JSON.parse(stdout);
          const adapters = Array.isArray(stats) ? stats : [stats];
          for (const adapter of adapters) {
            networkStats.rxBytes += adapter.ReceivedBytes || 0;
            networkStats.rxPackets += adapter.ReceivedPackets || 0;
            networkStats.txBytes += adapter.SentBytes || 0;
            networkStats.txPackets += adapter.SentPackets || 0;
          }
        } catch (e) {
          logger.error('Failed to parse network stats:', e);
        }
      }
      
      this.previousNetworkStats = networkStats;
      return networkStats;
    } catch (error) {
      logger.error('Error getting network stats:', error);
      return {
        rxBytes: 0,
        txBytes: 0,
        rxPackets: 0,
        txPackets: 0
      };
    }
  }
  
  public updateStepTiming(step: string, timeTaken: number): void {
    if (step in this.stepTimings) {
      // Calculate running average
      const currentSamples = this.totalStepSamples[step];
      const currentAvg = this.stepTimings[step as keyof StepTimings];
      
      // Update running average
      this.stepTimings[step as keyof StepTimings] = 
        (currentAvg * currentSamples + timeTaken) / (currentSamples + 1);
      this.totalStepSamples[step]++;
    }
  }
  
  public incrementErrorCount(): void {
    this.errorCount++;
  }
  
  public async getMonitoringData(): Promise<string> {
    // Get real-time system metrics
    const cpuInfo = os.cpus();
    const loadAvg = os.loadavg();
    const totalMemory = os.totalmem();
    const freeMemory = os.freemem();
    const usedMemoryPercent = Math.round((1 - freeMemory / totalMemory) * 100);
    
    // Get disk info - only used percent
    let diskUsedPercent = 0;
    
    try {
      if (process.platform === 'linux') {
        const { stdout } = await execAsync('df -h / --output=pcent');
        const lines = stdout.trim().split('\n');
        if (lines.length > 1) {
          diskUsedPercent = parseInt(lines[1].trim().replace('%', ''), 10);
        }
      } else if (process.platform === 'win32') {
        const { stdout } = await execAsync(
          'powershell "Get-Volume | Where-Object {$_.DriveLetter -eq \'C\'} | Select-Object @{Name=\'UsedPercent\';Expression={100 - (($_.SizeRemaining / $_.Size) * 100)}} | ConvertTo-Json"'
        );
        
        try {
          const diskData = JSON.parse(stdout);
          diskUsedPercent = Math.round(diskData.UsedPercent || 0);
        } catch (e) {
          logger.error('Failed to parse disk info:', e);
        }
      }
    } catch (error) {
      logger.error('Error getting disk info:', error);
    }
    
    // Get updated network stats
    const networkStats = await this.updateNetworkStats();
    
    // Construct monitoring data object
    const monitoringData = {
      providerVersion: version,
      
      systemSpecs: {
        arch: os.arch(),
        cpuCount: cpuInfo.length,
        memoryTotalBytes: totalMemory,
        token: this.machineId
      },
      
      performance: {
        loadAverage: loadAvg,
        memoryUsedPercent: usedMemoryPercent,
        diskUsedPercent: diskUsedPercent,
        network: networkStats
      },
      
      executionMetrics: {
        stepTimingsMs: this.stepTimings
      },
      
      health: {
        errors: this.errorCount,
        status: this.errorCount > 10 ? "degraded" : "healthy"
      }
    };
    
    return JSON.stringify(monitoringData);
  }
}

// Export a singleton instance
export const monitoring = MonitoringService.getInstance();
