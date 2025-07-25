import { DIContainer } from '../../../../di/container';
import { TYPES } from '../../../../types/interfaces';
import { SynchronousRetryManager, SyncRetryableOperation, AsyncRetryableOperation, SyncRetryConfig } from '../../../modules/SynchronousRetryManager';

/**
 * 🔄 同步重试混入器
 * 
 * 为策略执行器提供简洁的重试功能接口
 * 核心特点：
 * 1. 完全同步执行，保证状态一致性
 * 2. 简单易用的包装方法
 * 3. 与现有代码无缝集成
 */
export class SynchronousRetryMixin {
    private retryManager: SynchronousRetryManager;

    constructor() {
        const diContainer = DIContainer.getInstance();
        this.retryManager = diContainer.getService<SynchronousRetryManager>(TYPES.SynchronousRetryManager);
    }

    /**
     * 🎯 执行带重试的头寸关闭操作
     */
    protected executeClosePositionWithRetry<T>(
        operation: () => T,
        instanceId: string,
        customConfig?: Partial<SyncRetryConfig>
    ): T {
        const retryableOperation: SyncRetryableOperation<T> = {
            execute: operation
        };

        return this.retryManager.executeWithRetry(
            retryableOperation,
            'position.close',
            instanceId,
            customConfig
        );
    }

    /**
     * 🎯 执行带重试的异步头寸关闭操作
     */
    protected async executeAsyncClosePositionWithRetry<T>(
        operation: () => Promise<T>,
        instanceId: string,
        customConfig?: Partial<SyncRetryConfig>
    ): Promise<T> {
        const retryableOperation: AsyncRetryableOperation<T> = {
            execute: operation
        };

        return this.retryManager.executeAsyncWithRetry(
            retryableOperation,
            'position.close',
            instanceId,
            customConfig
        );
    }

    /**
     * 🎯 执行带重试的头寸创建操作
     */
    protected executeCreatePositionWithRetry<T>(
        operation: () => T,
        instanceId: string,
        customConfig?: Partial<SyncRetryConfig>
    ): T {
        const retryableOperation: SyncRetryableOperation<T> = {
            execute: operation
        };

        return this.retryManager.executeWithRetry(
            retryableOperation,
            'position.create',
            instanceId,
            customConfig
        );
    }

    /**
     * 🎯 执行带重试的异步头寸创建操作
     */
    protected async executeAsyncCreatePositionWithRetry<T>(
        operation: () => Promise<T>,
        instanceId: string,
        customConfig?: Partial<SyncRetryConfig>
    ): Promise<T> {
        const retryableOperation: AsyncRetryableOperation<T> = {
            execute: operation
        };

        return this.retryManager.executeAsyncWithRetry(
            retryableOperation,
            'position.create',
            instanceId,
            customConfig
        );
    }

    /**
     * 🎯 执行带重试的超出范围处理操作
     */
    protected executeOutOfRangeHandlerWithRetry<T>(
        operation: () => T,
        instanceId: string,
        customConfig?: Partial<SyncRetryConfig>
    ): T {
        const retryableOperation: SyncRetryableOperation<T> = {
            execute: operation
        };

        return this.retryManager.executeWithRetry(
            retryableOperation,
            'outOfRange.handler',
            instanceId,
            customConfig
        );
    }

    /**
     * 🔧 执行通用重试操作
     */
    protected executeWithRetry<T>(
        operation: () => T,
        operationType: string,
        instanceId: string,
        customConfig?: Partial<SyncRetryConfig>
    ): T {
        const retryableOperation: SyncRetryableOperation<T> = {
            execute: operation
        };

        return this.retryManager.executeWithRetry(
            retryableOperation,
            operationType,
            instanceId,
            customConfig
        );
    }

    /**
     * 🔧 执行带结果验证的重试操作
     */
    protected executeWithRetryAndValidation<T>(
        operation: () => T,
        validator: (result: T) => boolean,
        operationType: string,
        instanceId: string,
        customConfig?: Partial<SyncRetryConfig>
    ): T {
        const retryableOperation: SyncRetryableOperation<T> = {
            execute: operation,
            validate: validator
        };

        return this.retryManager.executeWithRetry(
            retryableOperation,
            operationType,
            instanceId,
            customConfig
        );
    }

    /**
     * 🛑 执行带重试的止损操作
     */
    protected executeStopLossWithRetry<T>(
        operation: () => T,
        instanceId: string,
        customConfig?: Partial<SyncRetryConfig>
    ): T {
        const retryableOperation: SyncRetryableOperation<T> = {
            execute: operation
        };

        return this.retryManager.executeWithRetry(
            retryableOperation,
            'stop.loss',
            instanceId,
            customConfig
        );
    }

    /**
     * 🛑 执行带重试的异步止损操作
     */
    protected async executeAsyncStopLossWithRetry<T>(
        operation: () => Promise<T>,
        instanceId: string,
        customConfig?: Partial<SyncRetryConfig>
    ): Promise<T> {
        const retryableOperation: AsyncRetryableOperation<T> = {
            execute: operation
        };

        return this.retryManager.executeAsyncWithRetry(
            retryableOperation,
            'stop.loss',
            instanceId,
            customConfig
        );
    }

    /**
     * 🔄 执行带重试的止损X代币卖出操作
     */
    protected async executeStopLossTokenSwapWithRetry<T>(
        operation: () => Promise<T>,
        instanceId: string,
        customConfig?: Partial<SyncRetryConfig>
    ): Promise<T> {
        const retryableOperation: AsyncRetryableOperation<T> = {
            execute: operation
        };

        return this.retryManager.executeAsyncWithRetry(
            retryableOperation,
            'stop.loss.token.swap',
            instanceId,
            customConfig
        );
    }

    /**
     * 🧹 执行带重试的清理操作
     */
    protected async executeCleanupWithRetry<T>(
        operation: () => Promise<T>,
        instanceId: string,
        retryCount: number = 0
    ): Promise<T> {
        // 🔥 动态计算延迟时间：30秒、30秒、30秒
        const delayMs = retryCount === 0 ? 30000 : 30000;

        const customConfig: Partial<SyncRetryConfig> = {
            maxAttempts: 3,
            retryableErrors: [
                '交易验证超时', '交易失败', 'RPC_ERROR', 'NETWORK_ERROR',
                'SLIPPAGE_ERROR', '头寸关闭失败', '头寸不存在', '不属于当前用户',
                'position does not exist', 'Position not found'
            ],
            delayMs: delayMs
        };

        const retryableOperation: AsyncRetryableOperation<T> = {
            execute: operation,
            validate: (result: any) => {
                // 验证清理是否成功
                return result && result.success === true;
            }
        };

        return this.retryManager.executeAsyncWithRetry(
            retryableOperation,
            'position.cleanup',
            instanceId,
            customConfig
        );
    }

    /**
     * 🧹 执行带智能重试的批量清理操作
     */
    protected async executeBatchCleanupWithRetry<T>(
        cleanupTargets: string[],
        cleanupFunction: (positionAddress: string) => Promise<any>,
        instanceId: string,
        retryCount: number = 0
    ): Promise<T[]> {
        const results: T[] = [];

        for (const positionAddress of cleanupTargets) {
            try {
                const result = await this.executeCleanupWithRetry(
                    () => cleanupFunction(positionAddress),
                    instanceId,
                    retryCount
                );
                results.push(result);
            } catch (error) {
                // 单个头寸清理失败，记录但继续清理其他头寸
                throw new Error(`头寸 ${positionAddress.substring(0, 8)}... 清理失败: ${error instanceof Error ? error.message : String(error)}`);
            }
        }

        return results;
    }
} 