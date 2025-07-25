import path from 'path';
import fs from 'fs/promises';
import { LogWriter } from './LogWriter';
import { TraceContext } from './TraceContext';
import type { IStrategyLogger } from '../../types/logging';
import { LogLevel } from '../../types/logging';

/**
 * 策略实例专用日志器
 * 实现实例级别的操作/监控分离和独立管理
 */
export class StrategyLogger implements IStrategyLogger {
    private instanceId: string;
    private operationWriter: LogWriter;
    private monitoringWriter: LogWriter;
    private isActive = true;
    private logDirectory: string;

    constructor(
        instanceId: string,
        config: {
            maxFileSize: number;
            maxFiles: number;
            logDirectory: string;
        }
    ) {
        this.instanceId = instanceId;
        this.logDirectory = config.logDirectory;

        // 🔧 修复：创建实例专用的日志目录，确保路径正确
        const instanceLogDir = path.join(config.logDirectory, 'strategies', `instance-${instanceId}`);

        // 🔧 修复：为操作和监控分别创建写入器 - 使用实例目录作为基础
        this.operationWriter = new LogWriter({
            ...config,
            logDirectory: path.join(instanceLogDir, 'operations')
        });

        this.monitoringWriter = new LogWriter({
            ...config,
            logDirectory: path.join(instanceLogDir, 'monitoring')
        });

        // 策略实例启动时清理旧日志（如需要）
        this.cleanupOldLogs();
    }

    /**
     * 🔧 新增：确保策略实例目录结构存在
     */
    private async ensureInstanceDirectories(): Promise<void> {
        const instanceLogDir = path.join(this.logDirectory, 'strategies', `instance-${this.instanceId}`);
        const operationsDir = path.join(instanceLogDir, 'operations');
        const monitoringDir = path.join(instanceLogDir, 'monitoring');

        try {
            // 递归创建所有必需的目录
            await fs.mkdir(operationsDir, { recursive: true });
            await fs.mkdir(monitoringDir, { recursive: true });
            
            console.log(`✅ 策略实例目录创建成功: ${instanceLogDir}`);
        } catch (error) {
            console.error(`❌ 策略实例目录创建失败: ${instanceLogDir}`, error);
            throw error;
        }
    }

    /**
     * 记录策略操作日志
     */
    async logOperation(operation: string, details: any, traceId?: string): Promise<void> {
        if (!this.isActive) return;

        const currentTraceId = traceId || TraceContext.getCurrentTraceId();
        const message = this.formatOperationMessage(operation, details);

        await this.operationWriter.writeLog(
            `strategy-${this.instanceId}`,
            LogLevel.INFO,
            message,
            currentTraceId
        );
    }

    /**
     * 记录策略监控日志
     */
    async logMonitoring(metric: string, value: any, traceId?: string): Promise<void> {
        if (!this.isActive) return;

        const currentTraceId = traceId || TraceContext.getCurrentTraceId();
        const message = this.formatMonitoringMessage(metric, value);

        await this.monitoringWriter.writeLog(
            `strategy-${this.instanceId}`,
            LogLevel.INFO,
            message,
            currentTraceId
        );
    }

    /**
     * 记录策略错误日志（双重记录到操作和监控）
     */
    async logError(error: string, errorObj?: Error, traceId?: string): Promise<void> {
        if (!this.isActive) return;

        const currentTraceId = traceId || TraceContext.getCurrentTraceId();
        const message = `ERROR: ${error}`;

        // 记录到操作日志
        await this.operationWriter.writeErrorLog(
            `strategy-${this.instanceId}`,
            message,
            errorObj,
            currentTraceId
        );

        // 记录到监控日志
        await this.monitoringWriter.writeErrorLog(
            `strategy-${this.instanceId}`,
            message,
            errorObj,
            currentTraceId
        );
    }

    /**
     * 记录策略生命周期事件
     */
    async logLifecycle(event: 'start' | 'stop' | 'pause' | 'resume' | 'error', details?: any): Promise<void> {
        const message = `LIFECYCLE: ${event.toUpperCase()}${details ? ` - ${JSON.stringify(details)}` : ''}`;
        await this.logOperation('lifecycle', { event, details });
    }

