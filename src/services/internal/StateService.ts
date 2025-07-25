/**
 * 💾 DLMM流动性管理系统 - 状态服务
 * 
 * 内存状态管理服务 (替代数据库)
 */

import { injectable, inject } from 'tsyringe';
import type { ILoggerService } from '../../types/interfaces';
import { IStateService, ModuleConfig, ModuleHealth, ModuleMetrics, TYPES } from '../../types/interfaces';

/**
 * 状态数据接口
 */
export interface StateData {
    [key: string]: any;
}

/**
 * 本地状态服务接口 (内部使用)
 */
export interface ILocalStateService {
    get<T = any>(key: string): T | undefined;
    set<T = any>(key: string, value: T): void;
    has(key: string): boolean;
    delete(key: string): boolean;
    clear(): void;
    keys(): string[];
    size(): number;
    getAll(): StateData;
}

/**
 * 状态服务实现类
 * 使用内存存储，替代数据库功能，实现IStateService接口
 */
@injectable()
export class StateService implements IStateService {
    public readonly name = 'StateService';
    public readonly version = '1.0.0';
    public readonly dependencies: string[] = ['LoggerService'];

    private state: Map<string, any> = new Map();
    private maxSize = 10000; // 最大存储条目数

    constructor(
        @inject(TYPES.LoggerService) private logger: ILoggerService
    ) {
        // Logger已通过依赖注入设置
    }

    async initialize(config: ModuleConfig): Promise<void> {
        // 状态服务不需要特殊初始化
        await this.logger.logSystem('INFO', '💾 StateService初始化完成');
    }

    async start(): Promise<void> {
        await this.logger.logSystem('INFO', '💾 StateService启动完成');
    }

    async stop(): Promise<void> {
        this.clear();
        await this.logger.logSystem('INFO', '💾 StateService已停止');
    }

    async healthCheck(): Promise<ModuleHealth> {
        return {
            status: 'healthy',
            message: `状态服务健康，存储${this.state.size}个条目`,
            timestamp: Date.now(),
            details: {
                entryCount: this.state.size,
                maxSize: this.maxSize
            }
        };
    }

    getMetrics(): ModuleMetrics {
        return {
            uptime: Date.now(),
            requestCount: 0,
            errorCount: 0,
            lastActivity: Date.now()
        };
    }

    /**
     * 异步保存数据 (IStateService接口)
     */
    async save<T>(key: string, data: T): Promise<void> {
        this.set(key, data);
    }

    /**
     * 异步加载数据 (IStateService接口)
     */
    async load<T>(key: string): Promise<T | null> {
        const value = await this.get<T>(key);
        return value !== undefined ? value : null;
    }

    /**
     * 异步删除数据 (IStateService接口)
     */
    async delete(key: string): Promise<void> {
        this.deleteSync(key);
    }

    /**
     * 检查数据是否存在 (IStateService接口)
     */
    async exists(key: string): Promise<boolean> {
        return this.has(key);
    }

    /**
     * 列出匹配模式的键 (IStateService接口)
     */
    async list(pattern?: string): Promise<string[]> {
        const keys = this.keys();
        if (!pattern) return keys;
        return keys.filter(key => key.includes(pattern));
    }

    /**
     * 备份状态 (IStateService接口)
     */
    async backup(): Promise<string> {
        return this.export();
    }

    /**
     * 恢复状态 (IStateService接口)
     */
    async restore(backupPath: string): Promise<void> {
        // 本地内存实现，暂时不支持从文件恢复
        await this.logger.logSystem('INFO', '💾 [State] 本地内存模式，跳过文件恢复');
    }

    /**
     * 获取状态值 (内部方法)
     */
    public async get<T = any>(key: string): Promise<T | undefined> {
        const value = this.state.get(key);
        if (value !== undefined) {
            await this.logger.logSystem('INFO', `💾 [State] 获取状态: ${key}`);
        }
        return value as T;
    }

    /**
     * 设置状态值
     */
    public async set<T = any>(key: string, value: T): Promise<void> {
        // 检查存储限制
        if (!this.state.has(key) && this.state.size >= this.maxSize) {
            console.warn(`⚠️ [State] 状态存储已达上限 (${this.maxSize})，删除最旧的条目`);
            const firstKey = this.state.keys().next().value;
            if (firstKey) {
                this.state.delete(firstKey);
            }
        }

        this.state.set(key, value);
        await this.logger.logSystem('INFO', `💾 [State] 设置状态: ${key}`);
    }

