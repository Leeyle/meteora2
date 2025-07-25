import path from 'path';
import fs from 'fs/promises';
import { LogWriter } from './LogWriter';
import { StrategyLogger } from './StrategyLogger';
import { CrawlerLogger } from './CrawlerLogger';
import { TraceContext } from './TraceContext';
import { TimeFormatter } from './TimeFormatter';
import { LogLevel, ILogConfig, LogEntry } from '../../types/logging';
import { ILoggerService, IStrategyLogger, ModuleConfig, ModuleHealth, ModuleMetrics } from '../../types/interfaces';

/**
 * 主日志服务
 * 实现三层分离架构：系统/业务/策略分离，操作/监控分离，实例级分离
 */
export class LoggerService implements ILoggerService {
    readonly name = 'LoggerService';
    readonly version = '2.0.0';
    readonly dependencies: string[] = [];

    private config: ILogConfig;
    private logDirectory: string;
    private systemWriter: LogWriter;
    private businessOperationWriter: LogWriter;
    private businessMonitoringWriter: LogWriter;
    private strategyLoggers = new Map<string, StrategyLogger>();
    private isInitialized = false;

    constructor(config: ILogConfig, logDirectory = './logs', clearOnStartup = true) {
        this.config = config;
        this.logDirectory = logDirectory;

        // 如果启用启动时清理，先清理所有旧日志
        if (clearOnStartup) {
            this.clearAllLogsSync();
        }

        // 初始化各层级的写入器 - 使用统一的基础目录
        this.systemWriter = new LogWriter({
            maxFileSize: config.maxFileSize,
            maxFiles: config.maxFiles,
            logDirectory: logDirectory
        });

        this.businessOperationWriter = new LogWriter({
            maxFileSize: config.maxFileSize,
            maxFiles: config.maxFiles,
            logDirectory: logDirectory
        });

        this.businessMonitoringWriter = new LogWriter({
            maxFileSize: config.maxFileSize,
            maxFiles: config.maxFiles,
            logDirectory: logDirectory
        });

        this.isInitialized = true;

        // 记录日志系统启动
        this.logSystem(LogLevel.INFO, '🚀 日志系统已启动，所有旧日志已清理');
    }

    /**
     * 同步清理所有日志文件（用于构造函数）
     */
    private clearAllLogsSync(): void {
        try {
            const fs = require('fs');
            const path = require('path');

            // 需要保留的文件列表（启动脚本生成的输出文件）
            const preserveFiles = [
                'api-server.log',
                'web-server.log',
                'monitor-server.log',
                // 传统日志文件（可能由其他脚本生成）
                'operation.log',
                'monitor.log',
                'strategy.log',
                'strategy-engine.log',
                'system.log',
                'app.log',
                'build.log'
            ];

            // 如果日志目录存在，选择性清理
            if (fs.existsSync(this.logDirectory)) {
                console.log('🧹 清理旧日志文件（保留启动脚本输出文件）...');
                this.removeDirectoryContentSync(this.logDirectory, preserveFiles);
                console.log('✅ 旧日志文件清理完成');
            }

            // 重新创建日志目录结构
            const logSubDirs = ['system', 'business', 'strategies', 'errors', 'misc'];
            for (const subDir of logSubDirs) {
                const subDirPath = path.join(this.logDirectory, subDir);
                fs.mkdirSync(subDirPath, { recursive: true });
            }
            console.log('📁 日志目录结构已重新创建');
        } catch (error) {
            console.error('❌ 清理日志文件失败:', error);
        }
    }

    /**
     * 递归删除目录内容（同步版本，保留指定文件）
     */
    private removeDirectoryContentSync(dirPath: string, preserveFiles: string[] = []): void {
        const fs = require('fs');
        const path = require('path');

        if (fs.existsSync(dirPath)) {
            const files = fs.readdirSync(dirPath);

            for (const file of files) {
                const filePath = path.join(dirPath, file);
                const stat = fs.statSync(filePath);

                // 检查是否是需要保留的文件
                if (preserveFiles.includes(file)) {
                    console.log(`📌 保留启动脚本输出文件: ${file}`);
                    continue;
                }

                if (stat.isDirectory()) {
                    this.removeDirectoryContentSync(filePath);
                    // 删除空目录，但保留根日志目录
                    if (filePath !== this.logDirectory) {
                        try {
                            fs.rmdirSync(filePath);
                        } catch (error) {
                            // 目录可能不为空，忽略错误
                        }
                    }
                } else {
                    fs.unlinkSync(filePath);
                }
            }
        }
    }

