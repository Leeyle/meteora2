import 'reflect-metadata';
import { injectable, inject } from 'tsyringe';
import { TYPES, ILoggerService } from '../../types/interfaces';
import { StrategyRegistry } from './StrategyRegistry';
import { StrategyScheduler } from './StrategyScheduler';
import { StrategyStorage } from './storage/StrategyStorage';

export interface StrategyInstance {
    id: string;
    type: string;
    name: string;
    config: any;
    status: StrategyStatus;
    createdAt: Date;
    startedAt?: Date;
    stoppedAt?: Date;
    error?: string;
}

export enum StrategyStatus {
    CREATED = 'created',
    RUNNING = 'running',
    PAUSED = 'paused',
    STOPPED = 'stopped',
    ERROR = 'error'
}

export interface IStrategyManager {
    // 策略实例管理
    createInstance(type: string, name: string, config: any): Promise<string>;
    startInstance(instanceId: string): Promise<void>;
    stopInstance(instanceId: string): Promise<void>;
    pauseInstance(instanceId: string): Promise<void>;
    resumeInstance(instanceId: string): Promise<void>;
    deleteInstance(instanceId: string): Promise<void>;
    executeManualStopLoss(instanceId: string): Promise<void>;
    updateInstanceConfig(instanceId: string, config: any): Promise<void>;

    // 查询接口
    getInstance(instanceId: string): StrategyInstance | null;
    listInstances(): StrategyInstance[];
    getInstanceStatus(instanceId: string): StrategyStatus | null;

    // 系统管理
    initialize(): Promise<void>;
    shutdown(): Promise<void>;
}

@injectable()
export class StrategyManager implements IStrategyManager {
    private instances: Map<string, StrategyInstance> = new Map();
    private creatingStrategies: Map<string, boolean> = new Map(); // 🔒 防重复创建标记
    private isInitialized = false;

    constructor(
        @inject(TYPES.LoggerService) private logger: ILoggerService,
        @inject(TYPES.StrategyRegistry) private registry: StrategyRegistry,
        @inject(TYPES.StrategyScheduler) private scheduler: StrategyScheduler,
        @inject(TYPES.StrategyStorage) private storage: StrategyStorage
    ) { }

    async initialize(): Promise<void> {
        if (this.isInitialized) return;

        try {
            await this.logger.logSystem('INFO', '[StrategyManager] 初始化策略管理器...');

            // 初始化存储
            await this.storage.initialize();

            // 设置调度器的回调函数，避免循环依赖
            this.scheduler.setGetInstanceCallback((instanceId: string) => {
                return this.instances.get(instanceId) || null;
            });

            // 加载已存在的策略实例
            const savedInstances = await this.storage.loadInstances();
            for (const instance of savedInstances) {
                this.instances.set(instance.id, instance);

                // 重新设置执行器的实例配置（重要！）
                const executor = this.registry.getExecutor(instance.type);
                if (executor && typeof (executor as any).setInstanceConfig === 'function') {
                    (executor as any).setInstanceConfig(instance.id, instance.config);
                }

                // 如果实例之前在运行，暂停它们等待用户手动启动（避免钱包未解锁问题）
                if (instance.status === StrategyStatus.RUNNING) {
                    instance.status = StrategyStatus.PAUSED;
                    await this.storage.saveInstance(instance);
                    await this.logger.logSystem('INFO', `[StrategyManager] 策略实例已暂停等待手动启动: ${instance.id}`);
                }
            }

            // 启动调度器
            await this.scheduler.start();

            this.isInitialized = true;
            await this.logger.logSystem('INFO', `[StrategyManager] 策略管理器初始化完成，加载 ${this.instances.size} 个实例`);
        } catch (error) {
            await this.logger.logError('strategy-manager', '[StrategyManager] 初始化失败', error as Error);
            throw error;
        }
    }

