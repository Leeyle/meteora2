/**
 * 🏥 策略健康检查服务
 * 定期检查策略实例的状态异常，发现问题并自动修复或告警
 */

import { injectable, inject } from 'tsyringe';
import { ILoggerService, TYPES } from '../../types/interfaces';
import { IStrategyManager } from './StrategyManager';
import { ChainPositionExecutor } from './executors/ChainPositionExecutor';
import { InstanceAwareServiceFactory } from '../business/InstanceAwareServiceFactory';

// 健康检查结果接口
export interface HealthCheckResult {
    instanceId: string;
    status: 'healthy' | 'warning' | 'critical' | 'error';
    issues: HealthIssue[];
    lastCheck: number;
    uptime: number;
    autoFixed: boolean;
}

// 健康问题接口
export interface HealthIssue {
    type: 'stuck_stopping' | 'timer_leak' | 'memory_leak' | 'observation_buildup' | 'phase_error' | 'log_growth' | 'resource_leak';
    severity: 'low' | 'medium' | 'high' | 'critical';
    description: string;
    details: any;
    fixable: boolean;
    autoFixed?: boolean;
}

// 检查配置
export interface HealthCheckConfig {
    enabled: boolean;
    checkInterval: number;           // 检查间隔（毫秒）
    stoppingTimeout: number;         // STOPPING状态超时时间（毫秒）
    memoryThreshold: number;         // 内存使用阈值（MB）
    observationPeriodLimit: number;  // 观察期状态数量限制
    autoFix: boolean;               // 是否自动修复
    alertThreshold: number;         // 告警阈值（连续异常次数）
}

// 健康统计
export interface HealthStatistics {
    totalInstances: number;
    healthyInstances: number;
    warningInstances: number;
    criticalInstances: number;
    errorInstances: number;
    totalIssues: number;
    autoFixedIssues: number;
    lastCheckTime: number;
    checkCount: number;
}

@injectable()
export class StrategyHealthChecker {
    private config: HealthCheckConfig;
    private checkTimer: NodeJS.Timeout | null = null;
    private healthHistory: Map<string, HealthCheckResult[]> = new Map();
    private statistics: HealthStatistics;
    private isRunning = false;

    // 默认配置
    private static readonly DEFAULT_CONFIG: HealthCheckConfig = {
        enabled: true,
        checkInterval: 60000,        // 1分钟检查一次
        stoppingTimeout: 300000,     // 5分钟STOPPING超时
        memoryThreshold: 500,        // 500MB内存阈值
        observationPeriodLimit: 20,  // 观察期状态限制20个
        autoFix: true,              // 启用自动修复
        alertThreshold: 3           // 连续3次异常才告警
    };

    constructor(
        @inject(TYPES.LoggerService) private logger: ILoggerService,
        @inject('IStrategyManager') private strategyManager: IStrategyManager,
        @inject(ChainPositionExecutor) private chainPositionExecutor: ChainPositionExecutor,
        @inject(InstanceAwareServiceFactory) private serviceFactory: InstanceAwareServiceFactory
    ) {
        this.config = { ...StrategyHealthChecker.DEFAULT_CONFIG };
        this.statistics = this.initializeStatistics();
    }

    /**
     * 🚀 启动健康检查
     */
    async start(config?: Partial<HealthCheckConfig>): Promise<void> {
        if (this.isRunning) {
            await this.logger.logSystem('WARN', '[StrategyHealthChecker] 健康检查已在运行中');
            return;
        }

        // 合并配置
        if (config) {
            this.config = { ...this.config, ...config };
        }

        if (!this.config.enabled) {
            await this.logger.logSystem('INFO', '[StrategyHealthChecker] 健康检查已禁用');
            return;
        }

        this.isRunning = true;

        // 立即执行一次检查
        await this.performHealthCheck();

        // 启动定期检查
        this.checkTimer = setInterval(async () => {
            try {
                await this.performHealthCheck();
            } catch (error) {
                await this.logger.logError('strategy-health-checker',
                    '[StrategyHealthChecker] 健康检查执行失败', error as Error);
            }
        }, this.config.checkInterval);

        await this.logger.logSystem('INFO',
            `[StrategyHealthChecker] 健康检查已启动 - 检查间隔: ${this.config.checkInterval / 1000}秒, 自动修复: ${this.config.autoFix ? '启用' : '禁用'}`);
    }

