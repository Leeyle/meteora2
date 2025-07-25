/**
 * 环境适配器
 * 负责检测运行环境并提供相应的配置
 */
class EnvironmentAdapter {
    constructor() {
        this.environment = null;
        this.config = null;
        this.init();
    }

    /**
     * 初始化环境适配器
     */
    init() {
        this.environment = this.detectEnvironment();
        this.config = this.getEnvironmentConfig();
        console.log('🌍 环境适配器初始化完成:', {
            environment: this.environment,
            config: this.config
        });
    }

    /**
     * 检测运行环境
     * @returns {string} 环境类型: 'development' | 'production'
     */
    detectEnvironment() {
        const hostname = window.location.hostname;

        if (hostname === 'localhost' || hostname === '127.0.0.1') {
            return 'development';
        } else {
            return 'production';
        }
    }

    /**
     * 获取环境配置
     * @returns {object} 环境配置对象
     */
    getEnvironmentConfig() {
        const protocol = window.location.protocol;
        const hostname = window.location.hostname;
        const port = window.location.port;

        let config = {
            protocol,
            hostname,
            port,
            isSecure: protocol === 'https:',
            isDevelopment: this.environment === 'development',
            isProduction: this.environment === 'production'
        };

        // 特定环境配置
        if (this.environment === 'development') {
            // 开发环境：直接连接到本地服务器
            config.webSocketUrl = 'ws://localhost:7000';
            config.apiBaseUrl = 'http://localhost:7000';
        } else {
            // 生产环境：通过nginx代理，使用相对路径
            if (config.isSecure) {
                config.webSocketUrl = `wss://${hostname}`;      // ✅ 移除端口号，通过nginx代理
                config.apiBaseUrl = `https://${hostname}`;
            } else {
                config.webSocketUrl = `ws://${hostname}`;       // ✅ 移除端口号，通过nginx代理
                config.apiBaseUrl = `http://${hostname}`;
            }
        }

        return config;
    }

    /**
     * 获取WebSocket连接URL
     * @returns {string} WebSocket URL
     */
    getWebSocketUrl() {
        console.log('🔗 获取WebSocket URL...');

        // 优先使用全局配置
        if (window.dlmmConfig && typeof window.dlmmConfig.getWebSocketUrl === 'function') {
            const wsUrl = window.dlmmConfig.getWebSocketUrl();
            console.log('✅ 从dlmmConfig获取WebSocket URL:', wsUrl);
            return wsUrl;
        }

        // 使用环境适配器配置
        const wsUrl = this.config.webSocketUrl;
        console.log('🔧 使用环境适配器WebSocket URL:', wsUrl);
        return wsUrl;
    }

    /**
     * 获取API基础URL
     * @returns {string} API基础URL
     */
    getApiBaseUrl() {
        return this.config.apiBaseUrl;
    }

    /**
     * 检查是否为安全环境
     * @returns {boolean} 是否为HTTPS
     */
    isSecureEnvironment() {
        return this.config.isSecure;
    }

    /**
     * 检查是否为开发环境
     * @returns {boolean} 是否为开发环境
     */
    isDevelopmentEnvironment() {
        return this.config.isDevelopment;
    }

    /**
     * 检查是否为生产环境
     * @returns {boolean} 是否为生产环境
     */
    isProductionEnvironment() {
        return this.config.isProduction;
    }

    /**
     * 获取环境信息
     * @returns {object} 环境信息对象
     */
    getEnvironmentInfo() {
        return {
            environment: this.environment,
            config: this.config,
            userAgent: navigator.userAgent,
            language: navigator.language,
            platform: navigator.platform,
            timestamp: Date.now()
        };
    }

    /**
     * 获取Socket.IO配置
     * @returns {object} Socket.IO配置对象
     */
    getSocketIOConfig() {
        const baseConfig = {
            transports: ['websocket', 'polling'],
            timeout: 10000,
            reconnection: true,
            reconnectionAttempts: 5,
            reconnectionDelay: 3000
        };

        // 开发环境特定配置
        if (this.environment === 'development') {
            return {
                ...baseConfig,
                forceNew: true,
                debug: true
            };
        }

        // 生产环境特定配置
        return {
            ...baseConfig,
            upgrade: true,
            rememberUpgrade: true
        };
    }

    /**
     * 获取调试信息
     * @returns {object} 调试信息
     */
    getDebugInfo() {
        return {
            environment: this.environment,
            config: this.config,
            webSocketUrl: this.getWebSocketUrl(),
            apiBaseUrl: this.getApiBaseUrl(),
            isSecure: this.isSecureEnvironment(),
            isDevelopment: this.isDevelopmentEnvironment(),
            isProduction: this.isProductionEnvironment(),
            socketIOConfig: this.getSocketIOConfig(),
            environmentInfo: this.getEnvironmentInfo()
        };
    }
}

// 导出模块
if (typeof module !== 'undefined' && module.exports) {
    module.exports = EnvironmentAdapter;
} else if (typeof window !== 'undefined') {
    window.EnvironmentAdapter = EnvironmentAdapter;
} 