    /**
     * 异步清理所有日志文件
     */
    async clearAllLogs(): Promise<void> {
        try {
            await this.logSystem(LogLevel.INFO, '🧹 开始清理所有日志文件...');

            // 先关闭所有日志写入器
            await this.flush();

            // 清理策略日志器
            for (const [instanceId, strategyLogger] of this.strategyLoggers.entries()) {
                await strategyLogger.cleanup();
                this.strategyLoggers.delete(instanceId);
            }

            // 需要保留的文件列表（启动脚本生成的输出文件）
            const preserveFiles = [
                'api-server.log',
                'web-server.log',
                'monitor-server.log',
                // 传统日志文件（可能由其他脚本生成）
                'operation.log',
                'monitor.log',
                'strategy.log',
                'strategy-engine.log',
                'system.log',
                'app.log',
                'build.log'
            ];

            // 选择性删除日志目录内容
            await this.removeDirectoryContent(this.logDirectory, preserveFiles);

            // 重新创建日志目录结构
            const logSubDirs = ['system', 'business', 'strategies', 'errors', 'misc'];
            for (const subDir of logSubDirs) {
                const subDirPath = path.join(this.logDirectory, subDir);
                await fs.mkdir(subDirPath, { recursive: true });
            }

            // 重新初始化写入器
            this.systemWriter = new LogWriter({
                maxFileSize: this.config.maxFileSize,
                maxFiles: this.config.maxFiles,
                logDirectory: this.logDirectory
            });

            this.businessOperationWriter = new LogWriter({
                maxFileSize: this.config.maxFileSize,
                maxFiles: this.config.maxFiles,
                logDirectory: this.logDirectory
            });

            this.businessMonitoringWriter = new LogWriter({
                maxFileSize: this.config.maxFileSize,
                maxFiles: this.config.maxFiles,
                logDirectory: this.logDirectory
            });

            await this.logSystem(LogLevel.INFO, '✅ 所有日志文件清理完成，日志系统已重新初始化');
        } catch (error) {
            console.error('❌ 清理日志文件失败:', error);
            throw error;
        }
    }

    /**
     * 递归删除目录内容（异步版本，保留指定文件）
     */
    private async removeDirectoryContent(dirPath: string, preserveFiles: string[] = []): Promise<void> {
        try {
            const stat = await fs.stat(dirPath);
            if (!stat.isDirectory()) {
                await fs.unlink(dirPath);
                return;
            }

            const files = await fs.readdir(dirPath);

            for (const file of files) {
                const filePath = path.join(dirPath, file);

                // 检查是否是需要保留的文件
                if (preserveFiles.includes(file)) {
                    console.log(`📌 保留启动脚本输出文件: ${file}`);
                    continue;
                }

                const fileStat = await fs.stat(filePath);
                if (fileStat.isDirectory()) {
                    await this.removeDirectoryContent(filePath);
                    // 删除空目录，但保留根日志目录
                    if (filePath !== this.logDirectory) {
                        try {
                            await fs.rmdir(filePath);
                        } catch (error) {
                            // 目录可能不为空，忽略错误
                        }
                    }
                } else {
                    await fs.unlink(filePath);
                }
            }
        } catch (error) {
            // 文件或目录不存在，忽略错误
            if ((error as any).code !== 'ENOENT') {
                throw error;
            }
        }
    }

    /**
     * 获取日志统计信息
     */
    async getLogStatistics(): Promise<{
        totalFiles: number;
        totalSize: number;
        categories: { [key: string]: { files: number; size: number } };
    }> {
        const stats = {
            totalFiles: 0,
            totalSize: 0,
            categories: {} as { [key: string]: { files: number; size: number } }
        };

        try {
            await this.calculateDirectoryStats(this.logDirectory, stats);
        } catch (error) {
            console.error('获取日志统计失败:', error);
        }

        return stats;
    }