    /**
     * 🛑 停止健康检查
     */
    async stop(): Promise<void> {
        if (!this.isRunning) {
            return;
        }

        if (this.checkTimer) {
            clearInterval(this.checkTimer);
            this.checkTimer = null;
        }

        this.isRunning = false;
        await this.logger.logSystem('INFO', '[StrategyHealthChecker] 健康检查已停止');
    }

    /**
     * 🔍 执行健康检查
     */
    async performHealthCheck(): Promise<HealthCheckResult[]> {
        const checkStartTime = Date.now();
        const results: HealthCheckResult[] = [];

        try {
            // 获取所有策略实例
            const instances = this.strategyManager.listInstances();

            await this.logger.logSystem('INFO',
                `[StrategyHealthChecker] 开始健康检查 - 检查 ${instances.length} 个策略实例`);

            // 检查每个实例
            for (const instance of instances) {
                try {
                    const result = await this.checkInstanceHealth(instance.id);
                    results.push(result);

                    // 记录健康历史
                    if (!this.healthHistory.has(instance.id)) {
                        this.healthHistory.set(instance.id, []);
                    }
                    const history = this.healthHistory.get(instance.id)!;
                    history.push(result);

                    // 保留最近50次检查记录
                    if (history.length > 50) {
                        history.splice(0, history.length - 50);
                    }

                } catch (error) {
                    await this.logger.logError('strategy-health-checker',
                        `[StrategyHealthChecker] 检查实例 ${instance.id} 失败`, error as Error);
                }
            }

            // 更新统计信息
            this.updateStatistics(results);

            // 生成报告
            await this.generateHealthReport(results);

            const checkDuration = Date.now() - checkStartTime;
            await this.logger.logSystem('INFO',
                `[StrategyHealthChecker] 健康检查完成 - 耗时: ${checkDuration}ms, 发现问题: ${results.reduce((sum, r) => sum + r.issues.length, 0)} 个`);

        } catch (error) {
            await this.logger.logError('strategy-health-checker',
                '[StrategyHealthChecker] 健康检查执行失败', error as Error);
        }

        return results;
    }

    /**
     * 🔍 检查单个实例健康状态
     */
    private async checkInstanceHealth(instanceId: string): Promise<HealthCheckResult> {
        const checkTime = Date.now();
        const issues: HealthIssue[] = [];
        let autoFixed = false;

        try {
            // 获取实例信息
            const instance = this.strategyManager.getInstance(instanceId);
            if (!instance) {
                throw new Error(`实例不存在: ${instanceId}`);
            }

            // 计算运行时间
            const uptime = checkTime - (instance.createdAt?.getTime() || checkTime);

            // 🔍 检查1: STOPPING状态超时
            await this.checkStoppingTimeout(instanceId, issues);

            // 🔍 检查2: 阶段状态异常
            await this.checkPhaseAnomalies(instanceId, issues);

            // 🔍 检查3: 监控定时器泄漏
            await this.checkTimerLeaks(instanceId, issues);

            // 🔍 检查4: 观察期状态累积
            await this.checkObservationPeriodBuildup(instanceId, issues);

            // 🔍 检查5: 资源泄漏
            await this.checkResourceLeaks(instanceId, issues);

            // 🔍 检查6: 日志文件异常增长
            await this.checkLogGrowth(instanceId, issues);

            // 🔧 自动修复（如果启用）
            if (this.config.autoFix && issues.length > 0) {
                autoFixed = await this.autoFixIssues(instanceId, issues);
            }

            // 确定整体健康状态
            const status = this.determineHealthStatus(issues);

            return {
                instanceId,
                status,
                issues,
                lastCheck: checkTime,
                uptime,
                autoFixed
            };

        } catch (error) {
            return {
                instanceId,
                status: 'error',
                issues: [{
                    type: 'phase_error',
                    severity: 'critical',
                    description: `健康检查失败: ${error instanceof Error ? error.message : String(error)}`,
                    details: { error },
                    fixable: false
                }],
                lastCheck: checkTime,
                uptime: 0,
                autoFixed: false
            };
        }
    }

