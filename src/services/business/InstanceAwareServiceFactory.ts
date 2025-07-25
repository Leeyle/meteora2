/**
 * 实例感知的服务工厂
 * 
 * 职责：
 * - 为每个策略实例创建独立的数据服务实例
 * - 管理实例级服务的生命周期
 * - 确保实例间数据完全隔离
 * 
 * 架构优势：
 * - 保持底层服务接口不变
 * - 在工厂层统一处理实例隔离
 * - 策略执行器只需关心业务逻辑
 */

import { injectable, inject } from 'tsyringe';
import { ILoggerService, IConfigService, IStateService, IMeteoraService, IPositionManager, IPositionFeeHarvester, IJupiterService, IWalletService, ISolanaWeb3Service, TYPES } from '../../types/interfaces';
import { PositionAnalyticsService } from './PositionAnalyticsService';
import { UnifiedDataProvider } from './analytics/UnifiedDataProvider';
import { YieldAnalyzer } from './analytics/YieldAnalyzer';
import { YieldOperator } from './analytics/YieldOperator';
import { AccumulatedYieldManager } from './analytics/AccumulatedYieldManager';
import { SmartStopLossModule } from '../modules/SmartStopLossModule';
import { SynchronousRetryManager } from '../modules/SynchronousRetryManager';

/**
 * 实例级服务容器
 */
interface InstanceServiceContainer {
    instanceId: string;
    unifiedDataProvider: UnifiedDataProvider;
    yieldAnalyzer: YieldAnalyzer;
    yieldOperator: YieldOperator;
    accumulatedYieldManager: AccumulatedYieldManager;
    positionAnalyticsService: PositionAnalyticsService;
    smartStopLossModule?: SmartStopLossModule;
    createdAt: number;
    lastAccessedAt: number;
}

@injectable()
export class InstanceAwareServiceFactory {
    // 实例级服务容器存储
    private instanceServices: Map<string, InstanceServiceContainer> = new Map();

    // 清理配置
    private readonly CLEANUP_INTERVAL = 24 * 60 * 60 * 1000; // 24小时
    private readonly INACTIVE_THRESHOLD = 2 * 60 * 60 * 1000; // 2小时未使用则清理

    constructor(
        @inject(TYPES.LoggerService) private loggerService: ILoggerService,
        @inject(TYPES.ConfigService) private configService: IConfigService,
        @inject(TYPES.StateService) private stateService: IStateService,
        @inject(TYPES.MeteoraService) private meteoraService: IMeteoraService,
        @inject(TYPES.PositionManager) private positionManager: IPositionManager,
        @inject(TYPES.PositionFeeHarvester) private feeHarvester: IPositionFeeHarvester,
        @inject(TYPES.JupiterService) private jupiterService: IJupiterService,
        @inject(TYPES.WalletService) private walletService: IWalletService,
        @inject(TYPES.SynchronousRetryManager) private retryManager: SynchronousRetryManager,
        @inject(TYPES.SolanaWeb3Service) private solanaService: ISolanaWeb3Service
    ) {
        // 启动定期清理任务
        this.startCleanupTask();
    }

    /**
     * 为指定实例创建完整的PositionAnalyticsService
     */
    async createAnalyticsServiceForInstance(instanceId: string): Promise<PositionAnalyticsService> {
        let container = this.instanceServices.get(instanceId);

        if (!container) {
            await this.loggerService.logSystem('INFO',
                `🏭 开始为实例 [${instanceId}] 创建独立的服务栈`
            );

            container = await this.createInstanceServiceContainer(instanceId);
            this.instanceServices.set(instanceId, container);

            await this.loggerService.logSystem('INFO',
                `✅ 实例 [${instanceId}] 服务栈创建完成 (当前实例总数: ${this.instanceServices.size})`
            );
        }

        // 更新最后访问时间
        container.lastAccessedAt = Date.now();

        return container.positionAnalyticsService;
    }

