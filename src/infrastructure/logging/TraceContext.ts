import { AsyncLocalStorage } from 'async_hooks';
import type { ITraceContext } from '../../types/logging';

/**
 * 追踪上下文管理器
 * 使用AsyncLocalStorage实现调用链追踪
 */
export class TraceContext {
    private static storage = new AsyncLocalStorage<ITraceContext>();

    /**
     * 生成追踪ID: req-{timestamp}-{random}
     * @returns 新的追踪ID
     */
    static generateTraceId(): string {
        const timestamp = Date.now();
        // 生成8位十六进制随机字符串
        const random = Math.floor(Math.random() * 0xffffffff).toString(16).padStart(8, '0');
        return `req-${timestamp}-${random}`;
    }

    /**
     * 获取当前追踪上下文
     * @returns 当前追踪上下文或undefined
     */
    static getCurrentContext(): ITraceContext | undefined {
        return this.storage.getStore();
    }

    /**
     * 获取当前追踪ID
     * @returns 当前追踪ID或undefined
     */
    static getCurrentTraceId(): string | undefined {
        const context = this.getCurrentContext();
        return context?.traceId;
    }

    /**
     * 在指定追踪上下文中运行函数
     * @param traceId 追踪ID
     * @param fn 要执行的函数
     * @param metadata 可选的元数据
     * @returns 函数执行结果
     */
    static run<T>(traceId: string, fn: () => T, metadata?: Record<string, any>): T {
        const context: ITraceContext = {
            traceId,
            startTime: Date.now(),
            ...(metadata && { metadata })
        };

        return this.storage.run(context, fn);
    }

    /**
     * 在新的追踪上下文中运行函数
     * @param fn 要执行的函数
     * @param metadata 可选的元数据
     * @returns 函数执行结果和追踪ID
     */
    static runWithNewTrace<T>(fn: () => T, metadata?: Record<string, any>): { result: T; traceId: string } {
        const traceId = this.generateTraceId();
        const result = this.run(traceId, fn, metadata);
        return { result, traceId };
    }

    /**
     * 设置当前上下文的元数据
     * @param key 键名
     * @param value 值
     */
    static setMetadata(key: string, value: any): void {
        const context = this.getCurrentContext();
        if (context) {
            if (!context.metadata) {
                context.metadata = {};
            }
            context.metadata[key] = value;
        }
    }

    /**
     * 获取当前上下文的元数据
     * @param key 键名
     * @returns 元数据值
     */
    static getMetadata(key: string): any {
        const context = this.getCurrentContext();
        return context?.metadata?.[key];
    }

    /**
     * 获取当前上下文的所有元数据
     * @returns 元数据对象或空对象
     */
    static getCurrentMetadata(): Record<string, any> {
        const context = this.getCurrentContext();
        return context?.metadata || {};
    }

    /**
     * 获取当前追踪的持续时间(毫秒)
     * @returns 持续时间或undefined
     */
    static getCurrentDuration(): number | undefined {
        const context = this.getCurrentContext();
        if (context) {
            return Date.now() - context.startTime;
        }
        return undefined;
    }
} 