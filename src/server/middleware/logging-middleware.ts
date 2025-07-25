/**
 * 📝 日志中间件
 * 记录API请求和响应
 */

import { Request, Response, NextFunction } from 'express';
import { TraceContext } from '../../infrastructure/logging/TraceContext';
import { TimeFormatter } from '../../infrastructure/logging/TimeFormatter';
import type { ILoggerService } from '../../types/interfaces';
import { LogLevel } from '../../types/logging';

/**
 * Express日志中间件
 * 自动生成追踪ID并记录请求/响应信息
 */
export function createLoggingMiddleware(logger: ILoggerService) {
    return (req: Request, res: Response, next: NextFunction) => {
        // 生成追踪ID
        const traceId = TraceContext.generateTraceId();

        // 在追踪上下文中运行
        TraceContext.run(traceId, async () => {
            // 记录请求开始
            const startTime = TimeFormatter.now();
            const requestInfo = {
                method: req.method,
                url: req.url,
                userAgent: req.get('User-Agent'),
                ip: req.ip || req.connection.remoteAddress,
                contentLength: req.get('Content-Length')
            };

            logger.logSystem(LogLevel.INFO as any, `请求开始: ${req.method} ${req.url}`, traceId);

            // 响应结束时记录日志
            const originalSend = res.send;
            res.send = function (data: any) {
                const duration = TimeFormatter.duration(startTime);
                const responseInfo = {
                    statusCode: res.statusCode,
                    contentLength: res.get('Content-Length'),
                    duration: `${duration}ms`
                };

                logger.logSystem(LogLevel.INFO as any,
                    `请求完成: ${req.method} ${req.url} - ${res.statusCode} (${duration}ms)`,
                    traceId
                );

                return originalSend.call(this, data);
            };

            // 错误处理
            res.on('error', (error) => {
                logger.logError('system-http', `请求错误: ${req.method} ${req.url}`, error, traceId);
            });

            next();
        });
    };
}

/**
 * WebSocket日志中间件
 */
export class WebSocketLoggingMiddleware {
    private logger: ILoggerService;

    constructor(logger: ILoggerService) {
        this.logger = logger;
    }

    /**
     * WebSocket连接日志
     */
    async logConnection(connectionId: string, clientInfo: any): Promise<void> {
        const traceId = TraceContext.generateTraceId();

        TraceContext.run(traceId, async () => {
            await this.logger.logSystem(LogLevel.INFO, `WebSocket连接建立: ${connectionId}`);
        });
    }

    /**
     * WebSocket断开连接日志
     */
    async logDisconnection(connectionId: string, reason?: string): Promise<void> {
        const traceId = TraceContext.generateTraceId();

        TraceContext.run(traceId, async () => {
            await this.logger.logSystem(LogLevel.INFO, `WebSocket连接断开: ${connectionId}${reason ? ` - ${reason}` : ''}`);
        });
    }

    /**
     * WebSocket消息日志
     */
    async logMessage(connectionId: string, direction: 'incoming' | 'outgoing', messageType: string, data?: any): Promise<void> {
        const currentTraceId = TraceContext.getCurrentTraceId();
        const traceId = currentTraceId || TraceContext.generateTraceId();

        const messageInfo = {
            connectionId,
            direction,
            messageType,
            dataSize: data ? JSON.stringify(data).length : 0
        };

        await this.logger.logSystem(LogLevel.DEBUG, `WebSocket消息 [${direction}]: ${messageType} - ${connectionId}`);
    }

    /**
     * WebSocket错误日志
     */
    async logError(connectionId: string, error: Error, context?: any): Promise<void> {
        const currentTraceId = TraceContext.getCurrentTraceId();
        const traceId = currentTraceId || TraceContext.generateTraceId();

        await this.logger.logError('WebSocket', `WebSocket错误: ${connectionId} - ${error.message}`, error);
    }
}

/**
 * API调用日志中间件（用于外部服务调用）
 */
export class ApiCallLogger {
    private logger: ILoggerService;

    constructor(logger: ILoggerService) {
        this.logger = logger;
    }

    /**
     * 记录外部API调用
     */
    async logApiCall<T>(
        serviceName: string,
        method: string,
        url: string,
        apiCall: () => Promise<T>
    ): Promise<T> {
        const currentTraceId = TraceContext.getCurrentTraceId();
        const traceId = currentTraceId || TraceContext.generateTraceId();
        const startTime = TimeFormatter.now();

        await this.logger.logBusinessOperation(`API调用开始: ${serviceName} ${method}`, { url, action: 'start' });

        try {
            const result = await apiCall();
            const duration = TimeFormatter.duration(startTime);

            await this.logger.logBusinessOperation(`API调用成功: ${serviceName} ${method}`, { url, duration: `${duration}ms` });

            return result;
        } catch (error) {
            const duration = TimeFormatter.duration(startTime);

            await this.logger.logError('ApiCall', `API调用失败: ${serviceName} ${method} ${url}`, error as Error);

            throw error;
        }
    }
}

/**
 * 数据库操作日志中间件
 */
export class DatabaseLogger {
    private logger: ILoggerService;

    constructor(logger: ILoggerService) {
        this.logger = logger;
    }

    /**
     * 记录数据库操作
     */
    async logDatabaseOperation<T>(
        operation: string,
        table: string,
        dbCall: () => Promise<T>
    ): Promise<T> {
        const currentTraceId = TraceContext.getCurrentTraceId();
        const traceId = currentTraceId || TraceContext.generateTraceId();
        const startTime = TimeFormatter.now();

        await this.logger.logBusinessOperation(`数据库操作开始: ${operation}`, { table, action: 'start' });

        try {
            const result = await dbCall();
            const duration = TimeFormatter.duration(startTime);

            await this.logger.logBusinessOperation(`数据库操作成功: ${operation}`, { table, duration: `${duration}ms` });

            return result;
        } catch (error) {
            const duration = TimeFormatter.duration(startTime);

            await this.logger.logError('Database', `数据库操作失败: ${operation} on ${table}`, error as Error);

            throw error;
        }
    }
} 