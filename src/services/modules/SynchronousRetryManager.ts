import { injectable, inject } from 'tsyringe';
import { IEventBus, ILoggerService, TYPES } from '../../types/interfaces';

/**
 * 🔄 重试事件类型定义
 */
export enum SyncRetryEventType {
    RETRY_STARTED = 'sync.retry.started',
    RETRY_ATTEMPT = 'sync.retry.attempt',
    RETRY_SUCCESS = 'sync.retry.success',
    RETRY_FAILED = 'sync.retry.failed'
}

/**
 * 🔧 同步重试配置
 */
export interface SyncRetryConfig {
    maxAttempts: number;           // 最大重试次数
    retryableErrors: string[];     // 可重试的错误关键词
    delayMs?: number;              // 重试间隔（同步延迟）
}

/**
 * 📊 重试上下文
 */
export interface SyncRetryContext {
    operationName: string;         // 操作名称
    instanceId: string;            // 策略实例ID
    attempt: number;               // 当前尝试次数
    startTime: number;             // 开始时间
    lastError?: Error;             // 最后一次错误
}

/**
 * 🎯 同步重试操作接口
 */
export interface SyncRetryableOperation<T = any> {
    execute(): T;                  // 同步执行函数
    validate?(result: T): boolean; // 可选的结果验证
}

/**
 * 🎯 异步重试操作接口（但重试逻辑仍然同步）
 */
export interface AsyncRetryableOperation<T = any> {
    execute(): Promise<T>;         // 异步执行函数
    validate?(result: T): boolean; // 可选的结果验证
}

/**
 * 🔄 同步事件驱动重试管理器
 * 
 * 核心特点：
 * 1. 完全同步执行，保证状态一致性
 * 2. 事件用于通知，不用于控制流
 * 3. 重试立即执行，不破坏执行上下文
 * 4. 模块化设计，易于集成
 */
@injectable()
export class SynchronousRetryManager {

