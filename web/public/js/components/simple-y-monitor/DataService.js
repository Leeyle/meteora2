/**
 * 简单Y策略数据服务层
 * 负责API调用和数据存储管理
 */
class SimpleYDataService {
    constructor(environmentAdapter) {
        this.environmentAdapter = environmentAdapter;
        this.apiBaseUrl = environmentAdapter.getApiBaseUrl();
        this.dataStorage = null;

        // 初始化
        this.init();
    }

    /**
     * 初始化数据服务
     */
    async init() {
        try {
            console.log('📊 初始化数据服务');

            // 初始化数据存储服务
            await this.initDataStorage();

            console.log('✅ 数据服务初始化完成');
        } catch (error) {
            console.error('❌ 数据服务初始化失败:', error);
        }
    }

    /**
     * 初始化数据存储服务
     */
    async initDataStorage() {
        try {
            if (window.StrategyDataStorage) {
                this.dataStorage = new window.StrategyDataStorage();
                console.log('✅ 数据存储服务初始化完成');
            } else {
                console.warn('⚠️ 数据存储服务不可用，可能需要先加载 strategy-data-storage.js');
            }
        } catch (error) {
            console.error('❌ 数据存储服务初始化失败:', error);
        }
    }

    /**
     * 通用API请求方法
     */
    async request(endpoint, options = {}) {
        const url = endpoint.startsWith('http') ? endpoint : `${this.apiBaseUrl}${endpoint}`;
        const config = {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                ...options.headers
            },
            ...options
        };