    /**
     * 检查状态是否存在
     */
    public has(key: string): boolean {
        return this.state.has(key);
    }

    /**
     * 删除状态 (内部同步方法)
     */
    private async deleteSync(key: string): Promise<boolean> {
        const deleted = this.state.delete(key);
        if (deleted) {
            await this.logger.logSystem('INFO', `💾 [State] 删除状态: ${key}`);
        }
        return deleted;
    }

    /**
     * 清空所有状态
     */
    public async clear(): Promise<void> {
        this.state.clear();
        await this.logger.logBusinessMonitoring('💾 [State] 所有状态已清空', {});
    }

    /**
     * 获取所有键
     */
    public keys(): string[] {
        return Array.from(this.state.keys());
    }

    /**
     * 获取状态数量
     */
    public size(): number {
        return this.state.size;
    }

    /**
     * 获取所有状态数据
     */
    public getAll(): StateData {
        const result: StateData = {};
        for (const [key, value] of this.state.entries()) {
            result[key] = value;
        }
        return result;
    }

    /**
     * 批量设置状态
     */
    public async setMultiple(data: StateData): Promise<void> {
        for (const [key, value] of Object.entries(data)) {
            this.set(key, value);
        }
        await this.logger.logSystem('INFO', `💾 [State] 批量设置 ${Object.keys(data).length} 个状态`);
    }

    /**
     * 批量获取状态
     */
    public getMultiple(keys: string[]): StateData {
        const result: StateData = {};
        for (const key of keys) {
            const value = this.get(key);
            if (value !== undefined) {
                result[key] = value;
            }
        }
        return result;
    }

    /**
     * 批量删除状态
     */
    public async deleteMultiple(keys: string[]): Promise<number> {
        let deletedCount = 0;
        for (const key of keys) {
            if (await this.deleteSync(key)) {
                deletedCount++;
            }
        }
        await this.logger.logSystem('INFO', `💾 [State] 批量删除 ${deletedCount} 个状态`);
        return deletedCount;
    }

    /**
     * 按前缀获取状态
     */
    public getByPrefix(prefix: string): StateData {
        const result: StateData = {};
        for (const [key, value] of this.state.entries()) {
            if (key.startsWith(prefix)) {
                result[key] = value;
            }
        }
        return result;
    }

    /**
     * 按前缀删除状态
     */
    public async deleteByPrefix(prefix: string): Promise<number> {
        const keysToDelete = this.keys().filter(key => key.startsWith(prefix));
        return await this.deleteMultiple(keysToDelete);
    }

    /**
     * 获取状态统计信息
     */
    public getStats(): {
        totalKeys: number;
        memoryUsage: string;
        keysByPrefix: Record<string, number>;
    } {
        const keysByPrefix: Record<string, number> = {};

        for (const key of this.keys()) {
            const prefix = key.split('.')[0] || 'root';
            keysByPrefix[prefix] = (keysByPrefix[prefix] || 0) + 1;
        }

        // 估算内存使用量
        const memoryUsageBytes = JSON.stringify(this.getAll()).length * 2; // 粗略估算
        const memoryUsage = this.formatBytes(memoryUsageBytes);

        return {
            totalKeys: this.size(),
            memoryUsage,
            keysByPrefix
        };
    }

    /**
     * 格式化字节数
     */
    private formatBytes(bytes: number): string {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    /**
     * 导出状态数据
     */
    public export(): string {
        return JSON.stringify(this.getAll(), null, 2);
    }

    /**
     * 导入状态数据
     */
    public async import(data: string): Promise<void> {
        try {
            const parsed = JSON.parse(data);
            this.clear();
            this.setMultiple(parsed);
            await this.logger.logSystem('INFO', '💾 [State] 状态数据导入完成');
        } catch (error) {
            await this.logger.logError('Service', '❌ [State] 状态数据导入失败:', error as Error);
            throw error;
        }
    }

    /**
     * 销毁状态服务
     */
    public async destroy(): Promise<void> {
        this.clear();
        await this.logger.logBusinessMonitoring('💥 [State] 状态服务已销毁', {});
    }
} 