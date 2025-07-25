import { injectable, inject } from 'tsyringe';
import { Connection } from '@solana/web3.js';
import { IMultiRPCService, IConfigService, ILoggerService, ICacheService, TYPES } from '../../types/interfaces';
import { EndpointMetrics, ModuleConfig, ModuleHealth, ModuleMetrics } from '../../types/interfaces';

interface EndpointStatus {
    endpoint: string;
    isHealthy: boolean;
    latency: number;
    successRate: number;
    lastCheck: number;
    consecutiveFailures: number;
    totalRequests: number;
    successfulRequests: number;
    lastError?: string;
}

/**
 * 多RPC端点服务
 * 负责多RPC端点管理、健康检查、自适应切换、负载均衡
 * 参考原项目的RPC切换逻辑
 */
@injectable()
export class MultiRPCService implements IMultiRPCService {
    public readonly name = 'MultiRPCService';
    public readonly version = '2.0.0';
    public readonly dependencies = ['ConfigService', 'LoggerService', 'CacheService'];

    private config: any;
    private endpoints: string[] = [];
    private endpointStatus: Map<string, EndpointStatus> = new Map();
    private currentEndpointIndex: number = 0;
    private healthCheckInterval: NodeJS.Timeout | null = null;
    private healthCheckIntervalMs: number = 45000; // 45秒健康检查
    private readonly maxConsecutiveFailures = 3;
    private readonly healthCheckTimeout = 5000; // 5秒超时

    // 性能监控指标
    private requestCount: number = 0;
    private errorCount: number = 0;
    private switchCount: number = 0;
    private lastSwitchTime: number = 0;

    constructor(
        @inject(TYPES.ConfigService) private configService: IConfigService,
        @inject(TYPES.LoggerService) private loggerService: ILoggerService,
        @inject(TYPES.CacheService) private cacheService: ICacheService
    ) { }

    async initialize(config: ModuleConfig): Promise<void> {
        // 🔧 系统日志: 服务初始化
        await this.loggerService.logSystem('INFO', 'MultiRPCService开始初始化...');

        this.config = this.configService.get('solana', {});

        // 初始化RPC端点列表
        this.endpoints = this.config.rpcEndpoints || [];

        if (this.endpoints.length === 0) {
            throw new Error('至少需要配置一个RPC端点');
        }

        // 初始化端点状态
        this.initializeEndpointStatus();

        // 从缓存中恢复端点状态
        await this.loadEndpointStatusFromCache();

        // 🔧 系统日志: 初始化完成
        await this.loggerService.logSystem('INFO', `MultiRPCService初始化完成 v${this.version}: ${this.endpoints.length}个端点`);
    }

    async start(): Promise<void> {
        // 开始健康检查
        await this.startHealthChecks();

        // 选择最佳端点作为当前端点
        await this.switchToBest();

        await this.loggerService.logSystem('INFO', `MultiRPCService启动完成, 当前端点: ${this.getCurrentEndpoint()}`);
    }

    async stop(): Promise<void> {
        if (this.healthCheckInterval) {
            clearInterval(this.healthCheckInterval);
            this.healthCheckInterval = null;
        }

        // 保存端点状态到缓存
        await this.saveEndpointStatusToCache();

        await this.loggerService.logSystem('INFO', 'MultiRPCService已停止');
    }

    async healthCheck(): Promise<ModuleHealth> {
        try {
            const healthyCount = Array.from(this.endpointStatus.values())
                .filter(status => status.isHealthy).length;

            const totalCount = this.endpoints.length;
            const healthyPercentage = (healthyCount / totalCount) * 100;

            let status: 'healthy' | 'warning' | 'error';
            let message: string;

            if (healthyPercentage >= 80) {
                status = 'healthy';
                message = `${healthyCount}/${totalCount} 端点健康`;
            } else if (healthyPercentage >= 50) {
                status = 'warning';
                message = `${healthyCount}/${totalCount} 端点健康，部分端点异常`;
            } else {
                status = 'error';
                message = `${healthyCount}/${totalCount} 端点健康，大部分端点异常`;
            }

            return {
                status,
                message,
                timestamp: Date.now(),
                details: {
                    totalEndpoints: totalCount,
                    healthyEndpoints: healthyCount,
                    currentEndpoint: this.getCurrentEndpoint(),
                    endpointStatus: Array.from(this.endpointStatus.values())
                }
            };
        } catch (error) {
            return {
                status: 'error',
                message: `MultiRPCService健康检查失败: ${error instanceof Error ? error.message : '未知错误'}`,
                timestamp: Date.now()
            };
        }
    }

