import os from 'os';
import fs from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';
import crypto from 'crypto';
import logger from './logger';
import { MonitoringData, PerformanceMetrics, SystemSpecs, ExecutionMetrics, HealthStatus } from 'ao-js-sdk';
import { VERSION, NETWORK_IP, NETWORK_MODE } from './app';

const execAsync = promisify(exec);

// Moving averages for each step
interface StepTimings {
  step1: number;
  step2: number;
  step3: number;
  step4: number;
  overall: number;
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
  private errorTimestamps: number[] = []; // store Unix timestamps
  
  // Network monitoring properties
  private static previousNetworkBytes = { rx: 0, tx: 0 };
  private static lastCheckTime = Date.now();

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
      // Fallback to a null entry for those who care
      return '0000000000000000';
    }
  }

  private async updateNetworkStats(): Promise<{ rx_sec: number; tx_sec: number }> {
    try {
      // Store current and previous bytes for rate calculation
      const currentBytes = {
        rx: 0,
        tx: 0
      };
      
      // Initialize network stats with default values
      const networkStats: { rx_sec: number; tx_sec: number } = {
        rx_sec: 0,
        tx_sec: 0
      };
      
      if (process.platform === 'linux') {
        // Linux - read from /proc/net/dev
        const netDev = await fs.promises.readFile('/proc/net/dev', 'utf8');
        const interfaces = netDev.split('\n').filter(line =>
          line.includes(':') && !line.includes('lo:')
        );

        for (const intf of interfaces) {
          const parts = intf.trim().split(/\s+/);
          currentBytes.rx += parseInt(parts[1] || '0', 10);
          currentBytes.tx += parseInt(parts[9] || '0', 10);
        }
      } else if (process.platform === 'win32') {
        // Windows - use PowerShell to get network stats
        const { stdout } = await execAsync(
          'powershell "Get-NetAdapterStatistics | Select-Object ReceivedBytes,SentBytes | ConvertTo-Json"'
        );

        try {
          const stats = JSON.parse(stdout);
          const adapters = Array.isArray(stats) ? stats : [stats];
          for (const adapter of adapters) {
            currentBytes.rx += adapter.ReceivedBytes || 0;
            currentBytes.tx += adapter.SentBytes || 0;
          }
        } catch (e) {
          logger.error('Failed to parse network stats:', e);
        }
      }
      
      // Calculate rates in bytes per second
      const now = Date.now();
      const timeDiffSeconds = (now - MonitoringService.lastCheckTime) / 1000;
      
      if (timeDiffSeconds > 0 && MonitoringService.previousNetworkBytes.rx > 0) {
        // Calculate rates only if we have previous measurements
        networkStats.rx_sec = Math.max(0, (currentBytes.rx - MonitoringService.previousNetworkBytes.rx) / timeDiffSeconds);
        networkStats.tx_sec = Math.max(0, (currentBytes.tx - MonitoringService.previousNetworkBytes.tx) / timeDiffSeconds);
      }
      
      // Store current values for next calculation
      MonitoringService.previousNetworkBytes = { ...currentBytes };
      MonitoringService.lastCheckTime = now;

      return networkStats;
    } catch (error) {
      logger.error('Error getting network stats:', error);
      return {
        rx_sec: 0,
        tx_sec: 0
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
    const now = Date.now();
    this.errorTimestamps.push(now);
  }
  
  private countErrorsSince(msAgo: number): number {
    const cutoff = Date.now() - msAgo;
    return this.errorTimestamps.filter(ts => ts >= cutoff).length;
  }
  
  private cleanupOldErrors(): void {
    const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
    this.errorTimestamps = this.errorTimestamps.filter(ts => ts >= oneDayAgo);
  }

  public async getMonitoringData(): Promise<MonitoringData> {
    // Get real-time system metrics
    const cpuInfo = os.cpus();
    const loadAvg = os.loadavg();
    const totalMemory = os.totalmem();
    const freeMemory = os.freemem();
    const usedMemoryPercent = Math.round((1 - freeMemory / totalMemory) * 100);

    // Get disk info - only used percent
    let diskUsedPercent = 0;

    try {
      // Cleanup old errors to reduce memory
      this.cleanupOldErrors();

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

    // Create the SystemSpecs object
    const systemSpecs: SystemSpecs = {
      arch: os.arch(),
      uptime: os.uptime(),
      cpuCount: cpuInfo.length,
      memoryTotalBytes: totalMemory,
      token: this.machineId
    };

    // Create the PerformanceMetrics object
    const performance: PerformanceMetrics = {
      loadAverage: loadAvg,
      memoryUsedPercent: usedMemoryPercent,
      diskUsedPercent: diskUsedPercent,
      network: networkStats
    };

    // Create the ExecutionMetrics object
    const executionMetrics: ExecutionMetrics = {
      stepTimingsMs: this.stepTimings as unknown as Record<string, number>
    };

    // Create the HealthStatus object
    const health: HealthStatus = {
      errorTotal: this.errorCount,
      errorsLastHour: this.countErrorsSince(60 * 60 * 1000),
      errorsLastDay: this.countErrorsSince(24 * 60 * 60 * 1000),
      status: this.countErrorsSince(60 * 60 * 1000) > 10 ? "degraded" : "healthy"
    };

    // Construct the full MonitoringData object
    const monitoringData: MonitoringData = {
      providerVersion: VERSION,
      timestamp: new Date().toISOString(),
      systemSpecs,
      performance,
      executionMetrics,
      health
    };

    // Add optional network monitoring variables if present TODO ADD THESE IN THE MONITORING DATA
    if (NETWORK_IP) {
      (monitoringData as any).networkIp = NETWORK_IP;
    }
    if (NETWORK_MODE) {
      (monitoringData as any).networkMode = NETWORK_MODE;
    }

    return monitoringData;
  }
}

// Export a singleton instance
export const monitoring = MonitoringService.getInstance();
