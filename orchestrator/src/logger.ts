import fs from 'fs';
import path from 'path';

// Enum for different log levels
export enum LogLevel {
    SILENT = 0,   // No logging
    ERROR = 1,    // Only errors
    WARN = 2,     // Errors and warnings
    INFO = 3,     // Normal operational logs (default)
    DEBUG = 4,    // More detailed information
    VERBOSE = 5   // Everything including detailed debugging
}

// Log level names for better readability
const LogLevelNames: Record<LogLevel, string> = {
    [LogLevel.SILENT]: 'SILENT',
    [LogLevel.ERROR]: 'ERROR',
    [LogLevel.WARN]: 'WARN',
    [LogLevel.INFO]: 'INFO',
    [LogLevel.DEBUG]: 'DEBUG',
    [LogLevel.VERBOSE]: 'VERBOSE'
};

export interface LoggerConfig {
    consoleLogLevel: LogLevel;
    fileLogLevel: LogLevel;
    logFilePath: string;
    maxLogFileSizeBytes: number;
    rotateLogFiles: boolean;
    maxLogFiles: number;
}

export class Logger {
    private static instance: Logger;
    private config: LoggerConfig;
    private logStream: fs.WriteStream | null = null;

    private constructor(config: LoggerConfig) {
        this.config = config;
        this.setupLogStream();
        this.logToFile(LogLevel.INFO, `Logger initialized with console level: ${LogLevelNames[config.consoleLogLevel]}, file level: ${LogLevelNames[config.fileLogLevel]}`);
    }

    private setupLogStream(): void {
        try {
            // Create directory if it doesn't exist
            const logDir = path.dirname(this.config.logFilePath);
            if (!fs.existsSync(logDir)) {
                fs.mkdirSync(logDir, { recursive: true });
            }

            // Check if file exists and needs rotation
            if (this.config.rotateLogFiles && fs.existsSync(this.config.logFilePath)) {
                const stats = fs.statSync(this.config.logFilePath);
                if (stats.size >= this.config.maxLogFileSizeBytes) {
                    this.rotateLogFiles();
                }
            }

            // Create or open the log file
            this.logStream = fs.createWriteStream(this.config.logFilePath, { flags: 'a' });
            
            // Handle errors on the stream
            this.logStream.on('error', (err) => {
                console.error(`Error writing to log file: ${err}`);
            });
        } catch (error) {
            console.error(`Failed to setup log file: ${error}`);
        }
    }

    private rotateLogFiles(): void {
        try {
            for (let i = this.config.maxLogFiles - 1; i > 0; i--) {
                const oldFile = `${this.config.logFilePath}.${i - 1}`;
                const newFile = `${this.config.logFilePath}.${i}`;
                
                if (fs.existsSync(oldFile)) {
                    if (fs.existsSync(newFile)) {
                        fs.unlinkSync(newFile);
                    }
                    fs.renameSync(oldFile, newFile);
                }
            }
            
            const oldestFile = `${this.config.logFilePath}.0`;
            if (fs.existsSync(this.config.logFilePath)) {
                if (fs.existsSync(oldestFile)) {
                    fs.unlinkSync(oldestFile);
                }
                fs.renameSync(this.config.logFilePath, oldestFile);
            }
        } catch (error) {
            console.error(`Failed to rotate log files: ${error}`);
        }
    }

    private formatLogEntry(level: LogLevel, message: string, ...args: any[]): string {
        const timestamp = new Date().toISOString();
        const levelName = LogLevelNames[level];
        
        // Format any objects in the args array
        const formattedArgs = args.map(arg => {
            if (typeof arg === 'object' && arg !== null) {
                try {
                    return JSON.stringify(arg);
                } catch (e) {
                    return String(arg);
                }
            }
            return String(arg);
        });
        
        return `[${timestamp}] [${levelName}] ${message} ${formattedArgs.join(' ')}`.trim();
    }

    private logToConsole(level: LogLevel, message: string, ...args: any[]): void {
        if (level <= this.config.consoleLogLevel) {
            const formattedMessage = this.formatLogEntry(level, message, ...args);
            
            switch (level) {
                case LogLevel.ERROR:
                    console.error(formattedMessage);
                    break;
                case LogLevel.WARN:
                    console.warn(formattedMessage);
                    break;
                default:
                    console.log(formattedMessage);
                    break;
            }
        }
    }