    // 默认重试配置
    private readonly defaultConfigs: Record<string, SyncRetryConfig> = {
        'position.close': {
            maxAttempts: 5,
            retryableErrors: ['交易验证超时', '交易失败', 'RPC_ERROR', 'NETWORK_ERROR', 'SLIPPAGE_ERROR'],
            delayMs: 1000 // 1秒同步延迟（实际间隔由验证流程决定）
        },
        'position.create': {
            maxAttempts: 2,
            retryableErrors: ['交易验证超时', '余额不足', 'SLIPPAGE_ERROR', 'PRICE_IMPACT_TOO_HIGH'],
            delayMs: 2000 // 2秒同步延迟
        },
        'outOfRange.handler': {
            maxAttempts: 3,
            retryableErrors: ['交易验证超时', '交易失败', 'RPC_ERROR', 'NETWORK_ERROR'],
            delayMs: 3000 // 3秒同步延迟
        },
        // 🔥 新增：连锁头寸创建重试配置
        'chain.position.create': {
            maxAttempts: 3,
            retryableErrors: [
                '交易验证超时', '交易失败', 'RPC_ERROR', 'NETWORK_ERROR',
                'SLIPPAGE_ERROR', 'failed to get info about account',
                '连锁头寸创建部分失败', 'PRICE_IMPACT_TOO_HIGH',
                '余额不足', 'insufficient funds', 'slippage tolerance exceeded'
            ],
            delayMs: 15000 // 15秒同步延迟
        },
        // 🔥 新增：流动性添加操作重试配置
        'liquidity.add': {
            maxAttempts: 6,
            retryableErrors: ['交易验证超时', '交易失败', 'RPC_ERROR', 'NETWORK_ERROR', 'SLIPPAGE_ERROR', 'PRICE_IMPACT_TOO_HIGH', '操作结果验证失败'],
            delayMs: 10000 // 10秒同步延迟
        },
        // 🔥 新增：代币交换操作重试配置
        'token.swap': {
            maxAttempts: 3,
            retryableErrors: [
                '交易验证超时', '交易失败', 'RPC_ERROR', 'NETWORK_ERROR',
                'SLIPPAGE_ERROR', 'PRICE_IMPACT_TOO_HIGH', 'Jupiter API请求频率限制',
                'Jupiter API错误', '找不到交换路由', '交换失败', '代币交换失败',
                'insufficient funds', 'slippage tolerance exceeded', 'price impact too high',
                '操作结果验证失败', '代币交换验证失败', '代币交换交易失败', '链上交易状态为失败'
            ],
            delayMs: 30000 // 30秒同步延迟
        },
        // 🛑 新增：止损操作重试配置
        'stop.loss': {
            maxAttempts: 4,
            retryableErrors: ['交易验证超时', '交易失败', 'RPC_ERROR', 'NETWORK_ERROR', 'SLIPPAGE_ERROR'],
            delayMs: 10000 // 第一次重试10秒延迟
            // 注意：实际延迟会根据重试次数动态调整 (10s, 30s, 60s, 60s)
        },
        // 🔄 新增：止损X代币卖出重试配置
        'stop.loss.token.swap': {
            maxAttempts: 4,
            retryableErrors: [
                '交易验证超时', '交易失败', 'RPC_ERROR', 'NETWORK_ERROR',
                'SLIPPAGE_ERROR', 'PRICE_IMPACT_TOO_HIGH', 'Jupiter API请求频率限制',
                'Jupiter API错误', '找不到交换路由', '交换失败', '代币交换失败',
                'insufficient funds', 'slippage tolerance exceeded', 'price impact too high',
                'timeout', 'fetch failed', 'network error'
            ],
            delayMs: 30000 // 30秒同步延迟，给足时间让网络状况恢复
        },
        // 🧹 新增：清理操作重试配置
        'position.cleanup': {
            maxAttempts: 3,
            retryableErrors: [
                '交易验证超时', '交易失败', 'RPC_ERROR', 'NETWORK_ERROR',
                'SLIPPAGE_ERROR', '头寸关闭失败', '头寸不存在', '不属于当前用户',
                'position does not exist', 'Position not found'
            ],
            delayMs: 30000 // 30秒延迟，第一次重试
            // 注意：实际延迟会根据重试次数动态调整 (30s, 60s, 60s)
        }
    };

    constructor(
        @inject(TYPES.EventBus) private eventBus: IEventBus,
        @inject(TYPES.LoggerService) private loggerService: ILoggerService
    ) { }

    /**
     * 🎯 执行同步重试操作
     */
    executeWithRetry<T>(
        operation: SyncRetryableOperation<T>,
        operationType: string,
        instanceId: string,
        customConfig?: Partial<SyncRetryConfig>
    ): T {
        const defaultConfig = this.defaultConfigs[operationType] || {
            maxAttempts: 1,
            retryableErrors: [],
            delayMs: 0
        };
        const config = { ...defaultConfig, ...customConfig };

        const context: SyncRetryContext = {
            operationName: operationType,
            instanceId,
            attempt: 0,
            startTime: Date.now()
        };

        // 🔥 发送重试开始事件（同步）
        this.publishEvent(SyncRetryEventType.RETRY_STARTED, {
            operationType,
            instanceId,
            config
        });

        return this.executeRetryLoop(operation, config, context);
    }

    /**
     * 🎯 执行异步重试操作（但重试逻辑仍然同步）
     */
    async executeAsyncWithRetry<T>(
        operation: AsyncRetryableOperation<T>,
        operationType: string,
        instanceId: string,
        customConfig?: Partial<SyncRetryConfig>
    ): Promise<T> {
        const defaultConfig = this.defaultConfigs[operationType] || {
            maxAttempts: 1,
            retryableErrors: [],
            delayMs: 0
        };
        const config = { ...defaultConfig, ...customConfig };

        const context: SyncRetryContext = {
            operationName: operationType,
            instanceId,
            attempt: 0,
            startTime: Date.now()
        };

        // 🔥 发送重试开始事件（同步）
        this.publishEvent(SyncRetryEventType.RETRY_STARTED, {
            operationType,
            instanceId,
            config
        });

        return this.executeAsyncRetryLoop(operation, config, context);
    }