    async createInstance(type: string, name: string, config: any): Promise<string> {
        // 🔒 防重复创建检查
        const creationKey = `${type}_${name}_${JSON.stringify(config)}`;
        if (this.creatingStrategies.has(creationKey)) {
            await this.logger.logSystem('WARN', `[StrategyManager] 策略正在创建中，忽略重复请求: ${name}`);
            throw new Error(`策略 "${name}" 正在创建中，请稍候`);
        }

        // 🔒 设置创建标记
        this.creatingStrategies.set(creationKey, true);

        try {
            // 验证策略类型
            const executor = this.registry.getExecutor(type);
            if (!executor) {
                throw new Error(`不支持的策略类型: ${type}`);
            }

            // 生成实例ID
            const instanceId = this.generateInstanceId(type);

            // 创建实例
            const instance: StrategyInstance = {
                id: instanceId,
                type,
                name,
                config,
                status: StrategyStatus.CREATED,
                createdAt: new Date()
            };

            // 初始化执行器
            await executor.initialize(config);

            // 设置执行器的实例配置（重要！）
            if (executor && typeof (executor as any).setInstanceConfig === 'function') {
                (executor as any).setInstanceConfig(instanceId, config);
            }

            // 保存实例
            this.instances.set(instanceId, instance);
            await this.storage.saveInstance(instance);

            await this.logger.logBusinessOperation('策略创建', {
                instanceId,
                name,
                type,
                message: `[StrategyManager] 策略实例创建成功: ${instanceId} (${name})`
            });
            return instanceId;
        } catch (error) {
            await this.logger.logError('strategy-manager', '[StrategyManager] 创建策略实例失败', error as Error);
            throw error;
        } finally {
            // 🔓 清除创建标记
            this.creatingStrategies.delete(creationKey);
        }
    }

    async startInstance(instanceId: string): Promise<void> {
        const instance = this.instances.get(instanceId);
        if (!instance) {
            throw new Error(`策略实例不存在: ${instanceId}`);
        }

        if (instance.status === StrategyStatus.RUNNING) {
            await this.logger.logSystem('WARN', `[StrategyManager] 策略实例已在运行: ${instanceId}`);
            return;
        }

        try {
            // 更新状态
            instance.status = StrategyStatus.RUNNING;
            instance.startedAt = new Date();
            delete instance.error; // 清除error字段

            // 保存状态
            await this.storage.saveInstance(instance);

            // 🔧 关键修复：设置执行器的实例配置
            const executor = this.registry.getExecutor(instance.type);
            if (executor && typeof (executor as any).setInstanceConfig === 'function') {
                // 🔧 新增：启动前先清理旧状态，确保重新初始化
                if (typeof (executor as any).cleanup === 'function') {
                    try {
                        await (executor as any).cleanup(instanceId);
                        await this.logger.logSystem('INFO', `[StrategyManager] 策略实例旧状态已清理: ${instanceId}`);
                    } catch (cleanupError) {
                        await this.logger.logSystem('WARN', `[StrategyManager] 清理旧状态失败: ${instanceId} - ${cleanupError}`);
                    }
                }

                (executor as any).setInstanceConfig(instance.id, instance.config);
                await this.logger.logSystem('INFO', `[StrategyManager] 策略实例配置已设置: ${instanceId}`);
            }

            // 添加到调度器
            await this.scheduler.scheduleStrategy(instanceId);

            // 🚀 关键修复：立即执行一次策略，实现事件驱动的即时响应
            if (executor) {
                await this.logger.logSystem('INFO', `[StrategyManager] 立即执行策略初始化: ${instanceId}`);
                try {
                    await executor.execute(instanceId);
                    await this.logger.logSystem('INFO', `[StrategyManager] 策略初始化执行成功: ${instanceId}`);
                } catch (executeError) {
                    await this.logger.logError('strategy-manager', `[StrategyManager] 策略初始化执行失败: ${instanceId}`, executeError as Error);
                    // 初始化失败不影响启动状态，由调度器继续处理
                }
            }

            await this.logger.logBusinessOperation('策略启动', {
                instanceId,
                message: `[StrategyManager] 策略实例启动成功: ${instanceId}`
            });
        } catch (error) {
            instance.status = StrategyStatus.ERROR;
            instance.error = (error as Error).message;
            await this.storage.saveInstance(instance);

            await this.logger.logError('strategy-manager', `[StrategyManager] 启动策略实例失败: ${instanceId}`, error as Error);
            throw error;
        }
    }