    getMetrics(): ModuleMetrics {
        const totalRequests = Array.from(this.endpointStatus.values())
            .reduce((sum, status) => sum + status.totalRequests, 0);

        const successfulRequests = Array.from(this.endpointStatus.values())
            .reduce((sum, status) => sum + status.successfulRequests, 0);

        const avgLatency = Array.from(this.endpointStatus.values())
            .filter(status => status.isHealthy)
            .reduce((sum, status, _, arr) => sum + status.latency / arr.length, 0);

        return {
            uptime: Date.now(),
            requestCount: totalRequests,
            errorCount: totalRequests - successfulRequests,
            lastActivity: Date.now(),
            performance: {
                avgResponseTime: avgLatency,
                successRate: totalRequests > 0 ? (successfulRequests / totalRequests) * 100 : 0
            }
        };
    }

    /**
     * 获取当前使用的RPC端点
     */
    getCurrentEndpoint(): string {
        return this.endpoints[this.currentEndpointIndex] || this.endpoints[0];
    }

    /**
     * 获取所有RPC端点
     */
    getAllEndpoints(): string[] {
        return [...this.endpoints];
    }

    /**
     * 获取当前活跃(健康)的RPC端点列表
     * 用于测试和监控
     */
    getActiveEndpoints(): string[] {
        return this.getHealthyEndpoints();
    }

    /**
     * 切换到下一个健康的端点
     */
    async switchToNext(): Promise<void> {
        this.requestCount++;
        const healthyEndpoints = this.getHealthyEndpoints();

        if (healthyEndpoints.length === 0) {
            await this.loggerService.logSystem('WARN', '没有健康的RPC端点可用');
            return;
        }

        // 找到当前端点在健康端点列表中的位置
        const currentEndpoint = this.getCurrentEndpoint();
        const currentHealthyIndex = healthyEndpoints.findIndex(ep => ep === currentEndpoint);

        // 切换到下一个健康端点
        const nextHealthyIndex = (currentHealthyIndex + 1) % healthyEndpoints.length;
        const nextEndpoint = healthyEndpoints[nextHealthyIndex];

        // 更新当前端点索引
        this.currentEndpointIndex = this.endpoints.findIndex(ep => ep === nextEndpoint);

        this.switchCount++;
        this.lastSwitchTime = Date.now();
        await this.loggerService.logBusinessOperation('RPC端点切换', {
            fromEndpoint: currentEndpoint,
            toEndpoint: nextEndpoint,
            healthyCount: healthyEndpoints.length,
            timestamp: Date.now()
        });
    }

    /**
     * 切换到最佳RPC端点
     */
    async switchToBest(): Promise<void> {
        this.requestCount++;
        const bestEndpoint = this.selectBestEndpoint();

        if (!bestEndpoint) {
            await this.loggerService.logSystem('WARN', '没有可用的RPC端点');
            return;
        }

        const currentEndpoint = this.getCurrentEndpoint();

        if (bestEndpoint !== currentEndpoint) {
            this.currentEndpointIndex = this.endpoints.findIndex(ep => ep === bestEndpoint);
            const status = this.endpointStatus.get(bestEndpoint);

            this.switchCount++;
            this.lastSwitchTime = Date.now();
            await this.loggerService.logBusinessOperation('RPC切换到最佳', {
                bestEndpoint,
                latency: status?.latency || 0,
                successRate: status?.successRate || 0,
                timestamp: Date.now()
            });
        }
    }

    /**
     * 添加RPC端点
     */
    async addEndpoint(endpoint: string): Promise<void> {
        this.requestCount++;
        if (!this.endpoints.includes(endpoint)) {
            this.endpoints.push(endpoint);
            this.initializeEndpointStatus(endpoint);
            await this.loggerService.logSystem('INFO', `已添加RPC端点: ${endpoint}`);
        }
    }

