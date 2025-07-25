/**
 * 🗄️ DLMM流动性管理系统 - 内存缓存服务
 * 
 * 提供基于内存的缓存功能，支持TTL过期机制
 * 适用于开发和测试环境
 */

import { injectable } from 'tsyringe';
import type { ILoggerService } from '../../types/interfaces';
import { ICacheService, ModuleConfig, ModuleHealth, ModuleMetrics } from '../../types/interfaces';

interface CacheItem<T> {
    value: T;
    expiry?: number;
    createdAt: number;
}

/**
 * 内存缓存服务实现
 * 提供基础的缓存功能，支持TTL过期
 */
@injectable()
export class CacheService implements ICacheService {
    public readonly name = 'CacheService';
    public readonly version = '1.0.0';
    public readonly dependencies: string[] = [];

    private cache: Map<string, CacheItem<any>> = new Map();
    private logger!: ILoggerService;
    private cleanupInterval: NodeJS.Timeout | null = null;
    private requestCount = 0;
    private hitCount = 0;
    private missCount = 0;

    // 配置
    private readonly defaultTTL = 300000; // 5分钟默认TTL
    private readonly cleanupIntervalMs = 60000; // 1分钟清理间隔
    private readonly maxCacheSize = 10000; // 最大缓存条目数

    async initialize(config: ModuleConfig): Promise<void> {
        // 启动定期清理过期项
        this.cleanupInterval = setInterval(() => {
            this.cleanupExpiredItems();
        }, this.cleanupIntervalMs);

        await this.logger.logSystem('INFO', '🗄️ CacheService初始化完成 (内存模式)');
    }

    async start(): Promise<void> {
        await this.logger.logSystem('INFO', '🚀 CacheService启动完成');
    }

    async stop(): Promise<void> {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
            this.cleanupInterval = null;
        }

        await this.clear();
        await this.logger.logSystem('INFO', '🛑 CacheService已停止');
    }

    async healthCheck(): Promise<ModuleHealth> {
        try {
            const cacheSize = this.cache.size;
            const hitRate = this.requestCount > 0 ? (this.hitCount / this.requestCount) * 100 : 0;

            return {
                status: cacheSize < this.maxCacheSize ? 'healthy' : 'warning',
                message: `缓存运行正常 (${cacheSize}/${this.maxCacheSize} 条目, ${hitRate.toFixed(1)}% 命中率)`,
                timestamp: Date.now(),
                details: {
                    cacheSize,
                    maxSize: this.maxCacheSize,
                    hitRate: hitRate.toFixed(1),
                    requestCount: this.requestCount,
                    hitCount: this.hitCount,
                    missCount: this.missCount
                }
            };
        } catch (error) {
            return {
                status: 'error',
                message: `缓存服务异常: ${error instanceof Error ? error.message : '未知错误'}`,
                timestamp: Date.now()
            };
        }
    }

    getMetrics(): ModuleMetrics {
        const hitRate = this.requestCount > 0 ? (this.hitCount / this.requestCount) * 100 : 0;

        return {
            uptime: Date.now(),
            requestCount: this.requestCount,
            errorCount: this.missCount,
            lastActivity: Date.now(),
            performance: {
                avgResponseTime: 1, // 内存缓存响应时间很快
                successRate: hitRate
            }
        };
    }

    /**
     * 获取缓存值
     */
    async get<T>(key: string): Promise<T | null> {
        this.requestCount++;

        const item = this.cache.get(key);

        if (!item) {
            this.missCount++;
            return null;
        }

        // 检查是否过期
        if (item.expiry && Date.now() > item.expiry) {
            this.cache.delete(key);
            this.missCount++;
            return null;
        }

        this.hitCount++;
        return item.value as T;
    }

    /**
     * 设置缓存值
     */
    async set<T>(key: string, value: T, ttl?: number): Promise<void> {
        // 检查缓存大小限制
        if (this.cache.size >= this.maxCacheSize && !this.cache.has(key)) {
            // 删除最旧的条目
            const oldestKey = this.cache.keys().next().value;
            if (oldestKey) {
                this.cache.delete(oldestKey);
            }
        }

        const cacheItem: CacheItem<T> = {
            value,
            createdAt: Date.now()
        };

        if (ttl) {
            cacheItem.expiry = Date.now() + ttl;
        } else if (this.defaultTTL) {
            cacheItem.expiry = Date.now() + this.defaultTTL;
        }

        this.cache.set(key, cacheItem);
    }

    /**
     * 删除缓存项
     */
    async delete(key: string): Promise<void> {
        this.cache.delete(key);
    }

    /**
     * 清空所有缓存
     */
    async clear(): Promise<void> {
        this.cache.clear();
        this.requestCount = 0;
        this.hitCount = 0;
        this.missCount = 0;
    }

    /**
     * 检查缓存项是否存在
     */
    async has(key: string): Promise<boolean> {
        const item = this.cache.get(key);

        if (!item) {
            return false;
        }

        // 检查是否过期
        if (item.expiry && Date.now() > item.expiry) {
            this.cache.delete(key);
            return false;
        }

        return true;
    }

    /**
     * 获取匹配模式的所有键
     */
    async keys(pattern?: string): Promise<string[]> {
        const allKeys = Array.from(this.cache.keys());

        if (!pattern) {
            return allKeys;
        }

        // 简单的通配符匹配
        const regex = new RegExp(pattern.replace(/\*/g, '.*'));
        return allKeys.filter(key => regex.test(key));
    }

    /**
     * 清理过期项
     */
    private async cleanupExpiredItems(): Promise<void> {
        const now = Date.now();
        let cleanedCount = 0;

        for (const [key, item] of this.cache.entries()) {
            if (item.expiry && now > item.expiry) {
                this.cache.delete(key);
                cleanedCount++;
            }
        }

        if (cleanedCount > 0) {
            await this.logger.logSystem('INFO', `🧹 [CacheService] 清理了 ${cleanedCount} 个过期缓存项`);
        }
    }

    /**
     * 获取缓存统计信息
     */
    getStats() {
        const hitRate = this.requestCount > 0 ? (this.hitCount / this.requestCount) * 100 : 0;

        return {
            size: this.cache.size,
            maxSize: this.maxCacheSize,
            requestCount: this.requestCount,
            hitCount: this.hitCount,
            missCount: this.missCount,
            hitRate: hitRate.toFixed(2) + '%'
        };
    }
} 