    /**
     * 为指定实例创建SmartStopLossModule
     */
    createSmartStopLossModuleForInstance(instanceId: string, config: any): SmartStopLossModule {
        const container = this.instanceServices.get(instanceId);

        if (container && !container.smartStopLossModule) {
            container.smartStopLossModule = new SmartStopLossModule(config);

            this.loggerService.logSystem('DEBUG',
                `🛡️ 为实例 [${instanceId}] 创建智能止损模块`
            );
        }

        return container?.smartStopLossModule || new SmartStopLossModule(config);
    }

    /**
     * 创建实例级服务容器
     */
    private async createInstanceServiceContainer(instanceId: string): Promise<InstanceServiceContainer> {
        // 🔥 步骤1: 创建独立的AccumulatedYieldManager实例
        const accumulatedYieldManager = new AccumulatedYieldManager(this.loggerService);
        await accumulatedYieldManager.initialize();

        // 🔥 步骤2: 创建独立的UnifiedDataProvider实例
        const unifiedDataProvider = new UnifiedDataProvider(
            this.loggerService,
            this.feeHarvester,
            this.meteoraService,
            this.positionManager,
            accumulatedYieldManager
        );

        // 🔥 步骤3: 创建独立的YieldAnalyzer实例
        const yieldAnalyzer = new YieldAnalyzer(
            this.loggerService,
            unifiedDataProvider,
            accumulatedYieldManager
        );

        // 🔥 步骤4: 创建独立的YieldOperator实例
        const yieldOperator = new YieldOperator(
            this.loggerService,
            this.feeHarvester,
            this.jupiterService,
            this.walletService,
            this.meteoraService,
            this.positionManager,
            this.retryManager,
            this.solanaService, // 🔧 添加缺少的SolanaWeb3Service参数
            accumulatedYieldManager
        );

        // 🔥 步骤5: 创建独立的PositionAnalyticsService实例
        const positionAnalyticsService = new PositionAnalyticsService(
            this.loggerService,
            this.configService,
            this.stateService,
            unifiedDataProvider,
            yieldAnalyzer,
            yieldOperator,
            this.meteoraService,
            accumulatedYieldManager,
            this.positionManager
        );

        // 🆕 设置实例ID，用于实例级日志记录
        positionAnalyticsService.setInstanceId(instanceId);

        const container: InstanceServiceContainer = {
            instanceId,
            unifiedDataProvider,
            yieldAnalyzer,
            yieldOperator,
            accumulatedYieldManager,
            positionAnalyticsService,
            createdAt: Date.now(),
            lastAccessedAt: Date.now()
        };

        await this.loggerService.logSystem('DEBUG',
            `📦 实例 [${instanceId}] 服务容器创建完成 - 包含服务: UnifiedDataProvider, YieldAnalyzer, YieldOperator, AccumulatedYieldManager, PositionAnalyticsService`
        );

        return container;
    }

    /**
     * 获取实例的服务容器（用于调试）
     */
    getInstanceContainer(instanceId: string): InstanceServiceContainer | undefined {
        const container = this.instanceServices.get(instanceId);
        if (container) {
            container.lastAccessedAt = Date.now();
        }
        return container;
    }

    /**
     * 手动清理指定实例的服务
     */
    async cleanupInstance(instanceId: string): Promise<boolean> {
        const container = this.instanceServices.get(instanceId);
        if (!container) {
            return false;
        }

        try {
            // 停止PositionAnalyticsService监控
            if (container.positionAnalyticsService) {
                await container.positionAnalyticsService.stopMonitoring();
                await container.positionAnalyticsService.destroy();
            }

            // 清理其他服务资源（如果有需要）
            // ... 

            this.instanceServices.delete(instanceId);

            await this.loggerService.logSystem('INFO',
                `🗑️ 实例 [${instanceId}] 服务栈已清理 (剩余实例: ${this.instanceServices.size})`
            );

            return true;

        } catch (error) {
            await this.loggerService.logSystem('ERROR',
                `❌ 清理实例 [${instanceId}] 服务栈失败: ${error instanceof Error ? error.message : String(error)}`
            );
            return false;
        }
    }