    /**
     * 🔍 检查STOPPING状态超时
     */
    private async checkStoppingTimeout(instanceId: string, issues: HealthIssue[]): Promise<void> {
        try {
            // 使用类型断言访问私有方法（仅用于健康检查）
            const executor = this.chainPositionExecutor as any;
            const state = executor.instanceStates?.get(instanceId);

            if (state && state.phase === 'STOPPING') {
                const stoppingDuration = Date.now() - (state.lastMonitoringTime?.getTime() || Date.now());

                if (stoppingDuration > this.config.stoppingTimeout) {
                    issues.push({
                        type: 'stuck_stopping',
                        severity: 'critical',
                        description: `实例在STOPPING状态超时 ${Math.round(stoppingDuration / 1000)} 秒`,
                        details: {
                            phase: state.phase,
                            stoppingReason: state.stoppingReason,
                            stoppingDuration,
                            lastMonitoringTime: state.lastMonitoringTime
                        },
                        fixable: true
                    });
                }
            }
        } catch (error) {
            // 检查失败，记录但不阻断
        }
    }

    /**
     * 🔍 检查阶段状态异常
     */
    private async checkPhaseAnomalies(instanceId: string, issues: HealthIssue[]): Promise<void> {
        try {
            const instance = this.strategyManager.getInstance(instanceId);
            const executor = this.chainPositionExecutor as any;
            const state = executor.instanceStates?.get(instanceId);

            if (instance && state) {
                // 检查实例状态与执行器状态不一致
                const isManagerRunning = instance.status === 'running';
                const isExecutorActive = state.isActive;

                if (isManagerRunning !== isExecutorActive) {
                    issues.push({
                        type: 'phase_error',
                        severity: 'high',
                        description: `策略管理器与执行器状态不一致`,
                        details: {
                            managerStatus: instance.status,
                            executorActive: isExecutorActive,
                            executorPhase: state.phase
                        },
                        fixable: true
                    });
                }

                // 检查异常的阶段持续时间
                const phaseStartTime = state.lastMonitoringTime?.getTime() || Date.now();
                const phaseDuration = Date.now() - phaseStartTime;

                if (state.phase === 'ANALYZING' && phaseDuration > 300000) { // 5分钟
                    issues.push({
                        type: 'phase_error',
                        severity: 'medium',
                        description: `分析阶段持续时间过长: ${Math.round(phaseDuration / 1000)} 秒`,
                        details: {
                            phase: state.phase,
                            duration: phaseDuration
                        },
                        fixable: true
                    });
                }
            }
        } catch (error) {
            // 检查失败，记录但不阻断
        }
    }

    /**
     * 🔍 检查监控定时器泄漏
     */
    private async checkTimerLeaks(instanceId: string, issues: HealthIssue[]): Promise<void> {
        try {
            const executor = this.chainPositionExecutor as any;
            const timers = executor.monitoringTimers;

            if (timers && timers.size > 0) {
                const instance = this.strategyManager.getInstance(instanceId);
                const hasTimer = timers.has(instanceId);

                if (hasTimer && instance?.status !== 'running') {
                    issues.push({
                        type: 'timer_leak',
                        severity: 'medium',
                        description: `检测到定时器泄漏 - 实例非运行状态但定时器仍存在`,
                        details: {
                            instanceStatus: instance?.status,
                            hasTimer: hasTimer,
                            totalTimers: timers.size
                        },
                        fixable: true
                    });
                }
            }
        } catch (error) {
            // 检查失败，记录但不阻断
        }
    }

