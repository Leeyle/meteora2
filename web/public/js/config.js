/**
 * 🌐 DLMM 动态配置管理器
 * 自动检测运行环境并配置API地址
 */

class DLMMConfig {
    constructor() {
        this.config = this.detectEnvironment();
        console.log('🔧 DLMM配置加载完成:', this.config);
    }

    /**
     * 自动检测运行环境并返回配置
     */
    detectEnvironment() {
        const protocol = window.location.protocol;
        const hostname = window.location.hostname;
        const port = window.location.port;

        console.log('🔍 检测到的环境信息:', { protocol, hostname, port });

        // 开发环境检测
        if (hostname === 'localhost' || hostname === '127.0.0.1') {
            return {
                API_BASE_URL: 'http://localhost:7000',
                WS_URL: 'http://localhost:7000',
                environment: 'development',
                isDevelopment: true,
                isProduction: false
            };
        }

        // 🔧 生产环境：通过Nginx代理，移除端口号
        const baseUrl = `${protocol}//${hostname}`;

        // 🔧 WebSocket URL：通过Nginx代理，移除端口号
        let wsUrl;
        if (protocol === 'https:') {
            console.log('🔒 检测到HTTPS环境，使用WSS协议通过Nginx代理');
            wsUrl = `wss://${hostname}`;
        } else {
            wsUrl = `ws://${hostname}`;
        }

        console.log('🔗 生产环境配置结果:', { baseUrl, wsUrl, protocol, hostname });

        const config = {
            API_BASE_URL: baseUrl,
            WS_URL: wsUrl,
            environment: 'production',
            isDevelopment: false,
            isProduction: true
        };

        // 🔧 添加详细调试信息
        console.log('🔍 最终配置对象:', config);
        console.log('🔍 当前页面URL:', window.location.href);
        console.log('🔍 检测到的协议:', protocol);
        console.log('🔍 检测到的主机名:', hostname);
        console.log('🔍 生成的WebSocket URL:', wsUrl);
        console.log('🔍 生成的API URL:', baseUrl);

        return config;
    }

    /**
     * 获取API基础URL
     */
    getApiBaseUrl() {
        return this.config.API_BASE_URL;
    }

    /**
     * 获取WebSocket URL
     */
    getWebSocketUrl() {
        return this.config.WS_URL;
    }

    /**
     * 获取完整配置
     */
    getConfig() {
        return this.config;
    }

    /**
     * 检查是否为开发环境
     */
    isDevelopment() {
        return this.config.isDevelopment;
    }

    /**
     * 检查是否为生产环境
     */
    isProduction() {
        return this.config.isProduction;
    }

    /**
     * 获取环境名称
     */
    getEnvironment() {
        return this.config.environment;
    }

    /**
     * 获取调试信息
     */
    getDebugInfo() {
        return {
            config: this.config,
            location: {
                protocol: window.location.protocol,
                hostname: window.location.hostname,
                port: window.location.port,
                pathname: window.location.pathname,
                search: window.location.search,
                hash: window.location.hash,
                href: window.location.href
            },
            timestamp: Date.now()
        };
    }
}

// 创建全局配置实例
window.dlmmConfig = new DLMMConfig();

// 导出模块
if (typeof module !== 'undefined' && module.exports) {
    module.exports = DLMMConfig;
}

// 向后兼容：提供简单的获取方法
window.getApiConfig = function () {
    return window.dlmmConfig.getConfig();
};

// 输出配置信息到控制台
console.log('🌐 DLMM配置已加载:', window.dlmmConfig.getConfig()); 