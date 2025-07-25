import path from 'path';
import { LogWriter } from './LogWriter';
import { TraceContext } from './TraceContext';
import { LogLevel } from '../../types/logging';

/**
 * 池爬虫专用日志器
 * 实现爬虫操作的独立日志管理和监控
 */
export class CrawlerLogger {
    private operationWriter: LogWriter;
    private monitoringWriter: LogWriter;
    private errorWriter: LogWriter;
    private isActive = true;
    private logDirectory: string;

    constructor(config: {
        maxFileSize: number;
        maxFiles: number;
        logDirectory: string;
    }) {
        this.logDirectory = config.logDirectory;

        // 创建爬虫专用的日志目录
        const crawlerLogDir = path.join(config.logDirectory, 'crawler');

        // 为操作、监控、错误分别创建写入器
        this.operationWriter = new LogWriter({
            ...config,
            logDirectory: path.join(crawlerLogDir, 'operations')
        });

        this.monitoringWriter = new LogWriter({
            ...config,
            logDirectory: path.join(crawlerLogDir, 'monitoring')
        });

        this.errorWriter = new LogWriter({
            ...config,
            logDirectory: path.join(crawlerLogDir, 'errors')
        });

        // 初始化时记录启动
        this.logOperation('crawler-startup', {
            timestamp: new Date().toISOString(),
            logDirectory: crawlerLogDir
        });
    }

    /**
     * 记录爬虫操作日志
     */
    async logOperation(operation: string, details: any, traceId?: string): Promise<void> {
        if (!this.isActive) return;

        const currentTraceId = traceId || TraceContext.getCurrentTraceId();
        const message = this.formatOperationMessage(operation, details);

        await this.operationWriter.writeLog(
            'pool-crawler-ops',
            LogLevel.INFO,
            message,
            currentTraceId
        );
    }

    /**
     * 记录爬虫监控日志
     */
    async logMonitoring(metric: string, value: any, traceId?: string): Promise<void> {
        if (!this.isActive) return;

        const currentTraceId = traceId || TraceContext.getCurrentTraceId();
        const message = this.formatMonitoringMessage(metric, value);

        await this.monitoringWriter.writeLog(
            'pool-crawler-monitor',
            LogLevel.INFO,
            message,
            currentTraceId
        );
    }

    /**
     * 记录爬虫错误日志
     */
    async logError(error: string, errorObj?: Error, traceId?: string): Promise<void> {
        if (!this.isActive) return;

        const currentTraceId = traceId || TraceContext.getCurrentTraceId();
        const message = `ERROR: ${error}`;

        // 记录到错误日志
        await this.errorWriter.writeErrorLog(
            'pool-crawler-error',
            message,
            errorObj,
            currentTraceId
        );

        // 同时记录到操作日志
        await this.operationWriter.writeErrorLog(
            'pool-crawler-ops',
            message,
            errorObj,
            currentTraceId
        );
    }

    /**
     * 记录爬虫生命周期事件
     */
    async logLifecycle(event: 'start' | 'stop' | 'pause' | 'resume' | 'config-update' | 'clear-data' | 'destroy', details?: any): Promise<void> {
        const message = `LIFECYCLE: ${event.toUpperCase()}${details ? ` - ${JSON.stringify(details)}` : ''}`;
        await this.logOperation('lifecycle', { event, details });
    }

    /**
     * 记录爬取开始
     */
    async logCrawlStart(config: any): Promise<void> {
        await this.logOperation('crawl-start', {
            config: config,
            timestamp: new Date().toISOString()
        });
    }

    /**
     * 记录爬取完成
     */
    async logCrawlComplete(stats: {
        duration?: number;
        poolsFound?: number;
        qualifiedPools?: number;
        errors?: number;
        [key: string]: any;
    }): Promise<void> {
        await this.logOperation('crawl-complete', stats);
        await this.logMonitoring('crawl-stats', stats);
    }

    /**
     * 记录池发现
     */
    async logPoolDiscovered(poolData: {
        address: string;
        tokenPair: string;
        meteorScore?: number;
        tvl?: number;
        [key: string]: any;
    }): Promise<void> {
        await this.logOperation('pool-discovered', poolData);
    }