    /**
     * 记录交易相关操作
     */
    async logTrade(action: string, details: {
        amount?: number;
        price?: number;
        slippage?: number;
        success?: boolean;
        txHash?: string;
        [key: string]: any;
    }): Promise<void> {
        const message = `TRADE: ${action} - ${JSON.stringify(details)}`;
        await this.logOperation('trade', { action, ...details });
    }

    /**
     * 记录仓位变化
     */
    async logPosition(action: string, details: {
        binId?: number;
        liquidity?: number;
        price?: number;
        change?: number;
        total?: number;
        [key: string]: any;
    }): Promise<void> {
        const message = `POSITION: ${action} - ${JSON.stringify(details)}`;
        await this.logOperation('position', { action, ...details });
    }

    /**
     * 记录性能指标
     */
    async logPerformance(metric: string, value: number, unit?: string): Promise<void> {
        const message = `PERFORMANCE: ${metric} = ${value}${unit ? ` ${unit}` : ''}`;
        await this.logMonitoring('performance', { metric, value, unit });
    }

    /**
     * 记录价格监控
     */
    async logPriceMonitoring(data: {
        currentPrice?: number;
        targetPrice?: number;
        priceChange?: number;
        volatility?: number;
        [key: string]: any;
    }): Promise<void> {
        const message = `PRICE: ${JSON.stringify(data)}`;
        await this.logMonitoring('price', data);
    }

    /**
     * 清理策略实例日志（停止时调用）
     */
    async cleanup(): Promise<void> {
        this.isActive = false;

        // 刷新所有待写入的日志
        await Promise.all([
            this.operationWriter.flush(),
            this.monitoringWriter.flush()
        ]);

        // 记录停止事件
        await this.logLifecycle('stop', { timestamp: new Date().toISOString() });
    }

    /**
     * 格式化操作消息
     */
    private formatOperationMessage(operation: string, details: any): string {
        const detailsStr = typeof details === 'object'
            ? JSON.stringify(details, null, 0)
            : String(details);
        return `OP: ${operation} | ${detailsStr}`;
    }

    /**
     * 格式化监控消息
     */
    private formatMonitoringMessage(metric: string, value: any): string {
        const valueStr = typeof value === 'object'
            ? JSON.stringify(value, null, 0)
            : String(value);
        return `MONITOR: ${metric} = ${valueStr}`;
    }

    /**
     * 清理旧日志文件（实例重启时）
     */
    private async cleanupOldLogs(): Promise<void> {
        try {
            const instanceDir = path.join(this.logDirectory, 'strategies', `instance-${this.instanceId}`);

            // 检查是否存在旧的日志目录
            try {
                await fs.access(instanceDir);
                // 目录存在，这是一个重启的实例
                // 可以选择删除旧日志或重命名备份
                // 这里我们创建一个备份目录
                const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
                const backupDir = path.join(instanceDir, `backup-${timestamp}`);

                // 移动现有日志到备份目录
                const operationsDir = path.join(instanceDir, 'operations');
                const monitoringDir = path.join(instanceDir, 'monitoring');

                try {
                    await fs.mkdir(backupDir, { recursive: true });
                    try {
                        await fs.rename(operationsDir, path.join(backupDir, 'operations'));
                    } catch { /* 目录可能不存在 */ }
                    try {
                        await fs.rename(monitoringDir, path.join(backupDir, 'monitoring'));
                    } catch { /* 目录可能不存在 */ }
                } catch (error) {
                    console.warn(`策略实例 ${this.instanceId} 旧日志清理失败:`, error);
                }
            } catch {
                // 目录不存在，这是一个新实例
            }
        } catch (error) {
            console.warn(`策略实例 ${this.instanceId} 日志初始化警告:`, error);
        }
    }

    /**
     * 获取实例ID
     */
    getInstanceId(): string {
        return this.instanceId;
    }

    /**
     * 检查日志器是否活跃
     */
    isActiveLogger(): boolean {
        return this.isActive;
    }
} 