    /**
     * 计算目录统计信息
     */
    private async calculateDirectoryStats(
        dirPath: string,
        stats: { totalFiles: number; totalSize: number; categories: { [key: string]: { files: number; size: number } } }
    ): Promise<void> {
        try {
            const files = await fs.readdir(dirPath);
            const categoryName = path.basename(dirPath);

            if (!stats.categories[categoryName]) {
                stats.categories[categoryName] = { files: 0, size: 0 };
            }

            for (const file of files) {
                const filePath = path.join(dirPath, file);
                const stat = await fs.stat(filePath);

                if (stat.isDirectory()) {
                    await this.calculateDirectoryStats(filePath, stats);
                } else {
                    stats.totalFiles++;
                    stats.totalSize += stat.size;
                    stats.categories[categoryName].files++;
                    stats.categories[categoryName].size += stat.size;
                }
            }
        } catch (error) {
            // 目录不存在或无法访问，忽略
        }
    }

    /**
     * 记录系统日志
     * 支持两种输入格式：LogLevel枚举 或 字符串字面量
     */
    async logSystem(level: LogLevel | 'DEBUG' | 'INFO' | 'WARN' | 'ERROR', message: string, traceId?: string): Promise<void> {
        // 统一转换为LogLevel枚举
        const logLevel = typeof level === 'string' ? level as LogLevel : level;
        if (!this.shouldLog('system', logLevel)) return;

        const currentTraceId = traceId || TraceContext.getCurrentTraceId();

        if (this.config.enableConsole) {
            this.logToConsole('SYSTEM', logLevel, message, currentTraceId);
        }

        if (this.config.enableFile) {
            await this.systemWriter.writeLog('system', logLevel, message, currentTraceId);
        }
    }

    /**
     * 记录业务操作日志
     */
    async logBusinessOperation(operation: string, details: any, traceId?: string): Promise<void> {
        if (!this.shouldLog('business', LogLevel.INFO)) return;

        const currentTraceId = traceId || TraceContext.getCurrentTraceId();
        const message = this.formatBusinessMessage('OPERATION', operation, details);

        // 🔧 业务日志只写入文件，不在控制台显示（避免污染api-server.log）
        // if (this.config.enableConsole) {
        //     this.logToConsole('BUSINESS-OP', LogLevel.INFO, message, currentTraceId);
        // }

        if (this.config.enableFile) {
            await this.businessOperationWriter.writeLog('business-operations', LogLevel.INFO, message, currentTraceId);
        }
    }

    /**
     * 🔥 新增：业务操作日志 + 系统日志回显的便捷方法
     * 同时记录到业务操作日志和系统日志，减少重复代码
     */
    async logBusinessOperationWithEcho(
        operation: string,
        details: any,
        systemMessage?: string,
        traceId?: string
    ): Promise<void> {
        // 1. 记录业务操作日志
        await this.logBusinessOperation(operation, details, traceId);

        // 2. 记录系统日志（如果提供了系统消息）
        if (systemMessage) {
            await this.logSystem(LogLevel.INFO, systemMessage, traceId);
        } else {
            // 如果没有提供系统消息，使用操作名称生成默认消息
            const defaultSystemMessage = `✅ ${operation}`;
            await this.logSystem(LogLevel.INFO, defaultSystemMessage, traceId);
        }
    }

    /**
     * 🔥 新增：策略专用操作日志便捷方法
     * 同时记录到策略实例日志、业务操作日志和系统日志
     */
    async logStrategyOperationWithEcho(
        instanceId: string,
        operation: string,
        details: any,
        systemMessage?: string,
        traceId?: string
    ): Promise<void> {
        // 1. 记录策略实例日志
        const strategyLogger = this.strategyLoggers.get(instanceId);
        if (strategyLogger) {
            await strategyLogger.logOperation(operation, details, traceId);
        }

        // 2. 记录业务操作日志
        await this.logBusinessOperation(operation, details, traceId);

        // 3. 记录系统日志（如果提供了系统消息）
        if (systemMessage) {
            await this.logSystem(LogLevel.INFO, systemMessage, traceId);
        } else {
            // 如果没有提供系统消息，使用操作名称生成默认消息
            const defaultSystemMessage = `✅ ${operation}`;
            await this.logSystem(LogLevel.INFO, defaultSystemMessage, traceId);
        }
    }