    /**
     * 记录合格池添加
     */
    async logQualifiedPoolAdded(poolData: {
        address: string;
        reason: string;
        criteria: any;
        [key: string]: any;
    }): Promise<void> {
        await this.logOperation('qualified-pool-added', poolData);
        await this.logMonitoring('qualified-pool', {
            address: poolData.address,
            reason: poolData.reason
        });
    }

    /**
     * 记录过滤器应用
     */
    async logFilterApplied(filterType: string, filterData: {
        poolsInput?: number;
        poolsOutput?: number;
        filteredOut?: number;
        criteria?: any;
        [key: string]: any;
    }): Promise<void> {
        await this.logOperation('filter-applied', { filterType, ...filterData });
        await this.logMonitoring('filter-stats', {
            type: filterType,
            input: filterData.poolsInput,
            output: filterData.poolsOutput
        });
    }

    /**
     * 记录网络请求
     */
    async logNetworkRequest(url: string, method: string, status: number, duration: number, error?: string): Promise<void> {
        const requestData = {
            url,
            method,
            status,
            duration,
            error,
            timestamp: new Date().toISOString()
        };

        if (error || status >= 400) {
            await this.logError(`Network request failed: ${method} ${url}`, new Error(error || `HTTP ${status}`));
        } else {
            await this.logOperation('network-request', requestData);
        }

        await this.logMonitoring('network-stats', {
            status,
            duration,
            success: !error && status < 400
        });
    }

    /**
     * 记录数据解析
     */
    async logDataParsing(operation: string, stats: {
        inputSize?: number;
        outputSize?: number;
        parseTime?: number;
        errors?: number;
        [key: string]: any;
    }): Promise<void> {
        await this.logOperation('data-parsing', { operation, ...stats });
        await this.logMonitoring('parsing-stats', stats);
    }

    /**
     * 记录下次爬取安排
     */
    async logScheduleNextCrawl(scheduleData: {
        nextCrawlTime?: number;
        interval?: number;
        [key: string]: any;
    }): Promise<void> {
        await this.logOperation('schedule-next-crawl', scheduleData);
        await this.logMonitoring('schedule-stats', scheduleData);
    }

    /**
     * 记录配置更新
     */
    async logConfigUpdated(configData: {
        config?: any;
        timestamp?: number;
        [key: string]: any;
    }): Promise<void> {
        await this.logOperation('config-updated', configData);
        await this.logMonitoring('config-change', configData);
    }

    /**
     * 记录筛选器更新
     */
    async logFiltersUpdated(filtersData: {
        filters?: any;
        timestamp?: number;
        [key: string]: any;
    }): Promise<void> {
        await this.logOperation('filters-updated', filtersData);
        await this.logMonitoring('filters-change', filtersData);
    }

    /**
     * 刷新所有日志
     */
    async flush(): Promise<void> {
        await Promise.all([
            this.operationWriter.flush(),
            this.monitoringWriter.flush(),
            this.errorWriter.flush()
        ]);
    }

    /**
     * 清理并关闭日志器
     */
    async cleanup(): Promise<void> {
        this.isActive = false;

        // 记录停止事件
        await this.logLifecycle('stop', { timestamp: new Date().toISOString() });

        // 刷新所有待写入的日志
        await this.flush();
    }

    /**
     * 获取日志统计
     */
    async getStats(): Promise<{
        isActive: boolean;
        logDirectory: string;
        lastActivity: number;
    }> {
        return {
            isActive: this.isActive,
            logDirectory: this.logDirectory,
            lastActivity: Date.now()
        };
    }

    /**
     * 格式化操作消息
     */
    private formatOperationMessage(operation: string, details: any): string {
        const detailsStr = typeof details === 'object'
            ? JSON.stringify(details, null, 0)
            : String(details);
        return `CRAWLER-OP: ${operation} | ${detailsStr}`;
    }

    /**
     * 格式化监控消息
     */
    private formatMonitoringMessage(metric: string, value: any): string {
        const valueStr = typeof value === 'object'
            ? JSON.stringify(value, null, 0)
            : String(value);
        return `CRAWLER-MONITOR: ${metric} = ${valueStr}`;
    }
} 