    /**
     * 移除RPC端点
     */
    async removeEndpoint(endpoint: string): Promise<void> {
        this.requestCount++;
        const index = this.endpoints.findIndex(ep => ep === endpoint);

        if (index !== -1) {
            this.endpoints.splice(index, 1);
            this.endpointStatus.delete(endpoint);

            // 如果移除的是当前端点，切换到最佳端点
            if (index === this.currentEndpointIndex) {
                this.switchToBest();
            } else if (index < this.currentEndpointIndex) {
                this.currentEndpointIndex--;
            }

            await this.loggerService.logSystem('INFO', `已移除RPC端点: ${endpoint}, 剩余: ${this.endpoints.length}`);
        }
    }

    /**
     * 获取端点监控指标
     */
    getEndpointMetrics(): EndpointMetrics[] {
        return Array.from(this.endpointStatus.entries()).map(([endpoint, status]) => ({
            endpoint,
            latency: status.latency,
            successRate: status.successRate,
            lastCheck: status.lastCheck,
            isActive: endpoint === this.getCurrentEndpoint()
        }));
    }

    /**
     * 获取下一个健康的端点 (供其他服务调用)
     */
    async getNextHealthyEndpoint(): Promise<string | null> {
        this.requestCount++;
        const healthyEndpoints = this.getHealthyEndpoints();

        if (healthyEndpoints.length === 0) {
            // 如果没有健康端点，尝试强制检查所有端点
            await this.forceHealthCheckAll();
            const retryHealthyEndpoints = this.getHealthyEndpoints();

            if (retryHealthyEndpoints.length === 0) {
                await this.loggerService.logSystem('ERROR', '没有健康的RPC端点可用');
                return null;
            }

            return retryHealthyEndpoints[0];
        }

        // 返回负载最小的健康端点
        const bestEndpoint = this.selectBestEndpoint();
        return bestEndpoint;
    }

    /**
     * 记录端点请求结果 (供其他服务调用)
     */
    recordEndpointResult(endpoint: string, success: boolean, responseTime: number): void {
        const status = this.endpointStatus.get(endpoint);

        if (status) {
            status.totalRequests++;
            status.lastCheck = Date.now();

            if (success) {
                status.successfulRequests++;
                status.consecutiveFailures = 0;
                status.latency = responseTime;
                status.isHealthy = true;
            } else {
                status.consecutiveFailures++;
                status.lastError = '请求失败';

                // 连续失败超过阈值则标记为不健康
                if (status.consecutiveFailures >= this.maxConsecutiveFailures) {
                    status.isHealthy = false;
                }
            }

            // 更新成功率
            status.successRate = (status.successfulRequests / status.totalRequests) * 100;
        }
    }

    /**
     * 初始化端点状态
     */
    private initializeEndpointStatus(endpoint?: string): void {
        const endpointsToInit = endpoint ? [endpoint] : this.endpoints;

        endpointsToInit.forEach(ep => {
            if (!this.endpointStatus.has(ep)) {
                this.endpointStatus.set(ep, {
                    endpoint: ep,
                    isHealthy: true, // 初始假设健康
                    latency: 0,
                    successRate: 100,
                    lastCheck: 0,
                    consecutiveFailures: 0,
                    totalRequests: 0,
                    successfulRequests: 0
                });
            }
        });
    }

    /**
     * 开始健康检查
     */
    private async startHealthChecks(): Promise<void> {
        // 立即执行一次健康检查
        await this.performHealthChecks();

        // 设置定期健康检查
        this.healthCheckInterval = setInterval(async () => {
            await this.performHealthChecks();
        }, this.healthCheckIntervalMs);

        await this.loggerService.logSystem('INFO', `RPC端点健康检查已启动: 间隔${this.healthCheckIntervalMs}ms`);
    }

    /**
     * 执行健康检查
     */
    private async performHealthChecks(): Promise<void> {
        const checkPromises = this.endpoints.map(endpoint => this.checkEndpointHealth(endpoint));

        try {
            await Promise.allSettled(checkPromises);
            await this.loggerService.logBusinessMonitoring('health-check-cycle-complete', {
                totalEndpoints: this.endpoints.length,
                timestamp: Date.now()
            });
        } catch (error) {
            await this.loggerService.logError('perform-health-checks', '健康检查执行失败', error as Error);
        }
    }