    /**
     * 🆕 新增：实例感知的操作日志记录方法
     * 支持实例上下文的操作日志记录，如果能检测到实例ID，则同时记录到实例日志
     */
    async logInstanceAwareOperation(
        operation: string,
        details: any,
        instanceId?: string,
        traceId?: string
    ): Promise<void> {
        // 1. 总是记录业务操作日志
        await this.logBusinessOperation(operation, details, traceId);

        // 2. 如果提供了实例ID，则记录到实例日志
        if (instanceId) {
            const strategyLogger = this.strategyLoggers.get(instanceId);
            if (strategyLogger) {
                await strategyLogger.logOperation(operation, details, traceId);
            }
        }
    }

    /**
     * 🆕 新增：过滤操作日志记录方法
     * 只记录重要操作到实例日志，过滤掉监控类信息
     */
    async logFilteredInstanceOperation(
        operation: string,
        details: any,
        instanceId?: string,
        traceId?: string
    ): Promise<void> {
        // 定义需要记录到实例日志的重要操作
        const importantOperations = [
            '创建头寸-成功',
            '✅ 头寸1创建成功',
            '✅ 头寸2基础创建成功',
            '✅ 头寸关闭成功',
            '🔄 代币交换完成',
            'Jupiter交换-开始',
            '📈 创建头寸1 (高价格范围)',
            '📉 创建头寸2基础 (低价格范围)',
            '🎯 连锁头寸创建成功',
            '🗑️ 移除头寸状态',
            '✅ 头寸状态已彻底删除',
            'token-swap-x-to-y',
            'smart-yield-extraction'
        ];

        // 定义需要过滤掉的监控类操作
        const filteredOperations = [
            '获取链上头寸-成功',
            '获取链上头寸-开始',
            '批量获取链上头寸-开始',
            '批量获取链上头寸-成功'
        ];

        // 1. 总是记录业务操作日志
        await this.logBusinessOperation(operation, details, traceId);

        // 2. 只有重要操作且非过滤操作才记录到实例日志
        if (instanceId &&
            (importantOperations.some(op => operation.includes(op)) ||
                importantOperations.includes(operation)) &&
            !filteredOperations.some(op => operation.includes(op))) {

            const strategyLogger = this.strategyLoggers.get(instanceId);
            if (strategyLogger) {
                await strategyLogger.logOperation(operation, details, traceId);
            }
        }
    }

    /**
     * 记录业务监控日志
     */
    async logBusinessMonitoring(metric: string, value: any, traceId?: string): Promise<void> {
        if (!this.shouldLog('business', LogLevel.INFO)) return;

        const currentTraceId = traceId || TraceContext.getCurrentTraceId();
        const message = this.formatBusinessMessage('MONITORING', metric, value);

        // 🔧 业务日志只写入文件，不在控制台显示（避免污染api-server.log）
        // if (this.config.enableConsole) {
        //     this.logToConsole('BUSINESS-MON', LogLevel.INFO, message, currentTraceId);
        // }

        if (this.config.enableFile) {
            await this.businessMonitoringWriter.writeLog('business-monitoring', LogLevel.INFO, message, currentTraceId);
        }
    }

    /**
     * 🔧 修复：创建或获取策略实例日志器，避免重复创建
     */
    createStrategyLogger(instanceId: string): IStrategyLogger {
        if (this.strategyLoggers.has(instanceId)) {
            // 如果已存在，直接返回现有的日志器，避免重复创建
            return this.strategyLoggers.get(instanceId)!;
        }

        const strategyLogger = new StrategyLogger(instanceId, {
            maxFileSize: this.config.maxFileSize,
            maxFiles: this.config.maxFiles,
            logDirectory: this.logDirectory
        });

        // 🔧 修复：立即同步创建目录结构，确保日志写入不会失败
        this.ensureStrategyDirectoriesSync(instanceId);

        this.strategyLoggers.set(instanceId, strategyLogger);

        // 记录策略实例创建
        this.logSystem(LogLevel.INFO, `策略实例创建: ${instanceId}`);

        return strategyLogger;
    }

