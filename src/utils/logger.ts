/**
 * Centralized logging utility that respects environment flags
 * 
 * Usage:
 * import { logger } from '../utils/logger';
 * logger.debug('Debug message');
 * logger.info('Info message');
 * logger.warn('Warning message');
 * logger.error('Error message');
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'none';

interface LoggerConfig {
  level: LogLevel;
  enableConsole: boolean;
  enablePersistence: boolean;
  maxLogEntries: number;
}

interface LogEntry {
  timestamp: Date;
  level: LogLevel;
  message: string;
  data?: unknown;
  source?: string;
}

class Logger {
  private config: LoggerConfig;
  private logBuffer: LogEntry[] = [];
  private readonly levelPriority: Record<LogLevel, number> = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3,
    none: 4
  };

  constructor() {
    // Default configuration based on environment
    const isDevelopment = import.meta.env.DEV;
    const isTest = import.meta.env.MODE === 'test';
    const isProduction = import.meta.env.PROD;
    
    this.config = {
      level: isDevelopment ? 'debug' : isProduction ? 'error' : 'warn', // Only errors in production
      enableConsole: isDevelopment || isTest, // No console output in production
      enablePersistence: isProduction, // Enable persistence in production for error tracking
      maxLogEntries: isProduction ? 5000 : 1000 // More entries in production
    };
  }

  /**
   * Update logger configuration
   */
  configure(config: Partial<LoggerConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Check if a log level should be processed
   */
  private shouldLog(level: LogLevel): boolean {
    return this.levelPriority[level] >= this.levelPriority[this.config.level];
  }

  /**
   * Sanitize data to prevent logging sensitive information
   */
  private sanitizeData(data: unknown): unknown {
    if (!data) return data;
    
    // Don't sanitize in development
    if (import.meta.env.DEV) return data;
    
    // In production, sanitize sensitive data
    if (typeof data === 'object') {
      const sanitized: Record<string, unknown> = { ...(data as Record<string, unknown>) };
      
      // Remove common sensitive fields
      const sensitiveFields = [
        'password', 'token', 'apiKey', 'secret', 'auth', 
        'authorization', 'sessionId', 'userId', 'email'
      ];
      
      sensitiveFields.forEach(field => {
        if (sanitized[field]) {
          sanitized[field] = '[REDACTED]';
        }
      });
      
      return sanitized;
    }
    
    return data;
  }

  /**
   * Check if logging should be throttled for performance
   */
  private shouldThrottle(message: string): boolean {
    // In production, throttle high-frequency messages
    if (!import.meta.env.PROD) return false;
    
    const highFrequencyPatterns = [
      /animation/, /frame/, /update/, /mouse/, /render/
    ];
    
    return highFrequencyPatterns.some(pattern => pattern.test(message.toLowerCase()));
  }

  /**
   * Core logging method
   */
  private log(level: LogLevel, message: string, data?: unknown, source?: string): void {
    if (!this.shouldLog(level)) {
      return;
    }

    // Check for throttling
    if (this.shouldThrottle(message)) {
      return;
    }

    const logEntry: LogEntry = {
      timestamp: new Date(),
      level,
      message,
      data: this.sanitizeData(data),
      source
    };

    // Add to buffer if persistence is enabled
    if (this.config.enablePersistence) {
      this.logBuffer.push(logEntry);
      if (this.logBuffer.length > this.config.maxLogEntries) {
        this.logBuffer.shift(); // Remove oldest entry
      }
    }

    // Console output
    if (this.config.enableConsole) {
      const prefix = `[${logEntry.timestamp.toISOString()}]${source ? ` [${source}]` : ''}`;
      const sanitizedData = logEntry.data;
      
      switch (level) {
        case 'debug':
          console.debug(prefix, message, sanitizedData || '');
          break;
        case 'info':
          console.info(prefix, message, sanitizedData || '');
          break;
        case 'warn':
          console.warn(prefix, message, sanitizedData || '');
          break;
        case 'error':
          console.error(prefix, message, sanitizedData || '');
          break;
      }
    }
  }

  /**
   * Debug level logging - only in development
   */
  debug(message: string, data?: unknown, source?: string): void {
    this.log('debug', message, data, source);
  }

  /**
   * Info level logging
   */
  info(message: string, data?: unknown, source?: string): void {
    this.log('info', message, data, source);
  }

  /**
   * Warning level logging
   */
  warn(message: string, data?: unknown, source?: string): void {
    this.log('warn', message, data, source);
  }

  /**
   * Error level logging
   */
  error(message: string, data?: unknown, source?: string): void {
    this.log('error', message, data, source);
  }

  /**
   * Convenience method for performance logging
   */
  perf(message: string, startTime?: number, source?: string): void {
    if (startTime) {
      const duration = performance.now() - startTime;
      this.debug(`${message} (${duration.toFixed(2)}ms)`, undefined, source);
    } else {
      this.debug(message, undefined, source);
    }
  }

  /**
   * Convenience method for API/network logging
   */
  api(message: string, data?: { url?: string; method?: string; status?: number; duration?: number }, source?: string): void {
    if (data?.status && data.status >= 400) {
      this.error(`API Error: ${message}`, data, source);
    } else {
      this.info(`API: ${message}`, data, source);
    }
  }

  /**
   * Convenience method for user action logging
   */
  userAction(action: string, data?: unknown, source?: string): void {
    this.info(`User: ${action}`, data, source);
  }

  /**
   * Get current log buffer (for debugging or error reporting)
   */
  getLogBuffer(): LogEntry[] {
    return [...this.logBuffer];
  }

  /**
   * Clear log buffer
   */
  clearBuffer(): void {
    this.logBuffer = [];
  }

  /**
   * Get current configuration
   */
  getConfig(): LoggerConfig {
    return { ...this.config };
  }
}

// Export singleton instance
export const logger = new Logger();

// Export type for external use
export type { LogEntry, LoggerConfig };