    async stopInstance(instanceId: string): Promise<void> {
        const instance = this.instances.get(instanceId);
        if (!instance) {
            throw new Error(`策略实例不存在: ${instanceId}`);
        }

        try {
            // 从调度器移除
            await this.scheduler.unscheduleStrategy(instanceId);

            // 更新状态
            instance.status = StrategyStatus.STOPPED;
            instance.stoppedAt = new Date();

            // 保存状态
            await this.storage.saveInstance(instance);

            await this.logger.logBusinessOperation('策略停止', {
                instanceId,
                message: `[StrategyManager] 策略实例停止成功: ${instanceId}`
            });
        } catch (error) {
            await this.logger.logError('strategy-manager', `[StrategyManager] 停止策略实例失败: ${instanceId}`, error as Error);
            throw error;
        }
    }

    async pauseInstance(instanceId: string): Promise<void> {
        const instance = this.instances.get(instanceId);
        if (!instance) {
            throw new Error(`策略实例不存在: ${instanceId}`);
        }

        if (instance.status !== StrategyStatus.RUNNING) {
            throw new Error(`只能暂停运行中的策略实例`);
        }

        try {
            // 从调度器移除
            await this.scheduler.unscheduleStrategy(instanceId);

            // 更新状态
            instance.status = StrategyStatus.PAUSED;

            // 保存状态
            await this.storage.saveInstance(instance);

            await this.logger.logBusinessOperation('策略暂停', {
                instanceId,
                message: `[StrategyManager] 策略实例暂停成功: ${instanceId}`
            });
        } catch (error) {
            await this.logger.logError('strategy-manager', `[StrategyManager] 暂停策略实例失败: ${instanceId}`, error as Error);
            throw error;
        }
    }

    async resumeInstance(instanceId: string): Promise<void> {
        const instance = this.instances.get(instanceId);
        if (!instance) {
            throw new Error(`策略实例不存在: ${instanceId}`);
        }

        if (instance.status !== StrategyStatus.PAUSED) {
            throw new Error(`只能恢复暂停的策略实例`);
        }

        try {
            // 更新状态
            instance.status = StrategyStatus.RUNNING;
            instance.startedAt = new Date();

            // 保存状态
            await this.storage.saveInstance(instance);

            // 🔧 关键修复：设置执行器的实例配置
            const executor = this.registry.getExecutor(instance.type);
            if (executor && typeof (executor as any).setInstanceConfig === 'function') {
                // 🔧 新增：恢复前先清理旧状态，确保重新初始化
                if (typeof (executor as any).cleanup === 'function') {
                    try {
                        await (executor as any).cleanup(instanceId);
                        await this.logger.logSystem('INFO', `[StrategyManager] 策略实例旧状态已清理: ${instanceId}`);
                    } catch (cleanupError) {
                        await this.logger.logSystem('WARN', `[StrategyManager] 清理旧状态失败: ${instanceId} - ${cleanupError}`);
                    }
                }

                (executor as any).setInstanceConfig(instance.id, instance.config);
                await this.logger.logSystem('INFO', `[StrategyManager] 策略实例配置已设置: ${instanceId}`);
            }

            // 添加到调度器
            await this.scheduler.scheduleStrategy(instanceId);

            await this.logger.logBusinessOperation('策略恢复', {
                instanceId,
                message: `[StrategyManager] 策略实例恢复成功: ${instanceId}`
            });
        } catch (error) {
            await this.logger.logError('strategy-manager', `[StrategyManager] 恢复策略实例失败: ${instanceId}`, error as Error);
            throw error;
        }
    }

    async deleteInstance(instanceId: string): Promise<void> {
        const instance = this.instances.get(instanceId);
        if (!instance) {
            throw new Error(`策略实例不存在: ${instanceId}`);
        }

        try {
            // 先停止实例
            if (instance.status === StrategyStatus.RUNNING) {
                await this.stopInstance(instanceId);
            }

            // 执行清理
            const executor = this.registry.getExecutor(instance.type);
            if (executor) {
                await executor.cleanup(instanceId);
            }

            // 删除实例
            this.instances.delete(instanceId);
            await this.storage.deleteInstance(instanceId);

            await this.logger.logBusinessOperation('策略删除', {
                instanceId,
                message: `[StrategyManager] 策略实例删除成功: ${instanceId}`
            });
        } catch (error) {
            await this.logger.logError('strategy-manager', `[StrategyManager] 删除策略实例失败: ${instanceId}`, error as Error);
            throw error;
        }
    }