    /**
     * 🔧 新增：同步确保策略实例目录结构存在
     */
    private ensureStrategyDirectoriesSync(instanceId: string): void {
        const fs = require('fs');
        const path = require('path');
        
        const instanceLogDir = path.join(this.logDirectory, 'strategies', `instance-${instanceId}`);
        const operationsDir = path.join(instanceLogDir, 'operations');
        const monitoringDir = path.join(instanceLogDir, 'monitoring');

        try {
            // 检查目录是否已存在，只有不存在时才创建并输出消息
            const dirExists = fs.existsSync(instanceLogDir) && 
                             fs.existsSync(operationsDir) && 
                             fs.existsSync(monitoringDir);
            
            if (!dirExists) {
                // 同步递归创建所有必需的目录
                fs.mkdirSync(operationsDir, { recursive: true });
                fs.mkdirSync(monitoringDir, { recursive: true });
                
                console.log(`✅ 策略实例目录同步创建成功: ${instanceLogDir}`);
            }
        } catch (error) {
            console.error(`❌ 策略实例目录同步创建失败: ${instanceLogDir}`, error);
            // 不抛出错误，继续运行，让异步机制处理
        }
    }

    /**
     * 创建爬虫专用日志器
     */
    createCrawlerLogger(): CrawlerLogger {
        const config = {
            maxFileSize: this.config.maxFileSize,
            maxFiles: this.config.maxFiles,
            logDirectory: this.logDirectory
        };

        const crawlerLogger = new CrawlerLogger(config);
        this.logSystem(LogLevel.INFO, '池爬虫独立日志器已创建');
        return crawlerLogger;
    }

    /**
     * 记录错误日志（支持分类）
     */
    async logError(category: string, error: string, errorObj?: Error, traceId?: string): Promise<void> {
        const currentTraceId = traceId || TraceContext.getCurrentTraceId();
        const level = LogLevel.ERROR;

        // 控制台输出
        if (this.config.enableConsole) {
            this.logToConsole(category.toUpperCase(), level, error, currentTraceId);
            if (errorObj) {
                console.error('Stack:', errorObj.stack);
            }
        }

        // 文件输出 - 根据分类选择写入器
        if (this.config.enableFile) {
            if (category.startsWith('system')) {
                await this.systemWriter.writeErrorLog(category, error, errorObj, currentTraceId);
            } else if (category.startsWith('business')) {
                // 错误同时记录到操作和监控
                await this.businessOperationWriter.writeErrorLog(category, error, errorObj, currentTraceId);
                await this.businessMonitoringWriter.writeErrorLog(category, error, errorObj, currentTraceId);
            } else {
                // 默认记录到系统错误
                await this.systemWriter.writeErrorLog(category, error, errorObj, currentTraceId);
            }
        }
    }

    /**
     * 刷新所有日志
     */
    async flush(): Promise<void> {
        const flushPromises = [
            this.systemWriter.flush(),
            this.businessOperationWriter.flush(),
            this.businessMonitoringWriter.flush()
        ];

        // 刷新所有策略实例日志
        for (const strategyLogger of this.strategyLoggers.values()) {
            flushPromises.push(strategyLogger.cleanup());
        }

        await Promise.all(flushPromises);
    }

    /**
     * 关闭日志服务
     */
    async shutdown(): Promise<void> {
        this.logSystem(LogLevel.INFO, '日志服务关闭中...');

        // 清理所有策略实例日志器
        for (const [instanceId, strategyLogger] of this.strategyLoggers.entries()) {
            await strategyLogger.cleanup();
            this.strategyLoggers.delete(instanceId);
        }

        // 刷新所有日志
        await this.flush();

        this.isInitialized = false;
        this.logSystem(LogLevel.INFO, '日志服务已关闭');
    }