    /**
     * 检查单个端点健康状态
     */
    private async checkEndpointHealth(endpoint: string): Promise<void> {
        const status = this.endpointStatus.get(endpoint);
        if (!status) return;

        try {
            const startTime = Date.now();

            // 创建临时连接进行健康检查
            const connection = new Connection(endpoint, { commitment: 'confirmed' });

            // 使用getVersion作为健康检查
            const version = await Promise.race([
                connection.getVersion(),
                new Promise((_, reject) =>
                    setTimeout(() => reject(new Error('Health check timeout')), this.healthCheckTimeout)
                )
            ]);

            const responseTime = Date.now() - startTime;

            // 检查响应是否有效
            if (version && typeof version === 'object' && (version as any)['solana-core']) {
                this.recordEndpointResult(endpoint, true, responseTime);
                await this.loggerService.logBusinessMonitoring('endpoint-health-success', {
                    endpoint,
                    responseTime,
                    timestamp: Date.now()
                });
            } else {
                throw new Error('Invalid version response');
            }
        } catch (error) {
            this.recordEndpointResult(endpoint, false, this.healthCheckTimeout);
            await this.loggerService.logError('endpoint-health-check-failure', `端点健康检查失败: ${endpoint}`, error as Error);
        }
    }

    /**
     * 强制检查所有端点健康状态
     */
    private async forceHealthCheckAll(): Promise<void> {
        await this.loggerService.logSystem('INFO', '执行强制健康检查...');
        await this.performHealthChecks();
    }

    /**
     * 获取健康的端点列表
     */
    private getHealthyEndpoints(): string[] {
        return Array.from(this.endpointStatus.entries())
            .filter(([_, status]) => status.isHealthy)
            .map(([endpoint, _]) => endpoint);
    }

    /**
     * 选择最佳端点
     */
    private selectBestEndpoint(): string | null {
        const healthyEndpoints = Array.from(this.endpointStatus.entries())
            .filter(([_, status]) => status.isHealthy)
            .sort(([_, a], [__, b]) => {
                // 按延迟和成功率综合排序
                const scoreA = a.latency * (100 - a.successRate);
                const scoreB = b.latency * (100 - b.successRate);
                return scoreA - scoreB;
            });

        return healthyEndpoints.length > 0 ? healthyEndpoints[0][0] : null;
    }

    /**
     * 从缓存加载端点状态
     */
    private async loadEndpointStatusFromCache(): Promise<void> {
        try {
            const cachedStatus = await this.cacheService.get<Record<string, EndpointStatus>>('rpc_endpoint_status');

            if (cachedStatus) {
                Object.entries(cachedStatus).forEach(([endpoint, status]) => {
                    if (this.endpoints.includes(endpoint)) {
                        this.endpointStatus.set(endpoint, status);
                    }
                });

                await this.loggerService.logSystem('INFO', `从缓存恢复端点状态: ${Object.keys(cachedStatus).length}个端点`);
            }
        } catch (error) {
            await this.loggerService.logSystem('WARN', `从缓存加载端点状态失败: ${error}`);
        }
    }

    /**
     * 保存端点状态到缓存
     */
    private async saveEndpointStatusToCache(): Promise<void> {
        try {
            const statusObject: Record<string, EndpointStatus> = {};
            this.endpointStatus.forEach((status, endpoint) => {
                statusObject[endpoint] = status;
            });

            await this.cacheService.set('rpc_endpoint_status', statusObject, 3600000); // 1小时TTL

            await this.loggerService.logSystem('INFO', '端点状态已保存到缓存');
        } catch (error) {
            await this.loggerService.logSystem('WARN', `保存端点状态到缓存失败: ${error}`);
        }
    }

    /**
     * 销毁服务，清理资源
     */
    async destroy(): Promise<void> {
        await this.stop();
        await this.loggerService.logSystem('INFO', 'MultiRPCService资源清理完成');
    }
} 