/**
 * 连接管理器
 * 负责Socket.IO连接管理和事件处理
 */
class SimpleYConnectionManager {
    constructor(environmentAdapter, options = {}) {
        this.environmentAdapter = environmentAdapter;
        this.options = {
            autoConnect: true,
            reconnectInterval: 3000,
            maxReconnectAttempts: 5,
            ...options
        };

        // Socket.IO实例
        this.socket = null;
        this.isConnected = false;
        this.reconnectAttempts = 0;
        this.clientId = null;

        // 初始化状态
        this.isInitialized = false;
        this.initializationPromise = null;

        // 事件监听器
        this.eventListeners = new Map();

        // 开始异步初始化
        this.initializationPromise = this.init();
    }

    /**
     * 等待初始化完成
     */
    async waitForInitialization() {
        if (this.initializationPromise) {
            await this.initializationPromise;
        }
        return this.isInitialized;
    }

    /**
     * 初始化连接管理器
     */
    async init() {
        try {
            console.log('🔌 初始化连接管理器');

            // 生成客户端ID
            this.clientId = this.generateClientId();

            // 加载Socket.IO库
            await this.loadSocketIO();

            this.isInitialized = true;
            console.log('✅ 连接管理器初始化完成');
        } catch (error) {
            console.error('❌ 连接管理器初始化失败:', error);
            this.isInitialized = false;
            throw error;
        }
    }