    /**
     * 移除策略实例日志器
     */
    async removeStrategyLogger(instanceId: string): Promise<void> {
        const strategyLogger = this.strategyLoggers.get(instanceId);
        if (strategyLogger) {
            await strategyLogger.cleanup();
            this.strategyLoggers.delete(instanceId);
            this.logSystem(LogLevel.INFO, `策略实例移除: ${instanceId}`);
        }
    }

    /**
     * 获取策略实例日志器
     */
    getStrategyLogger(instanceId: string): IStrategyLogger | undefined {
        return this.strategyLoggers.get(instanceId);
    }

    /**
     * 获取所有活跃的策略实例ID
     */
    getActiveStrategyInstances(): string[] {
        return Array.from(this.strategyLoggers.keys());
    }

    /**
     * 检查是否应该记录日志
     */
    private shouldLog(category: 'system' | 'business' | 'strategies', level: LogLevel): boolean {
        if (!this.isInitialized) return false;

        // 检查全局级别
        if (this.getLogLevelNumber(level) < this.getLogLevelNumber(this.config.globalLevel)) {
            return false;
        }

        // 检查分类级别
        const categoryLevel = this.config.categoryLevels[category];
        return this.getLogLevelNumber(level) >= this.getLogLevelNumber(categoryLevel);
    }

    /**
     * 获取日志级别数值（用于比较）
     */
    private getLogLevelNumber(level: LogLevel): number {
        const levels = {
            [LogLevel.DEBUG]: 0,
            [LogLevel.INFO]: 1,
            [LogLevel.WARN]: 2,
            [LogLevel.ERROR]: 3
        };
        return levels[level] || 0;
    }

    /**
     * 格式化业务消息
     */
    private formatBusinessMessage(type: string, operation: string, details: any): string {
        const detailsStr = typeof details === 'object'
            ? JSON.stringify(details, null, 0)
            : String(details);
        return `${type}: ${operation} | ${detailsStr}`;
    }

    /**
     * 控制台日志输出
     */
    private logToConsole(category: string, level: LogLevel, message: string, traceId?: string): void {
        const timestamp = TimeFormatter.format();
        const traceInfo = traceId ? ` [${traceId}]` : '';
        const logMessage = `${timestamp} ${level}${traceInfo} [${category}] ${message}`;

        switch (level) {
            case LogLevel.DEBUG:
                console.debug(logMessage);
                break;
            case LogLevel.INFO:
                console.info(logMessage);
                break;
            case LogLevel.WARN:
                console.warn(logMessage);
                break;
            case LogLevel.ERROR:
                console.error(logMessage);
                break;
        }
    }

    /**
     * 获取配置信息
     */
    getConfig(): ILogConfig {
        return { ...this.config };
    }

    /**
     * 更新配置
     */
    updateConfig(newConfig: Partial<ILogConfig>): void {
        this.config = { ...this.config, ...newConfig };
    }

    // === IService接口实现 ===

    async initialize(config: ModuleConfig): Promise<void> {
        this.logSystem(LogLevel.INFO, '日志服务初始化中...');
        this.isInitialized = true;
    }

    async start(): Promise<void> {
        this.logSystem(LogLevel.INFO, '日志服务启动完成');
    }

    async stop(): Promise<void> {
        await this.shutdown();
    }

    async healthCheck(): Promise<ModuleHealth> {
        return {
            status: 'healthy',
            message: '日志服务运行正常',
            timestamp: Date.now()
        };
    }

    getMetrics(): ModuleMetrics {
        return {
            uptime: Date.now(),
            requestCount: 0,
            errorCount: 0,
            lastActivity: Date.now()
        };
    }

    /**
     * 获取最近的系统日志
     */
    async getRecentLogs(limit: number = 50): Promise<LogEntry[]> {
        return this.systemWriter.readLogs('system', limit);
    }

    /**
     * 获取错误日志
     */
    async getErrorLogs(limit: number = 20): Promise<LogEntry[]> {
        return this.systemWriter.readErrorLogs(limit);
    }