    /**
     * 🔄 执行重试循环（完全同步）
     */
    private executeRetryLoop<T>(
        operation: SyncRetryableOperation<T>,
        config: SyncRetryConfig,
        context: SyncRetryContext
    ): T {
        let lastError: Error | null = null;

        for (let attempt = 1; attempt <= config.maxAttempts; attempt++) {
            context.attempt = attempt;

            // 发送重试尝试事件（移除日志）
            this.publishEvent(SyncRetryEventType.RETRY_ATTEMPT, {
                ...context,
                attempt,
                maxAttempts: config.maxAttempts
            });

            try {
                // 🎯 执行操作（同步）
                const result = operation.execute();

                // 可选的结果验证
                if (operation.validate && !operation.validate(result)) {
                    throw new Error('操作结果验证失败');
                }

                // ✅ 成功 - 合并为单行日志
                const duration = Date.now() - context.startTime;
                this.publishEvent(SyncRetryEventType.RETRY_SUCCESS, {
                    ...context,
                    result,
                    totalAttempts: attempt,
                    duration
                });

                this.loggerService.logSystem('INFO',
                    `✅ 重试成功: ${context.operationName} (第${attempt}次尝试) 耗时:${(duration / 1000).toFixed(1)}s`
                );

                return result;

            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                lastError = error instanceof Error ? error : new Error(errorMessage);
                context.lastError = lastError;

                // 检查是否应该重试
                const shouldRetry = this.shouldRetry(error, config, attempt);

                if (attempt < config.maxAttempts && shouldRetry) {
                    // 🕐 计算动态延迟时间
                    const dynamicDelayMs = this.calculateDelayMs(context.operationName, attempt, config.delayMs || 0);

                    this.loggerService.logSystem('WARN',
                        `⚠️ 第${attempt}次尝试失败: ${context.operationName} - ${errorMessage}, ${dynamicDelayMs}ms后重试`
                    );

                    // 🔄 执行动态延迟
                    if (dynamicDelayMs > 0) {
                        this.syncDelay(dynamicDelayMs);
                    }
                } else {
                    break; // 不应该重试或已达最大次数
                }
            }
        }

        // 🚨 所有重试都失败了
        this.publishEvent(SyncRetryEventType.RETRY_FAILED, {
            ...context,
            finalError: lastError,
            totalAttempts: context.attempt,
            duration: Date.now() - context.startTime
        });

        this.loggerService.logSystem('ERROR',
            `❌ 重试失败: ${context.operationName} (${context.attempt}/${config.maxAttempts}次) 最终错误: ${lastError?.message || '未知错误'}`
        );

        throw lastError || new Error('重试操作失败');
    }

    /**
     * 🔄 执行异步重试循环（重试逻辑同步，但操作异步）
     */
    private async executeAsyncRetryLoop<T>(
        operation: AsyncRetryableOperation<T>,
        config: SyncRetryConfig,
        context: SyncRetryContext
    ): Promise<T> {
        let lastError: Error | null = null;

        for (let attempt = 1; attempt <= config.maxAttempts; attempt++) {
            context.attempt = attempt;

            // 发送重试尝试事件（移除日志）
            this.publishEvent(SyncRetryEventType.RETRY_ATTEMPT, {
                ...context,
                attempt,
                maxAttempts: config.maxAttempts
            });

            try {
                // 🎯 执行异步操作
                const result = await operation.execute();

                // 可选的结果验证
                if (operation.validate && !operation.validate(result)) {
                    throw new Error('操作结果验证失败');
                }

                // ✅ 成功 - 合并为单行日志
                const duration = Date.now() - context.startTime;
                this.publishEvent(SyncRetryEventType.RETRY_SUCCESS, {
                    ...context,
                    result,
                    totalAttempts: attempt,
                    duration
                });

                this.loggerService.logSystem('INFO',
                    `✅ 重试成功: ${context.operationName} (第${attempt}次尝试) 耗时:${(duration / 1000).toFixed(1)}s`
                );

                return result;

            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                lastError = error instanceof Error ? error : new Error(errorMessage);
                context.lastError = lastError;

                // 检查是否应该重试
                const shouldRetry = this.shouldRetry(error, config, attempt);

                if (attempt < config.maxAttempts && shouldRetry) {
                    // 🕐 计算动态延迟时间
                    const dynamicDelayMs = this.calculateDelayMs(context.operationName, attempt, config.delayMs || 0);

                    this.loggerService.logSystem('WARN',
                        `⚠️ 第${attempt}次尝试失败: ${context.operationName} - ${errorMessage}, ${dynamicDelayMs}ms后重试`
                    );

                    // 🔄 执行动态延迟
                    if (dynamicDelayMs > 0) {
                        this.syncDelay(dynamicDelayMs);
                    }
                } else {
                    break; // 不应该重试或已达最大次数
                }
            }
        }

        // 🚨 所有重试都失败了
        this.publishEvent(SyncRetryEventType.RETRY_FAILED, {
            ...context,
            finalError: lastError,
            totalAttempts: context.attempt,
            duration: Date.now() - context.startTime
        });

        this.loggerService.logSystem('ERROR',
            `❌ 重试失败: ${context.operationName} (${context.attempt}/${config.maxAttempts}次) 最终错误: ${lastError?.message || '未知错误'}`
        );

        throw lastError || new Error('重试操作失败');
    }