    private logToFile(level: LogLevel, message: string, ...args: any[]): void {
        if (this.logStream && level <= this.config.fileLogLevel) {
            try {
                const formattedMessage = this.formatLogEntry(level, message, ...args);
                this.logStream.write(formattedMessage + '\n');
            } catch (error) {
                console.error(`Failed to write to log file: ${error}`);
            }
        }
    }

    public log(level: LogLevel, message: string, ...args: any[]): void {
        this.logToConsole(level, message, ...args);
        this.logToFile(level, message, ...args);
    }

    public error(message: string, ...args: any[]): void {
        this.log(LogLevel.ERROR, message, ...args);
    }

    public warn(message: string, ...args: any[]): void {
        this.log(LogLevel.WARN, message, ...args);
    }

    public info(message: string, ...args: any[]): void {
        this.log(LogLevel.INFO, message, ...args);
    }

    public debug(message: string, ...args: any[]): void {
        this.log(LogLevel.DEBUG, message, ...args);
    }

    public verbose(message: string, ...args: any[]): void {
        this.log(LogLevel.VERBOSE, message, ...args);
    }

    // Static methods for singleton pattern
    public static getInstance(): Logger {
        if (!Logger.instance) {
            Logger.initialize();
        }
        return Logger.instance;
    }

    public static initialize(config?: Partial<LoggerConfig>): Logger {
        // Default configuration
        const defaultConfig: LoggerConfig = {
            consoleLogLevel: this.parseLogLevel(process.env.LOG_CONSOLE_LEVEL) || LogLevel.INFO,
            fileLogLevel: this.parseLogLevel(process.env.LOG_FILE_LEVEL) || LogLevel.VERBOSE,
            logFilePath: process.env.LOG_FILE_PATH || path.join(process.cwd(), 'logs', 'orchestrator.log'),
            maxLogFileSizeBytes: parseInt(process.env.LOG_MAX_SIZE || '10485760', 10), // 10MB default
            rotateLogFiles: process.env.LOG_ROTATE === 'true',
            maxLogFiles: parseInt(process.env.LOG_MAX_FILES || '5', 10)
        };

        // Merge with provided configuration
        const mergedConfig = { ...defaultConfig, ...config };
        
        if (Logger.instance) {
            // Update configuration if instance already exists
            Logger.instance.config = mergedConfig;
            Logger.instance.logStream?.end();
            Logger.instance.setupLogStream();
        } else {
            Logger.instance = new Logger(mergedConfig);
        }
        
        return Logger.instance;
    }

    // Utility to parse log level from string
    private static parseLogLevel(level?: string): LogLevel | undefined {
        if (!level) return undefined;
        
        // Try to parse numeric value
        const numericLevel = parseInt(level, 10);
        if (!isNaN(numericLevel) && numericLevel >= 0 && numericLevel <= 5) {
            return numericLevel as LogLevel;
        }
        
        // Parse string values
        switch (level.toUpperCase()) {
            case 'SILENT': return LogLevel.SILENT;
            case 'ERROR': return LogLevel.ERROR;
            case 'WARN': return LogLevel.WARN;
            case 'INFO': return LogLevel.INFO;
            case 'DEBUG': return LogLevel.DEBUG;
            case 'VERBOSE': return LogLevel.VERBOSE;
            default: return undefined;
        }
    }

    // Helper to update log level dynamically
    public static setLogLevel(consoleLevel?: LogLevel, fileLevel?: LogLevel): void {
        const instance = Logger.getInstance();
        if (consoleLevel !== undefined) {
            instance.config.consoleLogLevel = consoleLevel;
        }
        if (fileLevel !== undefined) {
            instance.config.fileLogLevel = fileLevel;
        }
    }

    // Close logger (for graceful shutdown)
    public static close(): Promise<void> {
        return new Promise((resolve) => {
            if (Logger.instance && Logger.instance.logStream) {
                Logger.instance.logStream.end(() => {
                    Logger.instance.logStream = null;
                    resolve();
                });
            } else {
                resolve();
            }
        });
    }
}

// Export default instance for convenience
export default Logger.getInstance();