    /**
     * 获取业务操作日志
     */
    async getBusinessOperationLogs(limit: number = 50): Promise<LogEntry[]> {
        return this.businessOperationWriter.readLogs('business-operations', limit);
    }

    /**
     * 获取业务监控日志
     */
    async getBusinessMonitoringLogs(limit: number = 50): Promise<LogEntry[]> {
        return this.businessMonitoringWriter.readLogs('business-monitoring', limit);
    }

    /**
     * 按类别获取日志
     */
    async getLogsByCategory(category: string, limit: number = 50): Promise<LogEntry[]> {
        if (category.startsWith('system')) {
            return this.systemWriter.readLogs(category, limit);
        } else if (category.startsWith('business-operation')) {
            return this.businessOperationWriter.readLogs(category, limit);
        } else if (category.startsWith('business-monitoring')) {
            return this.businessMonitoringWriter.readLogs(category, limit);
        } else if (category.startsWith('strategy-')) {
            // 策略日志需要从策略日志器中获取
            const instanceId = category.replace('strategy-', '');
            const strategyLogger = this.strategyLoggers.get(instanceId);
            if (strategyLogger && typeof (strategyLogger as any).getLogs === 'function') {
                return (strategyLogger as any).getLogs(limit);
            }
        }

        // 默认从系统日志中查找
        return this.systemWriter.readLogs(category, limit);
    }

    /**
     * 获取所有可用的日志文件
     */
    async getAvailableLogFiles(): Promise<string[]> {
        const systemFiles = await this.systemWriter.getLogFiles();
        const businessOpFiles = await this.businessOperationWriter.getLogFiles();
        const businessMonFiles = await this.businessMonitoringWriter.getLogFiles();

        return [...systemFiles, ...businessOpFiles, ...businessMonFiles];
    }

    /**
     * 获取混合日志（所有类型）
     */
    async getMixedLogs(limit: number = 50): Promise<LogEntry[]> {
        const systemLogs = await this.getRecentLogs(Math.floor(limit / 3));
        const businessOpLogs = await this.getBusinessOperationLogs(Math.floor(limit / 3));
        const businessMonLogs = await this.getBusinessMonitoringLogs(Math.floor(limit / 3));

        // 合并并按时间排序
        const allLogs = [...systemLogs, ...businessOpLogs, ...businessMonLogs];
        return allLogs
            .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
            .slice(0, limit);
    }

    /**
     * 🔍 实例ID检测器 - 从操作上下文推断实例ID
     */
    private detectInstanceIdFromContext(operation: string, details: any): string | null {
        // 1. 从details中直接获取instanceId
        if (details && details.instanceId) {
            return details.instanceId;
        }

        // 2. 从头寸地址推断实例ID
        if (details && details.positionAddress) {
            for (const [instanceId, logger] of this.strategyLoggers) {
                // 这里可以通过其他方式关联头寸地址和实例ID
                // 现在先返回null，让调用方明确传递instanceId
            }
        }

        // 3. 从操作名称中推断（如果有特定格式）
        if (operation.includes('chain_position_')) {
            const match = operation.match(/chain_position_\d+_\w+/);
            if (match) {
                return match[0];
            }
        }

        return null;
    }

    /**
     * 🤖 智能操作日志记录 - 自动检测实例ID并记录
     */
    async logSmartOperation(
        operation: string,
        details: any,
        options: {
            instanceId?: string;
            forceInstanceLog?: boolean;
            traceId?: string;
        } = {}
    ): Promise<void> {
        const { instanceId: providedInstanceId, forceInstanceLog = false, traceId } = options;

        // 尝试获取实例ID
        const detectedInstanceId = providedInstanceId || this.detectInstanceIdFromContext(operation, details);

        // 如果强制记录实例日志或检测到实例ID，使用过滤方法
        if (forceInstanceLog || detectedInstanceId) {
            await this.logFilteredInstanceOperation(operation, details, detectedInstanceId || undefined, traceId);
        } else {
            // 否则只记录业务操作日志
            await this.logBusinessOperation(operation, details, traceId);
        }
    }
} 