        try {
            console.log(`📡 API请求: ${config.method} ${url}`);

            const response = await fetch(url, config);
            const result = await response.json();

            console.log(`📊 API响应 (${response.status}):`, result);

            if (!response.ok) {
                throw new Error(`API请求失败: ${response.status} ${response.statusText}`);
            }

            return result;
        } catch (error) {
            console.error(`❌ API请求失败 (${url}):`, error);
            throw error;
        }
    }

    /**
     * 测试API连接
     */
    async testAPIConnection() {
        try {
            console.log('🧪 开始测试API连接...');

            const result = await this.request('/api/strategy/list');

            if (result.success) {
                console.log('✅ API连接正常，策略数量:', result.data.length);
                return {
                    success: true,
                    message: `API测试成功，找到 ${result.data.length} 个策略`,
                    data: result.data
                };
            } else {
                console.error('❌ API返回错误:', result.error);
                return {
                    success: false,
                    message: 'API测试失败: ' + result.error
                };
            }
        } catch (error) {
            console.error('❌ API连接测试失败:', error);
            return {
                success: false,
                message: 'API连接失败: ' + error.message
            };
        }
    }

    /**
     * 获取策略列表
     */
    async getStrategyList() {
        try {
            console.log('🔄 开始请求策略列表...');

            const result = await this.request('/api/strategy/list');

            if (result.success && result.data) {
                // 过滤简单Y策略 (支持多个版本的简单Y策略类型)
                const simpleYStrategies = result.data.filter(s => 
                    s.type === 'simple-y' || s.type === 'simple-y-v2' || s.type === 'simple_y'
                );
                console.log('🔍 过滤后的简单Y策略:', simpleYStrategies);

                // 统一策略ID字段：后端返回的是id，前端统一使用instanceId
                simpleYStrategies.forEach(strategy => {
                    if (strategy.id && !strategy.instanceId) {
                        strategy.instanceId = strategy.id;
                    }
                });

                return {
                    success: true,
                    data: simpleYStrategies
                };
            } else {
                console.warn('⚠️ API返回格式异常:', result);
                return {
                    success: false,
                    error: 'API返回格式异常'
                };
            }
        } catch (error) {
            console.error('❌ 获取策略列表失败:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * 暂停策略
     */
    async pauseStrategy(strategyId) {
        try {
            console.log(`🔄 正在暂停策略: ${strategyId}`);

            const result = await this.request(`/api/strategy/${strategyId}/pause`, {
                method: 'POST'
            });

            console.log(`📊 暂停API响应:`, result);
            return result;
        } catch (error) {
            console.error(`❌ 暂停策略失败:`, error);
            throw error;
        }
    }

    /**
     * 启动策略
     */
    async startStrategy(strategyId) {
        try {
            console.log(`🔄 正在启动策略: ${strategyId}`);

            const result = await this.request(`/api/strategy/${strategyId}/start`, {
                method: 'POST'
            });

            console.log(`📊 启动API响应:`, result);
            return result;
        } catch (error) {
            console.error(`❌ 启动策略失败:`, error);
            throw error;
        }
    }

    /**
     * 停止策略
     */
    async stopStrategy(strategyId) {
        try {
            console.log(`🔄 正在停止策略: ${strategyId}`);

            const result = await this.request(`/api/strategy/${strategyId}/stop`, {
                method: 'POST'
            });

            console.log(`📊 停止API响应:`, result);
            return result;
        } catch (error) {
            console.error(`❌ 停止策略失败:`, error);
            throw error;
        }
    }

    /**
     * 删除策略
     */
    async deleteStrategy(strategyId) {
        try {
            console.log(`🔄 正在删除策略: ${strategyId}`);

            const result = await this.request(`/api/strategy/${strategyId}`, {
                method: 'DELETE'
            });

            console.log(`📊 删除API响应:`, result);
            return result;
        } catch (error) {
            console.error(`❌ 删除策略失败:`, error);
            throw error;
        }
    }

    /**
     * 执行手动止损
     */
    async executeManualStopLoss(strategyId) {
        try {
            console.log(`🛑 正在执行手动止损: ${strategyId}`);

            const result = await this.request(`/api/strategy/${strategyId}/manual-stop-loss`, {
                method: 'POST'
            });

            console.log(`📊 手动止损API响应:`, result);
            return result;
        } catch (error) {
            console.error(`❌ 手动止损执行失败:`, error);
            throw error;
        }
    }

    /**
     * 保存策略配置
     */
    async saveStrategyConfig(strategyId, config) {
        try {
            console.log(`📝 正在保存策略配置: ${strategyId}`, config);

            const result = await this.request(`/api/strategy/${strategyId}/config`, {
                method: 'PUT',
                body: JSON.stringify(config)
            });

            console.log(`📊 保存配置API响应:`, result);
            return result;
        } catch (error) {
            console.error(`❌ 保存策略配置失败:`, error);
            throw error;
        }
    }

    /**
     * 获取策略配置
     */
    async getStrategyConfig(strategyId) {
        try {
            console.log(`📋 正在获取策略配置: ${strategyId}`);

            const result = await this.request(`/api/strategy/${strategyId}/config`);

            console.log(`📊 获取配置API响应:`, result);
            return result;
        } catch (error) {
            console.error(`❌ 获取策略配置失败:`, error);
            throw error;
        }
    }

    /**
     * 保存数据到本地存储
     */
    async saveDataToStorage(instanceId, marketData) {
        if (!this.dataStorage) {
            console.warn('⚠️ 数据存储服务未初始化，跳过保存');
            return;
        }

        try {
            await this.dataStorage.saveDataPoint(instanceId, marketData);
            console.log(`✅ 数据保存成功: ${instanceId}`);
        } catch (error) {
            console.error(`❌ 保存策略数据失败 (${instanceId}):`, error);
        }
    }

    /**
     * 从本地存储获取数据
     */
    async getDataFromStorage(instanceId, options = {}) {
        if (!this.dataStorage) {
            console.warn('⚠️ 数据存储服务未初始化');
            return null;
        }

        try {
            const data = await this.dataStorage.getData(instanceId, options);
            console.log(`✅ 数据获取成功: ${instanceId}`);
            return data;
        } catch (error) {
            console.error(`❌ 获取策略数据失败 (${instanceId}):`, error);
            return null;
        }
    }

    /**
     * 清理本地存储数据
     */
    async clearStorageData(instanceId) {
        if (!this.dataStorage) {
            console.warn('⚠️ 数据存储服务未初始化');
            return;
        }

        try {
            await this.dataStorage.clearData(instanceId);
            console.log(`✅ 数据清理成功: ${instanceId}`);
        } catch (error) {
            console.error(`❌ 清理策略数据失败 (${instanceId}):`, error);
        }
    }

    /**
     * 批量处理策略操作
     */
    async batchStrategyOperation(operations) {
        const results = [];

        for (const operation of operations) {
            try {
                let result;

                switch (operation.type) {
                    case 'pause':
                        result = await this.pauseStrategy(operation.strategyId);
                        break;
                    case 'start':
                        result = await this.startStrategy(operation.strategyId);
                        break;
                    case 'stop':
                        result = await this.stopStrategy(operation.strategyId);
                        break;
                    case 'delete':
                        result = await this.deleteStrategy(operation.strategyId);
                        break;
                    case 'manual-stop-loss':
                        result = await this.executeManualStopLoss(operation.strategyId);
                        break;
                    default:
                        throw new Error(`未知操作类型: ${operation.type}`);
                }

                results.push({
                    ...operation,
                    success: true,
                    result
                });

            } catch (error) {
                results.push({
                    ...operation,
                    success: false,
                    error: error.message
                });
            }
        }

        return results;
    }

    /**
     * 获取API健康状态
     */
    async getAPIHealthStatus() {
        try {
            const startTime = Date.now();
            const result = await this.request('/api/health');
            const endTime = Date.now();

            return {
                success: true,
                status: result.status || 'unknown',
                responseTime: endTime - startTime,
                timestamp: Date.now()
            };
        } catch (error) {
            return {
                success: false,
                error: error.message,
                timestamp: Date.now()
            };
        }
    }

    /**
     * 获取调试信息
     */
    getDebugInfo() {
        return {
            apiBaseUrl: this.apiBaseUrl,
            dataStorageAvailable: !!this.dataStorage,
            environmentConfig: this.environmentAdapter.getDebugInfo()
        };
    }

    /**
     * 销毁数据服务
     */
    destroy() {
        console.log('🧹 销毁数据服务');

        // 清理数据存储服务
        if (this.dataStorage && typeof this.dataStorage.destroy === 'function') {
            this.dataStorage.destroy();
        }

        this.dataStorage = null;
    }
}

// 导出模块
if (typeof module !== 'undefined' && module.exports) {
    module.exports = SimpleYDataService;
} else if (typeof window !== 'undefined') {
    window.SimpleYDataService = SimpleYDataService;
} 