    /**
     * 🛑 执行手动止损
     */
    async executeManualStopLoss(instanceId: string): Promise<void> {
        const instance = this.instances.get(instanceId);
        if (!instance) {
            throw new Error(`策略实例不存在: ${instanceId}`);
        }

        if (instance.status !== StrategyStatus.RUNNING) {
            throw new Error(`只能对运行中的策略执行手动止损`);
        }

        try {
            await this.logger.logBusinessOperation('手动止损', {
                instanceId,
                message: `[StrategyManager] 开始执行手动止损: ${instanceId}`
            });

            // 获取策略执行器
            const executor = this.registry.getExecutor(instance.type);
            if (!executor) {
                throw new Error(`未找到策略执行器: ${instance.type}`);
            }

            // 检查执行器是否支持手动止损
            if (typeof (executor as any).executeManualStopLoss === 'function') {
                // 直接调用执行器的手动止损方法
                await (executor as any).executeManualStopLoss(instanceId);
            } else {
                throw new Error(`策略类型 ${instance.type} 不支持手动止损功能`);
            }

            await this.logger.logBusinessOperation('手动止损', {
                instanceId,
                message: `[StrategyManager] 手动止损执行成功: ${instanceId}`
            });
        } catch (error) {
            await this.logger.logError('strategy-manager', `[StrategyManager] 手动止损执行失败: ${instanceId}`, error as Error);
            throw error;
        }
    }

    /**
     * 更新策略实例配置
     */
    async updateInstanceConfig(instanceId: string, config: any): Promise<void> {
        const instance = this.instances.get(instanceId);
        if (!instance) {
            throw new Error(`策略实例不存在: ${instanceId}`);
        }

        if (instance.status !== StrategyStatus.STOPPED) {
            throw new Error(`只能更新已停止的策略实例配置`);
        }

        try {
            await this.logger.logBusinessOperation('配置更新', {
                instanceId,
                message: `[StrategyManager] 开始更新策略配置: ${instanceId}`
            });

            // 更新实例配置
            instance.config = { ...instance.config, ...config };

            // 保存更新后的实例
            await this.storage.saveInstance(instance);

            // 更新执行器配置
            const executor = this.registry.getExecutor(instance.type);
            if (executor && typeof (executor as any).setInstanceConfig === 'function') {
                (executor as any).setInstanceConfig(instanceId, instance.config);
            }

            await this.logger.logBusinessOperation('配置更新', {
                instanceId,
                message: `[StrategyManager] 策略配置更新成功: ${instanceId}`
            });
        } catch (error) {
            await this.logger.logError('strategy-manager', `[StrategyManager] 更新策略配置失败: ${instanceId}`, error as Error);
            throw error;
        }
    }

    getInstance(instanceId: string): StrategyInstance | null {
        return this.instances.get(instanceId) || null;
    }

    listInstances(): StrategyInstance[] {
        return Array.from(this.instances.values());
    }

    getInstanceStatus(instanceId: string): StrategyStatus | null {
        const instance = this.instances.get(instanceId);
        return instance ? instance.status : null;
    }

    async shutdown(): Promise<void> {
        try {
            await this.logger.logSystem('INFO', '[StrategyManager] 关闭策略管理器...');

            // 停止所有运行中的实例
            const runningInstances = Array.from(this.instances.values())
                .filter(instance => instance.status === StrategyStatus.RUNNING);

            for (const instance of runningInstances) {
                await this.stopInstance(instance.id);
            }

            // 关闭调度器
            await this.scheduler.stop();

            this.isInitialized = false;
            await this.logger.logSystem('INFO', '[StrategyManager] 策略管理器已关闭');
        } catch (error) {
            await this.logger.logError('strategy-manager', '[StrategyManager] 关闭策略管理器失败', error as Error);
            throw error;
        }
    }

    private generateInstanceId(type: string): string {
        const timestamp = Date.now();
        const random = Math.random().toString(36).substring(2, 8);
        return `${type}_${timestamp}_${random}`;
    }
} 