    /**
     * 动态加载Socket.IO库
     */
    async loadSocketIO() {
        return new Promise((resolve, reject) => {
            // 检查是否已经加载
            if (window.io) {
                console.log('✅ Socket.IO库已加载');
                resolve();
                return;
            }

            console.log('📥 开始加载Socket.IO库...');

            // 动态加载Socket.IO脚本
            const script = document.createElement('script');
            // 添加缓存破坏参数
            const timestamp = Date.now();

            // 🔧 生产环境适配：根据环境选择加载地址
            let scriptSrc;
            if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
                // 开发环境：从web服务器加载
                scriptSrc = `${window.location.origin}/socket.io/socket.io.js?v=${timestamp}`;
            } else {
                // 生产环境：通过nginx代理加载
                scriptSrc = `${window.location.origin}/socket.io/socket.io.js?v=${timestamp}`;
            }

            script.src = scriptSrc;
            console.log('📡 Socket.IO库加载地址:', script.src);

            script.onload = () => {
                console.log('✅ Socket.IO库加载完成');
                if (typeof window.io !== 'undefined') {
                    console.log('✅ window.io 可用，类型:', typeof window.io);
                    resolve();
                } else {
                    console.error('❌ Socket.IO库加载后 window.io 仍不可用');
                    reject(new Error('Socket.IO库加载后未正确初始化'));
                }
            };
            script.onerror = (error) => {
                console.error('❌ Socket.IO库加载失败:', error);
                console.error('❌ 加载地址:', script.src);
                reject(new Error(`Socket.IO库加载失败: ${script.src}`));
            };
            document.head.appendChild(script);
        });
    }

    /**
     * 连接Socket.IO服务器
     */
    async connect() {
        try {
            console.log('🔌 开始连接Socket.IO服务器...');

            // 获取WebSocket URL
            const wsUrl = this.environmentAdapter.getWebSocketUrl();
            console.log('🔗 WebSocket连接地址:', wsUrl);

            // 获取Socket.IO配置
            const socketConfig = this.environmentAdapter.getSocketIOConfig();
            console.log('⚙️ Socket.IO配置:', socketConfig);

            // 创建Socket.IO连接
            this.socket = io(wsUrl, {
                ...socketConfig,
                reconnectionAttempts: this.options.maxReconnectAttempts,
                reconnectionDelay: this.options.reconnectInterval
            });

            // 设置事件监听
            this.setupSocketEvents();

            console.log('🔌 Socket.IO连接已创建');
        } catch (error) {
            console.error('❌ Socket.IO连接失败:', error);
            this.emit('connection:error', { error: error.message });
            throw error;
        }
    }

    /**
     * 设置Socket.IO事件监听
     */
    setupSocketEvents() {
        if (!this.socket) {
            console.error('❌ Socket实例不存在，无法设置事件监听');
            return;
        }

        // 连接成功
        this.socket.on('connect', () => {
            console.log('✅ Socket.IO连接成功');
            this.isConnected = true;
            this.reconnectAttempts = 0;
            this.emit('connection:connected', { clientId: this.clientId });

            // 订阅策略监控
            this.subscribeToStrategyMonitor();
        });

        // 连接断开
        this.socket.on('disconnect', (reason) => {
            console.log('🔌 Socket.IO连接断开:', reason);
            this.isConnected = false;
            this.emit('connection:disconnected', { reason });
        });

        // 连接错误
        this.socket.on('connect_error', (error) => {
            console.error('❌ Socket.IO连接错误:', error);
            this.reconnectAttempts++;
            this.emit('connection:error', {
                error: error.message,
                attempts: this.reconnectAttempts,
                maxAttempts: this.options.maxReconnectAttempts
            });
        });

        // 重连
        this.socket.on('reconnect', (attemptNumber) => {
            console.log(`🔄 Socket.IO重连成功 (第${attemptNumber}次尝试)`);
            this.isConnected = true;
            this.emit('connection:reconnected', { attemptNumber });
        });

        // 重连失败
        this.socket.on('reconnect_failed', () => {
            console.error('❌ Socket.IO重连失败');
            this.emit('connection:failed', {});
        });

        // 订阅确认
        this.socket.on('subscribed:strategy-monitor', (data) => {
            console.log('✅ 策略监控订阅成功:', data);
            this.emit('subscription:confirmed', data);
        });

        // 智能止损数据更新
        this.socket.on('strategy:smart-stop-loss', (data) => {
            console.log('📊 收到智能止损数据:', data);
            this.emit('data:smart-stop-loss', data);
        });

        // 策略状态更新
        this.socket.on('strategy:status-update', (data) => {
            console.log('📈 收到策略状态更新:', data);
            this.emit('data:status-update', data);
        });

        console.log('✅ Socket.IO事件监听已设置');
    }

    /**
     * 订阅策略监控
     */
    subscribeToStrategyMonitor() {
        if (!this.socket || !this.isConnected) {
            console.warn('⚠️ Socket未连接，无法订阅策略监控');
            return;
        }

        console.log('📡 订阅策略监控...');
        this.socket.emit('subscribe:strategy-monitor', {
            clientId: this.clientId,
            timestamp: Date.now()
        });
    }

    /**
     * 断开连接
     */
    disconnect() {
        if (this.socket) {
            console.log('🔌 断开Socket.IO连接');
            this.socket.disconnect();
            this.socket = null;
        }
        this.isConnected = false;
    }

    /**
     * 重连
     */
    reconnect() {
        console.log('🔄 手动重连Socket.IO...');

        // 先断开现有连接
        this.disconnect();

        // 重置重连计数
        this.reconnectAttempts = 0;

        // 重新连接
        this.connect().catch(error => {
            console.error('❌ 手动重连失败:', error);
        });
    }

    /**
     * 生成客户端ID
     */
    generateClientId() {
        return 'monitor_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }

    /**
     * 发送消息到服务器
     */
    sendToServer(event, data) {
        if (this.socket && this.isConnected) {
            this.socket.emit(event, data);
        } else {
            console.warn(`⚠️ 无法发送消息 ${event}，Socket未连接`);
        }
    }

    /**
     * 注册事件监听器
     */
    on(event, callback) {
        if (!this.eventListeners.has(event)) {
            this.eventListeners.set(event, []);
        }
        this.eventListeners.get(event).push(callback);
    }

    /**
     * 移除事件监听器
     */
    off(event, callback) {
        if (this.eventListeners.has(event)) {
            const listeners = this.eventListeners.get(event);
            const index = listeners.indexOf(callback);
            if (index > -1) {
                listeners.splice(index, 1);
            }
        }
    }

    /**
     * 触发内部事件
     */
    emit(event, data) {
        if (this.eventListeners.has(event)) {
            this.eventListeners.get(event).forEach(callback => {
                try {
                    callback(data);
                } catch (error) {
                    console.error(`❌ 事件处理器执行失败 (${event}):`, error);
                }
            });
        }
    }

    /**
     * 获取连接状态
     */
    getConnectionStatus() {
        return {
            isConnected: this.isConnected,
            clientId: this.clientId,
            reconnectAttempts: this.reconnectAttempts,
            maxReconnectAttempts: this.options.maxReconnectAttempts,
            socketConnected: this.socket?.connected || false
        };
    }

    /**
     * 获取调试信息
     */
    getDebugInfo() {
        return {
            connectionStatus: this.getConnectionStatus(),
            options: this.options,
            environmentConfig: this.environmentAdapter.getDebugInfo(),
            eventListeners: Array.from(this.eventListeners.keys()),
            socketId: this.socket?.id || null
        };
    }

    /**
     * 销毁连接管理器
     */
    destroy() {
        console.log('🧹 销毁连接管理器');

        // 断开连接
        this.disconnect();

        // 清理事件监听器
        this.eventListeners.clear();

        // 重置状态
        this.isConnected = false;
        this.reconnectAttempts = 0;
        this.clientId = null;
    }
}

// 导出模块
if (typeof module !== 'undefined' && module.exports) {
    module.exports = SimpleYConnectionManager;
} else if (typeof window !== 'undefined') {
    window.SimpleYConnectionManager = SimpleYConnectionManager;
} 