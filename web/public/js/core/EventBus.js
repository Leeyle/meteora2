/**
 * 🚌 事件总线
 * 负责组件间的事件通信和解耦
 * 
 * 功能：
 * - 事件发布订阅
 * - 事件命名空间
 * - 事件历史记录
 * - 错误处理
 */

class EventBus {
    constructor() {
        this.events = new Map();
        this.history = [];
        this.maxHistorySize = 100;
        this.namespaces = new Set();
        this.debugMode = false;
    }

    /**
     * 订阅事件
     * @param {string} eventName - 事件名称
     * @param {Function} handler - 事件处理器
     * @param {Object} options - 选项
     */
    on(eventName, handler, options = {}) {
        if (typeof handler !== 'function') {
            throw new Error('事件处理器必须是函数');
        }

        const { namespace = 'default', once = false, priority = 0 } = options;

        if (!this.events.has(eventName)) {
            this.events.set(eventName, []);
        }

        const eventHandler = {
            handler,
            namespace,
            once,
            priority,
            id: this.generateHandlerId(),
            createdAt: Date.now()
        };

        const handlers = this.events.get(eventName);
        handlers.push(eventHandler);

        // 按优先级排序
        handlers.sort((a, b) => b.priority - a.priority);

        this.namespaces.add(namespace);

        if (this.debugMode) {
            console.log(`📡 订阅事件: ${eventName} (${namespace})`);
        }

        return eventHandler.id;
    }

    /**
     * 订阅一次性事件
     * @param {string} eventName - 事件名称
     * @param {Function} handler - 事件处理器
     * @param {Object} options - 选项
     */
    once(eventName, handler, options = {}) {
        return this.on(eventName, handler, { ...options, once: true });
    }

    /**
     * 取消订阅事件
     * @param {string} eventName - 事件名称
     * @param {string|Function} handlerOrId - 处理器或ID
     */
    off(eventName, handlerOrId) {
        const handlers = this.events.get(eventName);
        if (!handlers) return false;

        let removed = false;

        if (typeof handlerOrId === 'string') {
            // 通过ID移除
            const index = handlers.findIndex(h => h.id === handlerOrId);
            if (index > -1) {
                handlers.splice(index, 1);
                removed = true;
            }
        } else if (typeof handlerOrId === 'function') {
            // 通过函数引用移除
            const index = handlers.findIndex(h => h.handler === handlerOrId);
            if (index > -1) {
                handlers.splice(index, 1);
                removed = true;
            }
        }

        if (handlers.length === 0) {
            this.events.delete(eventName);
        }

        if (this.debugMode && removed) {
            console.log(`📡 取消订阅事件: ${eventName}`);
        }

        return removed;
    }

    /**
     * 发布事件
     * @param {string} eventName - 事件名称
     * @param {*} data - 事件数据
     * @param {Object} options - 选项
     */
    emit(eventName, data = null, options = {}) {
        const { async = false, namespace = null } = options;

        const handlers = this.events.get(eventName);
        if (!handlers || handlers.length === 0) {
            if (this.debugMode) {
                console.log(`📡 无监听器: ${eventName}`);
            }
            return;
        }

        // 记录事件历史
        this.recordEvent(eventName, data);

        // 过滤命名空间
        const filteredHandlers = namespace
            ? handlers.filter(h => h.namespace === namespace)
            : handlers;

        if (this.debugMode) {
            console.log(`📡 发布事件: ${eventName}, 监听器: ${filteredHandlers.length}`);
        }

        const executeHandlers = () => {
            const toRemove = [];

            filteredHandlers.forEach(eventHandler => {
                try {
                    eventHandler.handler(data, eventName);

                    // 标记一次性事件处理器待移除
                    if (eventHandler.once) {
                        toRemove.push(eventHandler.id);
                    }
                } catch (error) {
                    console.error(`❌ 事件处理器错误 (${eventName}):`, error);
                }
            });

            // 移除一次性事件处理器
            toRemove.forEach(id => {
                this.off(eventName, id);
            });
        };

        if (async) {
            setTimeout(executeHandlers, 0);
        } else {
            executeHandlers();
        }
    }

    /**
     * 清除命名空间下的所有事件
     * @param {string} namespace - 命名空间
     */
    clearNamespace(namespace) {
        let removedCount = 0;

        this.events.forEach((handlers, eventName) => {
            const originalLength = handlers.length;
            const filtered = handlers.filter(h => h.namespace !== namespace);

            if (filtered.length !== originalLength) {
                if (filtered.length === 0) {
                    this.events.delete(eventName);
                } else {
                    this.events.set(eventName, filtered);
                }
                removedCount += originalLength - filtered.length;
            }
        });

        this.namespaces.delete(namespace);

        if (this.debugMode) {
            console.log(`📡 清除命名空间: ${namespace}, 移除 ${removedCount} 个监听器`);
        }

        return removedCount;
    }

    /**
     * 获取事件统计信息
     * @returns {Object} 统计信息
     */
    getStats() {
        const stats = {
            totalEvents: this.events.size,
            totalHandlers: 0,
            namespaces: Array.from(this.namespaces),
            eventDetails: {}
        };

        this.events.forEach((handlers, eventName) => {
            stats.totalHandlers += handlers.length;
            stats.eventDetails[eventName] = {
                handlerCount: handlers.length,
                namespaces: [...new Set(handlers.map(h => h.namespace))]
            };
        });

        return stats;
    }

    /**
     * 记录事件历史
     * @param {string} eventName - 事件名称
     * @param {*} data - 事件数据
     */
    recordEvent(eventName, data) {
        this.history.push({
            eventName,
            data,
            timestamp: Date.now()
        });

        // 限制历史记录大小
        if (this.history.length > this.maxHistorySize) {
            this.history.shift();
        }
    }

    /**
     * 获取事件历史
     * @param {number} limit - 限制数量
     * @returns {Array} 事件历史
     */
    getHistory(limit = 10) {
        return this.history.slice(-limit);
    }

    /**
     * 生成处理器ID
     * @returns {string} 处理器ID
     */
    generateHandlerId() {
        return `handler_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
    }

    /**
     * 启用调试模式
     */
    enableDebug() {
        this.debugMode = true;
        console.log('📡 事件总线调试模式已启用');
    }

    /**
     * 禁用调试模式
     */
    disableDebug() {
        this.debugMode = false;
    }

    /**
     * 清除所有事件
     */
    clear() {
        this.events.clear();
        this.namespaces.clear();
        this.history = [];

        if (this.debugMode) {
            console.log('📡 事件总线已清空');
        }
    }
}

// 创建全局单例
window.EventBus = window.EventBus || new EventBus(); 