    /**
     * 🤔 判断是否应该重试
     */
    private shouldRetry(error: any, config: SyncRetryConfig, currentAttempt: number): boolean {
        // 检查重试次数
        if (currentAttempt >= config.maxAttempts) {
            return false;
        }

        // 检查错误类型
        const errorMessage = error instanceof Error ? error.message : String(error);
        const isRetryableError = config.retryableErrors.some(keyword =>
            errorMessage.includes(keyword)
        );

        return isRetryableError;
    }

    /**
     * 🕐 计算动态延迟时间
     */
    private calculateDelayMs(operationType: string, attempt: number, baseDelayMs: number): number {
        // 止损操作使用特殊的延迟序列：10s, 30s, 30s, 30s
        if (operationType === 'stop.loss') {
            switch (attempt) {
                case 1: return 10000;  // 第1次重试：10秒
                case 2: return 30000;  // 第2次重试：30秒
                case 3: return 30000;  // 第3次重试：30秒
                case 4: return 30000;  // 第4次重试：30秒
                default: return 30000; // 超出范围默认30秒
            }
        }

        // 清理操作使用渐进式延迟：30s, 30s, 30s
        if (operationType === 'position.cleanup') {
            switch (attempt) {
                case 1: return 30000;  // 第1次重试：30秒
                case 2: return 30000;  // 第2次重试：30秒
                case 3: return 30000;  // 第3次重试：30秒
                default: return 30000; // 超出范围默认30秒
            }
        }

        // 其他操作使用基础延迟时间
        return baseDelayMs;
    }

    /**
     * ⏱️ 同步延迟（阻塞式）
     */
    private syncDelay(ms: number): void {
        const start = Date.now();
        while (Date.now() - start < ms) {
            // 同步等待，保持执行上下文
        }
    }

    /**
     * 📡 发送事件（同步）
     */
    private publishEvent(eventType: string, data: any): void {
        try {
            // 同步发布事件，不等待
            this.eventBus.publish(eventType, data);
        } catch (error) {
            // 事件发布失败不应该影响主流程
            this.loggerService.logSystem('WARN', `事件发布失败: ${eventType}`);
        }
    }

    /**
     * 🔧 获取默认配置
     */
    getDefaultConfig(operationType: string): SyncRetryConfig | undefined {
        return this.defaultConfigs[operationType];
    }

    /**
     * 🔧 更新默认配置
     */
    updateDefaultConfig(operationType: string, config: Partial<SyncRetryConfig>): void {
        if (this.defaultConfigs[operationType]) {
            this.defaultConfigs[operationType] = {
                ...this.defaultConfigs[operationType],
                ...config
            };
        } else {
            this.defaultConfigs[operationType] = config as SyncRetryConfig;
        }
    }
} 