    /**
     * 获取所有实例统计信息
     */
    getInstanceStats(): {
        totalInstances: number;
        instances: Array<{
            instanceId: string;
            services: string[];
            hasSmartStopLoss: boolean;
            createdAt: number;
            lastAccessed: number;
            activeTime: string;
        }>;
    } {
        const now = Date.now();
        const instances = Array.from(this.instanceServices.values()).map(container => ({
            instanceId: container.instanceId,
            services: [
                'UnifiedDataProvider',
                'YieldAnalyzer',
                'YieldOperator',
                'AccumulatedYieldManager',
                'PositionAnalyticsService',
                ...(container.smartStopLossModule ? ['SmartStopLossModule'] : [])
            ],
            hasSmartStopLoss: !!container.smartStopLossModule,
            createdAt: container.createdAt,
            lastAccessed: container.lastAccessedAt,
            activeTime: this.formatDuration(now - container.createdAt)
        }));

        return {
            totalInstances: this.instanceServices.size,
            instances
        };
    }

    /**
     * 启动定期清理任务
     */
    private startCleanupTask(): void {
        setInterval(async () => {
            const now = Date.now();
            const instancesToCleanup: string[] = [];

            // 查找需要清理的实例
            for (const [instanceId, container] of this.instanceServices.entries()) {
                const inactiveTime = now - container.lastAccessedAt;
                if (inactiveTime > this.INACTIVE_THRESHOLD) {
                    instancesToCleanup.push(instanceId);
                }
            }

            // 执行清理
            for (const instanceId of instancesToCleanup) {
                await this.cleanupInstance(instanceId);
            }

            if (instancesToCleanup.length > 0) {
                await this.loggerService.logSystem('INFO',
                    `🧹 定期清理完成: 清理了 ${instancesToCleanup.length} 个不活跃实例，剩余 ${this.instanceServices.size} 个`
                );
            }

        }, this.CLEANUP_INTERVAL);
    }

    /**
     * 格式化持续时间
     */
    private formatDuration(ms: number): string {
        const seconds = Math.floor(ms / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);

        if (days > 0) return `${days}天${hours % 24}小时`;
        if (hours > 0) return `${hours}小时${minutes % 60}分钟`;
        if (minutes > 0) return `${minutes}分钟${seconds % 60}秒`;
        return `${seconds}秒`;
    }

    /**
     * 健康检查
     */
    async healthCheck(): Promise<{
        status: 'healthy' | 'warning' | 'error';
        message: string;
        details: any;
    }> {
        try {
            const stats = this.getInstanceStats();
            const now = Date.now();

            // 检查是否有过期实例
            const expiredInstances = stats.instances.filter(
                instance => now - instance.lastAccessed > this.INACTIVE_THRESHOLD
            );

            let status: 'healthy' | 'warning' | 'error' = 'healthy';
            let message = '服务工厂运行正常';

            if (expiredInstances.length > 0) {
                status = 'warning';
                message = `发现 ${expiredInstances.length} 个不活跃实例，将在下次清理时移除`;
            }

            if (stats.totalInstances > 10) {
                status = 'warning';
                message = `实例数量较多 (${stats.totalInstances})，建议检查是否有内存泄漏`;
            }

            return {
                status,
                message,
                details: {
                    totalInstances: stats.totalInstances,
                    expiredInstancesCount: expiredInstances.length,
                    cleanupThreshold: this.formatDuration(this.INACTIVE_THRESHOLD),
                    instances: stats.instances.map(i => ({
                        instanceId: i.instanceId,
                        activeTime: i.activeTime,
                        serviceCount: i.services.length
                    }))
                }
            };

        } catch (error) {
            return {
                status: 'error',
                message: `服务工厂健康检查失败: ${error instanceof Error ? error.message : String(error)}`,
                details: { error }
            };
        }
    }
} 