    /**
     * 🔍 检查观察期状态累积
     */
    private async checkObservationPeriodBuildup(instanceId: string, issues: HealthIssue[]): Promise<void> {
        try {
            const executor = this.chainPositionExecutor as any;
            const stopLossModule = executor.smartStopLossModules?.get(instanceId);

            if (stopLossModule && typeof stopLossModule.getObservationPeriods === 'function') {
                const observationPeriods = stopLossModule.getObservationPeriods();

                if (observationPeriods.size > this.config.observationPeriodLimit) {
                    issues.push({
                        type: 'observation_buildup',
                        severity: 'medium',
                        description: `观察期状态累积过多: ${observationPeriods.size} 个`,
                        details: {
                            observationCount: observationPeriods.size,
                            limit: this.config.observationPeriodLimit,
                            periods: Array.from(observationPeriods.entries())
                        },
                        fixable: true
                    });
                }
            }
        } catch (error) {
            // 检查失败，记录但不阻断
        }
    }

    /**
     * 🔍 检查资源泄漏
     */
    private async checkResourceLeaks(instanceId: string, issues: HealthIssue[]): Promise<void> {
        try {
            // 检查服务工厂中的实例数量
            const factoryStats = this.serviceFactory.getInstanceStats();

            if (factoryStats.totalInstances > 10) {
                issues.push({
                    type: 'resource_leak',
                    severity: 'medium',
                    description: `服务工厂实例数量过多: ${factoryStats.totalInstances} 个`,
                    details: factoryStats,
                    fixable: true
                });
            }

            // 检查内存使用（简化版）
            const memUsage = process.memoryUsage();
            const memUsageMB = memUsage.heapUsed / 1024 / 1024;

            if (memUsageMB > this.config.memoryThreshold) {
                issues.push({
                    type: 'memory_leak',
                    severity: 'high',
                    description: `内存使用过高: ${Math.round(memUsageMB)} MB`,
                    details: {
                        heapUsed: Math.round(memUsageMB),
                        heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024),
                        threshold: this.config.memoryThreshold
                    },
                    fixable: false
                });
            }
        } catch (error) {
            // 检查失败，记录但不阻断
        }
    }

    /**
     * 🔍 检查日志文件异常增长
     */
    private async checkLogGrowth(instanceId: string, issues: HealthIssue[]): Promise<void> {
        try {
            const fs = await import('fs/promises');
            const path = await import('path');

            const logPath = path.join('logs', 'strategies', `instance-${instanceId}`, 'operations', 'strategies', `strategy-${instanceId}.log`);

            try {
                const stats = await fs.stat(logPath);
                const fileSizeMB = stats.size / 1024 / 1024;

                if (fileSizeMB > 100) { // 100MB阈值
                    issues.push({
                        type: 'log_growth',
                        severity: 'low',
                        description: `日志文件过大: ${Math.round(fileSizeMB)} MB`,
                        details: {
                            filePath: logPath,
                            sizeMB: Math.round(fileSizeMB),
                            lastModified: stats.mtime
                        },
                        fixable: false
                    });
                }
            } catch (statError) {
                // 日志文件不存在或无法访问，正常情况
            }
        } catch (error) {
            // 检查失败，记录但不阻断
        }
    }

    /**
     * 🔧 自动修复问题
     */
    private async autoFixIssues(instanceId: string, issues: HealthIssue[]): Promise<boolean> {
        let anyFixed = false;

        for (const issue of issues) {
            if (!issue.fixable) continue;

            try {
                let fixed = false;

                switch (issue.type) {
                    case 'stuck_stopping':
                        fixed = await this.fixStuckStopping(instanceId, issue);
                        break;
                    case 'timer_leak':
                        fixed = await this.fixTimerLeak(instanceId, issue);
                        break;
                    case 'observation_buildup':
                        fixed = await this.fixObservationBuildup(instanceId, issue);
                        break;
                    case 'phase_error':
                        fixed = await this.fixPhaseError(instanceId, issue);
                        break;
                    case 'resource_leak':
                        fixed = await this.fixResourceLeak(instanceId, issue);
                        break;
                }

                if (fixed) {
                    issue.autoFixed = true;
                    anyFixed = true;

                    await this.logger.logSystem('INFO',
                        `[StrategyHealthChecker] 自动修复成功 - 实例: ${instanceId}, 问题: ${issue.type}`);
                }
            } catch (error) {
                await this.logger.logError('strategy-health-checker',
                    `[StrategyHealthChecker] 自动修复失败 - 实例: ${instanceId}, 问题: ${issue.type}`, error as Error);
            }
        }

        return anyFixed;
    }

    /**
     * 🔧 修复卡住的STOPPING状态
     */
    private async fixStuckStopping(instanceId: string, issue: HealthIssue): Promise<boolean> {
        try {
            const executor = this.chainPositionExecutor as any;

            // 强制停止监控
            if (typeof executor.stopMonitoring === 'function') {
                await executor.stopMonitoring(instanceId);
            }

            // 重置状态
            const state = executor.instanceStates?.get(instanceId);
            if (state) {
                state.phase = 'STOPPED';
                state.isActive = false;
                state.stoppingReason = null;
            }

            return true;
        } catch (error) {
            return false;
        }
    }

    /**
     * 🔧 修复定时器泄漏
     */
    private async fixTimerLeak(instanceId: string, issue: HealthIssue): Promise<boolean> {
        try {
            const executor = this.chainPositionExecutor as any;
            const timers = executor.monitoringTimers;

            if (timers && timers.has(instanceId)) {
                const timer = timers.get(instanceId);
                if (timer) {
                    clearInterval(timer);
                }
                timers.delete(instanceId);
                return true;
            }

            return false;
        } catch (error) {
            return false;
        }
    }

    /**
     * 🔧 修复观察期状态累积
     */
    private async fixObservationBuildup(instanceId: string, issue: HealthIssue): Promise<boolean> {
        try {
            const executor = this.chainPositionExecutor as any;
            const stopLossModule = executor.smartStopLossModules?.get(instanceId);

            if (stopLossModule && typeof stopLossModule.cleanupHistory === 'function') {
                stopLossModule.cleanupHistory();
                return true;
            }

            return false;
        } catch (error) {
            return false;
        }
    }

    /**
     * 🔧 修复阶段错误
     */
    private async fixPhaseError(instanceId: string, issue: HealthIssue): Promise<boolean> {
        try {
            // 尝试同步策略管理器和执行器状态
            const instance = this.strategyManager.getInstance(instanceId);
            const executor = this.chainPositionExecutor as any;
            const state = executor.instanceStates?.get(instanceId);

            if (instance && state) {
                // 如果管理器认为在运行但执行器不活跃，停止实例
                if (instance.status === 'running' && !state.isActive) {
                    await this.strategyManager.stopInstance(instanceId);
                    return true;
                }

                // 如果执行器卡在分析状态，重置为监控状态
                if (state.phase === 'ANALYZING') {
                    state.phase = 'MONITORING';
                    return true;
                }
            }

            return false;
        } catch (error) {
            return false;
        }
    }

    /**
     * 🔧 修复资源泄漏
     */
    private async fixResourceLeak(instanceId: string, issue: HealthIssue): Promise<boolean> {
        try {
            // 清理服务工厂中的过期实例
            await this.serviceFactory.cleanupInstance(instanceId);
            return true;
        } catch (error) {
            return false;
        }
    }

    /**
     * 📊 确定健康状态
     */
    private determineHealthStatus(issues: HealthIssue[]): 'healthy' | 'warning' | 'critical' | 'error' {
        if (issues.length === 0) return 'healthy';

        const criticalIssues = issues.filter(i => i.severity === 'critical');
        const highIssues = issues.filter(i => i.severity === 'high');

        if (criticalIssues.length > 0) return 'critical';
        if (highIssues.length > 0) return 'error';
        return 'warning';
    }

    /**
     * 📊 更新统计信息
     */
    private updateStatistics(results: HealthCheckResult[]): void {
        this.statistics = {
            totalInstances: results.length,
            healthyInstances: results.filter(r => r.status === 'healthy').length,
            warningInstances: results.filter(r => r.status === 'warning').length,
            criticalInstances: results.filter(r => r.status === 'critical').length,
            errorInstances: results.filter(r => r.status === 'error').length,
            totalIssues: results.reduce((sum, r) => sum + r.issues.length, 0),
            autoFixedIssues: results.reduce((sum, r) => sum + r.issues.filter(i => i.autoFixed).length, 0),
            lastCheckTime: Date.now(),
            checkCount: this.statistics.checkCount + 1
        };
    }

    /**
     * 📋 生成健康报告
     */
    private async generateHealthReport(results: HealthCheckResult[]): Promise<void> {
        const criticalInstances = results.filter(r => r.status === 'critical');
        const errorInstances = results.filter(r => r.status === 'error');

        if (criticalInstances.length > 0 || errorInstances.length > 0) {
            await this.logger.logSystem('WARN',
                `[StrategyHealthChecker] 发现异常实例 - 严重: ${criticalInstances.length}, 错误: ${errorInstances.length}`);

            for (const result of [...criticalInstances, ...errorInstances]) {
                await this.logger.logSystem('WARN',
                    `[StrategyHealthChecker] 实例 ${result.instanceId} 状态: ${result.status}, 问题数: ${result.issues.length}`);
            }
        }
    }

    /**
     * 📊 初始化统计信息
     */
    private initializeStatistics(): HealthStatistics {
        return {
            totalInstances: 0,
            healthyInstances: 0,
            warningInstances: 0,
            criticalInstances: 0,
            errorInstances: 0,
            totalIssues: 0,
            autoFixedIssues: 0,
            lastCheckTime: 0,
            checkCount: 0
        };
    }

    /**
     * 📊 获取健康统计
     */
    getStatistics(): HealthStatistics {
        return { ...this.statistics };
    }

    /**
     * 📊 获取实例健康历史
     */
    getInstanceHistory(instanceId: string): HealthCheckResult[] {
        return this.healthHistory.get(instanceId) || [];
    }

    /**
     * ⚙️ 更新配置
     */
    updateConfig(config: Partial<HealthCheckConfig>): void {
        this.config = { ...this.config, ...config };
    }

    /**
     * ⚙️ 获取配置
     */
    getConfig(): HealthCheckConfig {
        return { ...this.config };
    }

    /**
     * 🏥 手动执行健康检查单个实例
     */
    async checkSingleInstance(instanceId: string): Promise<HealthCheckResult> {
        return await this.checkInstanceHealth(instanceId);
    }

    /**
     * 🧹 强制清理实例
     */
    async forceCleanupInstance(instanceId: string): Promise<boolean> {
        try {
            await this.logger.logSystem('WARN',
                `[StrategyHealthChecker] 强制清理实例: ${instanceId}`);

            // 尝试正常删除
            try {
                await this.strategyManager.deleteInstance(instanceId);
                return true;
            } catch (deleteError) {
                // 删除失败，强制清理
                await this.logger.logSystem('WARN',
                    `[StrategyHealthChecker] 正常删除失败，开始强制清理: ${instanceId}`);
            }

            // 强制清理执行器资源
            const executor = this.chainPositionExecutor as any;
            if (executor.cleanup && typeof executor.cleanup === 'function') {
                await executor.cleanup(instanceId);
            }

            // 强制清理服务工厂资源
            await this.serviceFactory.cleanupInstance(instanceId);

            await this.logger.logSystem('INFO',
                `[StrategyHealthChecker] 强制清理完成: ${instanceId}`);

            return true;
        } catch (error) {
            await this.logger.logError('strategy-health-checker',
                `[StrategyHealthChecker] 强制清理失败: ${instanceId}`, error as Error);
            return false;
        }
    }
} 