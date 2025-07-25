import 'reflect-metadata';
import { injectable, inject } from 'tsyringe';
import { TYPES, ILoggerService } from '../../types/interfaces';

export interface IStrategyExecutor {
    // 执行器基本信息
    getType(): string;
    getVersion(): string;

    // 执行接口
    initialize(config: any): Promise<void>;
    execute(instanceId: string): Promise<void>;
    cleanup(instanceId: string): Promise<void>;

    // 状态查询
    getStatus(instanceId: string): ExecutorStatus;
}

export interface ExecutorStatus {
    isRunning: boolean;
    lastExecutionTime?: Date;
    nextExecutionTime?: Date;
    error?: string | null;
    metrics?: any;
}

@injectable()
export class StrategyRegistry {
    private executors: Map<string, IStrategyExecutor> = new Map();

    constructor(
        @inject(TYPES.LoggerService) private logger: ILoggerService
    ) { }

    /**
     * 注册策略执行器
     */
    async register(type: string, executor: IStrategyExecutor): Promise<void> {
        if (this.executors.has(type)) {
            await this.logger.logSystem('WARN', `[StrategyRegistry] 策略类型已存在，将覆盖: ${type}`);
        }

        this.executors.set(type, executor);
        await this.logger.logSystem('INFO', `[StrategyRegistry] 注册策略执行器: ${type} v${executor.getVersion()}`);
    }

    /**
     * 获取执行器
     */
    getExecutor(type: string): IStrategyExecutor | null {
        return this.executors.get(type) || null;
    }

    /**
     * 获取所有支持的策略类型
     */
    getSupportedTypes(): string[] {
        return Array.from(this.executors.keys());
    }

    /**
     * 检查策略类型是否支持
     */
    isSupported(type: string): boolean {
        return this.executors.has(type);
    }

    /**
     * 获取所有已注册的执行器信息
     */
    getExecutorInfo(): Array<{ type: string; version: string }> {
        return Array.from(this.executors.entries()).map(([type, executor]) => ({
            type,
            version: executor.getVersion()
        }));
    }

    /**
     * 取消注册执行器
     */
    async unregister(type: string): Promise<boolean> {
        const removed = this.executors.delete(type);
        if (removed) {
            await this.logger.logSystem('INFO', `[StrategyRegistry] 取消注册策略执行器: ${type}`);
        }
        return removed;
    }
} 