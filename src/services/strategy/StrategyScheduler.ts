import 'reflect-metadata';
import { injectable, inject } from 'tsyringe';
import { TYPES, ILoggerService } from '../../types/interfaces';
import { StrategyRegistry, IStrategyExecutor } from './StrategyRegistry';

export interface StrategyRuntime {
    instanceId: string;
    isActive: boolean;
    startTime: Date;
    executionStatus: 'initializing' | 'running' | 'stopped' | 'error';
    errorCount: number;
    lastError?: string;
}

export interface SchedulerConfig {
    maxConcurrency: number;
    retryDelayMs: number;
    maxRetries: number;
}

/**
 * 事件驱动策略调度器 v2.0
 * 负责策略的一次性启动，不进行重复调度
 * 每个策略内部自主管理监控和事件响应
 */
@injectable()
export class StrategyScheduler {
    private runtimeMap: Map<string, StrategyRuntime> = new Map();
    private isRunning = false;
    private config: SchedulerConfig;
    private activeCount = 0;

    // 存储实例信息的回调函数，避免循环依赖
    private getInstanceCallback?: (instanceId: string) => any;

    constructor(
        @inject(TYPES.LoggerService) private logger: ILoggerService,
        @inject(TYPES.StrategyRegistry) private registry: StrategyRegistry
    ) {
        this.config = {
            maxConcurrency: 10,
            retryDelayMs: 5000,
            maxRetries: 3
        };
    }

    // 设置获取实例信息的回调函数，避免循环依赖
    setGetInstanceCallback(callback: (instanceId: string) => any): void {
        this.getInstanceCallback = callback;
    }

    async start(): Promise<void> {
        if (this.isRunning) {
            await this.logger.logSystem('WARN', '[StrategyScheduler] 调度器已在运行');
            return;
        }

        this.isRunning = true;
        await this.logger.logSystem('INFO', '[StrategyScheduler] 事件驱动调度器启动成功 v2.0');
    }

    async stop(): Promise<void> {
        if (!this.isRunning) {
            return;
        }

        // 停止所有活跃策略
        for (const [instanceId, runtime] of this.runtimeMap) {
            if (runtime.isActive) {
                await this.stopStrategy(instanceId);
            }
        }

        this.runtimeMap.clear();
        this.isRunning = false;
        this.activeCount = 0;

        await this.logger.logSystem('INFO', '[StrategyScheduler] 调度器已停止');
    }

    /**
     * 启动策略 - 一次性执行，不重复调度
     * 策略启动后由其内部事件驱动机制自主运行
     */
    async scheduleStrategy(instanceId: string): Promise<void> {
        if (!this.isRunning) {
            throw new Error('调度器未运行');
        }

        if (this.runtimeMap.has(instanceId)) {
            await this.logger.logSystem('WARN', `[StrategyScheduler] 策略已在运行: ${instanceId}`);
            return;
        }

        // 检查并发限制
        if (this.activeCount >= this.config.maxConcurrency) {
            throw new Error(`达到最大并发限制: ${this.config.maxConcurrency}`);
        }

        const runtime: StrategyRuntime = {
            instanceId,
            isActive: true,
            startTime: new Date(),
            executionStatus: 'initializing',
            errorCount: 0
        };

        this.runtimeMap.set(instanceId, runtime);
        this.activeCount++;

        try {
            await this.logger.logSystem('INFO', `[StrategyScheduler] 启动策略: ${instanceId}`);

            // 获取策略实例信息
            const instance = this.getInstanceCallback ? this.getInstanceCallback(instanceId) : null;
            if (!instance) {
                throw new Error(`策略实例不存在: ${instanceId}`);
            }

            // 获取执行器
            const executor = this.registry.getExecutor(instance.type);
            if (!executor) {
                throw new Error(`策略执行器不存在: ${instance.type}`);
            }

            // 一次性启动策略，后续由策略自主运行
            await executor.execute(instanceId);

            runtime.executionStatus = 'running';
            await this.logger.logSystem('INFO', `[StrategyScheduler] ✅ 策略启动成功: ${instanceId} (事件驱动模式)`);

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            runtime.lastError = errorMessage;
            runtime.errorCount++;
            runtime.executionStatus = 'error';

            await this.logger.logError('strategy-scheduler', `[StrategyScheduler] 策略启动失败: ${instanceId}`, error as Error);

            // 清理失败的策略
            this.runtimeMap.delete(instanceId);
            this.activeCount--;

            throw error;
        }
    }

    /**
     * 停止策略
     */
    async stopStrategy(instanceId: string): Promise<void> {
        const runtime = this.runtimeMap.get(instanceId);
        if (!runtime) {
            await this.logger.logSystem('WARN', `[StrategyScheduler] 策略不存在: ${instanceId}`);
            return;
        }

        try {
            // 获取执行器并停止策略
            const instance = this.getInstanceCallback ? this.getInstanceCallback(instanceId) : null;
            if (instance) {
                const executor = this.registry.getExecutor(instance.type);
                if (executor && 'stop' in executor && typeof (executor as any).stop === 'function') {
                    await (executor as any).stop(instanceId);
                }
            }

            runtime.isActive = false;
            runtime.executionStatus = 'stopped';
            this.activeCount--;

            await this.logger.logSystem('INFO', `[StrategyScheduler] 策略已停止: ${instanceId}`);

        } catch (error) {
            await this.logger.logError('strategy-scheduler', `[StrategyScheduler] 停止策略失败: ${instanceId}`, error as Error);
            throw error;
        }
    }

    /**
     * 移除策略调度（清理资源）
     */
    async unscheduleStrategy(instanceId: string): Promise<void> {
        await this.stopStrategy(instanceId);
        this.runtimeMap.delete(instanceId);

        await this.logger.logSystem('INFO', `[StrategyScheduler] 策略调度已移除: ${instanceId}`);
    }

    getStrategyRuntime(instanceId: string): StrategyRuntime | null {
        return this.runtimeMap.get(instanceId) || null;
    }

    getAllRuntimes(): StrategyRuntime[] {
        return Array.from(this.runtimeMap.values());
    }

    getSchedulerStats(): {
        isRunning: boolean;
        activeCount: number;
        totalScheduled: number;
        maxConcurrency: number;
    } {
        return {
            isRunning: this.isRunning,
            activeCount: this.activeCount,
            totalScheduled: this.runtimeMap.size,
            maxConcurrency: this.config.maxConcurrency
        };
    }

    /**
     * 检查策略健康状态
     */
    isStrategyHealthy(instanceId: string): boolean {
        const runtime = this.runtimeMap.get(instanceId);
        return runtime ?
            runtime.isActive &&
            runtime.executionStatus === 'running' &&
            runtime.errorCount < this.config.maxRetries : false;
    }

    /**
     * 获取所有活跃策略
     */
    getActiveStrategies(): string[] {
        return Array.from(this.runtimeMap.entries())
            .filter(([_, runtime]) => runtime.isActive && runtime.executionStatus === 'running')
            .map(([instanceId, _]) => instanceId);
    }
} 