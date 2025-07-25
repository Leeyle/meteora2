/**
 * 📊 策略数据存储服务
 * 
 * 功能：
 * 1. 保存策略实例的5种核心数据到IndexedDB
 * 2. 按时间和策略ID查询历史数据
 * 3. 自动清理过期数据
 */
class StrategyDataStorage {
    constructor() {
        this.dbName = 'StrategyAnalyticsDB';
        this.dbVersion = 1;
        this.storeName = 'strategy_data';
        this.db = null;

        // 数据保留期（默认7天）
        this.retentionDays = 7;

        this.init();
    }

    /**
     * 初始化IndexedDB
     */
    async init() {
        try {
            this.db = await this.openDatabase();
            console.log('✅ 策略数据存储服务初始化完成');

            // 启动定期清理
            this.startCleanupTimer();
        } catch (error) {
            console.error('❌ 策略数据存储服务初始化失败:', error);
        }
    }

    /**
     * 打开数据库
     */
    openDatabase() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.dbVersion);

            request.onerror = () => {
                reject(new Error('无法打开数据库'));
            };

            request.onsuccess = (event) => {
                resolve(event.target.result);
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;

                // 创建数据表
                const store = db.createObjectStore(this.storeName, {
                    keyPath: 'id',
                    autoIncrement: true
                });

                // 创建索引
                store.createIndex('strategyId', 'strategyId', { unique: false });
                store.createIndex('timestamp', 'timestamp', { unique: false });
                store.createIndex('strategyTime', ['strategyId', 'timestamp'], { unique: false });
            };
        });
    }

    /**
     * 保存策略数据点
     * @param {string} strategyId 策略ID
     * @param {object} data 数据对象
     */
    async saveDataPoint(strategyId, data) {
        if (!this.db) {
            console.warn('⚠️ 数据库未初始化，跳过数据保存');
            return false;
        }

        try {
            const dataPoint = {
                strategyId: strategyId,
                timestamp: Date.now(),
                data: {
                    // 活跃Bin百分比
                    activeBinPercentage: this.calculateBinPercentage(data),

                    // 历史收益率百分比（5分钟、15分钟、1小时）
                    yieldRate5m: data.historicalYieldRates?.feeYieldEfficiency?.last5Minutes || 0,
                    yieldRate15m: data.historicalYieldRates?.feeYieldEfficiency?.last15Minutes || 0,
                    yieldRate1h: data.historicalYieldRates?.feeYieldEfficiency?.lastHour || 0,

                    // 历史价格变化百分比（5分钟、15分钟、1小时）
                    priceChange5m: data.historicalPriceChanges?.last5Minutes || 0,
                    priceChange15m: data.historicalPriceChanges?.last15Minutes || 0,
                    priceChange1h: data.historicalPriceChanges?.lastHour || 0,

                    // 盈亏百分比
                    pnlPercentage: data.netPnLPercentage || 0,

                    // 🆕 基准收益率（存储为百分比数值，null表示不可用）
                    benchmarkYieldRate5m: data.benchmarkYieldRates?.current5MinuteBenchmark !== null && data.benchmarkYieldRates?.current5MinuteBenchmark !== undefined ? (data.benchmarkYieldRates.current5MinuteBenchmark * 100) : null,
                    benchmarkYieldRate5mAvg: data.benchmarkYieldRates?.average5MinuteBenchmark !== null && data.benchmarkYieldRates?.average5MinuteBenchmark !== undefined ? (data.benchmarkYieldRates.average5MinuteBenchmark * 100) : null,
                    benchmarkYieldRate15mAvg: data.benchmarkYieldRates?.average15MinuteBenchmark !== null && data.benchmarkYieldRates?.average15MinuteBenchmark !== undefined ? (data.benchmarkYieldRates.average15MinuteBenchmark * 100) : null,
                    benchmarkYieldRate30mAvg: data.benchmarkYieldRates?.average30MinuteBenchmark !== null && data.benchmarkYieldRates?.average30MinuteBenchmark !== undefined ? (data.benchmarkYieldRates.average30MinuteBenchmark * 100) : null
                },
                source: 'strategy-card-update'
            };

            const transaction = this.db.transaction([this.storeName], 'readwrite');
            const store = transaction.objectStore(this.storeName);

            await new Promise((resolve, reject) => {
                const request = store.add(dataPoint);
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
            });


            return true;

        } catch (error) {
            console.error(`❌ 保存策略数据失败 (${strategyId}):`, error);
            return false;
        }
    }

    /**
     * 计算活跃Bin百分比
     */
    calculateBinPercentage(data) {
        const { activeBin, positionLowerBin, positionUpperBin } = data;

        if (activeBin === undefined || positionLowerBin === undefined || positionUpperBin === undefined) {
            return 0;
        }

        // 如果活跃BIN在头寸范围内
        if (activeBin >= positionLowerBin && activeBin <= positionUpperBin) {
            const binPositionInRange = activeBin - positionLowerBin;
            const totalRange = positionUpperBin - positionLowerBin;
            return totalRange > 0 ? (binPositionInRange / totalRange) * 100 : 0;
        }

        // 如果在范围外，返回负值或超过100的值以表示偏离
        return activeBin < positionLowerBin ?
            ((activeBin - positionLowerBin) / (positionUpperBin - positionLowerBin)) * 100 :
            ((activeBin - positionLowerBin) / (positionUpperBin - positionLowerBin)) * 100;
    }

    /**
     * 查询策略的历史数据
     * @param {string} strategyId 策略ID
     * @param {number} startTime 开始时间戳
     * @param {number} endTime 结束时间戳
     * @param {array} dataTypes 数据类型数组（可选）
     */
    async getDataRange(strategyId, startTime, endTime, dataTypes = null) {
        if (!this.db) {
            console.warn('⚠️ 数据库未初始化');
            return [];
        }

        try {
            const transaction = this.db.transaction([this.storeName], 'readonly');
            const store = transaction.objectStore(this.storeName);
            const index = store.index('strategyTime');

            const range = IDBKeyRange.bound([strategyId, startTime], [strategyId, endTime]);

            const data = await new Promise((resolve, reject) => {
                const results = [];
                const request = index.openCursor(range);

                request.onsuccess = (event) => {
                    const cursor = event.target.result;
                    if (cursor) {
                        results.push(cursor.value);
                        cursor.continue();
                    } else {
                        resolve(results);
                    }
                };

                request.onerror = () => reject(request.error);
            });



            return data.sort((a, b) => a.timestamp - b.timestamp);

        } catch (error) {
            console.error(`❌ 查询策略数据失败 (${strategyId}):`, error);
            return [];
        }
    }

    /**
     * 获取所有有数据的策略ID列表
     */
    async getAvailableStrategies() {
        if (!this.db) return [];

        try {
            const transaction = this.db.transaction([this.storeName], 'readonly');
            const store = transaction.objectStore(this.storeName);
            const index = store.index('strategyId');

            const strategies = new Set();

            await new Promise((resolve, reject) => {
                const request = index.openKeyCursor();
                request.onsuccess = (event) => {
                    const cursor = event.target.result;
                    if (cursor) {
                        strategies.add(cursor.key);
                        cursor.continue();
                    } else {
                        resolve();
                    }
                };
                request.onerror = () => reject(request.error);
            });

            return Array.from(strategies);

        } catch (error) {
            console.error('❌ 获取策略列表失败:', error);
            return [];
        }
    }

    /**
     * 删除策略的所有数据
     * @param {string} strategyId 策略ID
     */
    async deleteStrategyData(strategyId) {
        if (!this.db) return false;

        try {
            const transaction = this.db.transaction([this.storeName], 'readwrite');
            const store = transaction.objectStore(this.storeName);
            const index = store.index('strategyId');

            const request = index.openKeyCursor(IDBKeyRange.only(strategyId));

            await new Promise((resolve, reject) => {
                request.onsuccess = (event) => {
                    const cursor = event.target.result;
                    if (cursor) {
                        store.delete(cursor.primaryKey);
                        cursor.continue();
                    } else {
                        resolve();
                    }
                };
                request.onerror = () => reject(request.error);
            });

            console.log(`🗑️ 已删除策略数据: ${strategyId}`);
            return true;

        } catch (error) {
            console.error(`❌ 删除策略数据失败 (${strategyId}):`, error);
            return false;
        }
    }

    /**
     * 清理过期数据
     */
    async cleanupOldData() {
        if (!this.db) return;

        try {
            const cutoffTime = Date.now() - (this.retentionDays * 24 * 60 * 60 * 1000);

            const transaction = this.db.transaction([this.storeName], 'readwrite');
            const store = transaction.objectStore(this.storeName);
            const index = store.index('timestamp');

            const range = IDBKeyRange.upperBound(cutoffTime);
            let deletedCount = 0;

            await new Promise((resolve, reject) => {
                const request = index.openKeyCursor(range);
                request.onsuccess = (event) => {
                    const cursor = event.target.result;
                    if (cursor) {
                        store.delete(cursor.primaryKey);
                        deletedCount++;
                        cursor.continue();
                    } else {
                        resolve();
                    }
                };
                request.onerror = () => reject(request.error);
            });

            if (deletedCount > 0) {
                console.log(`🧹 清理了 ${deletedCount} 条过期数据 (${this.retentionDays}天前)`);
            }

        } catch (error) {
            console.error('❌ 清理过期数据失败:', error);
        }
    }

    /**
     * 启动定期清理任务
     */
    startCleanupTimer() {
        // 每小时清理一次
        setInterval(() => {
            this.cleanupOldData();
        }, 60 * 60 * 1000);
    }

    /**
     * 获取存储统计信息
     */
    async getStorageStats() {
        if (!this.db) return null;

        try {
            const transaction = this.db.transaction([this.storeName], 'readonly');
            const store = transaction.objectStore(this.storeName);
            const timestampIndex = store.index('timestamp');
            const strategyIndex = store.index('strategyId');

            // 在同一个事务中获取所有统计信息
            const [totalCount, strategiesList, oldestTime, newestTime] = await Promise.all([
                // 获取总数据点数
                new Promise((resolve, reject) => {
                    const request = store.count();
                    request.onsuccess = () => resolve(request.result);
                    request.onerror = () => reject(request.error);
                }),

                // 获取策略列表
                new Promise((resolve, reject) => {
                    const strategies = new Set();
                    const request = strategyIndex.openKeyCursor();
                    request.onsuccess = (event) => {
                        const cursor = event.target.result;
                        if (cursor) {
                            strategies.add(cursor.key);
                            cursor.continue();
                        } else {
                            resolve(Array.from(strategies));
                        }
                    };
                    request.onerror = () => reject(request.error);
                }),

                // 获取最早时间
                new Promise((resolve, reject) => {
                    const request = timestampIndex.openCursor();
                    request.onsuccess = (event) => {
                        const cursor = event.target.result;
                        resolve(cursor ? cursor.value.timestamp : null);
                    };
                    request.onerror = () => reject(request.error);
                }),

                // 获取最新时间
                new Promise((resolve, reject) => {
                    const request = timestampIndex.openCursor(null, 'prev');
                    request.onsuccess = (event) => {
                        const cursor = event.target.result;
                        resolve(cursor ? cursor.value.timestamp : null);
                    };
                    request.onerror = () => reject(request.error);
                })
            ]);

            return {
                totalDataPoints: totalCount,
                strategiesCount: strategiesList.length,
                strategies: strategiesList,
                oldestData: oldestTime ? new Date(oldestTime) : null,
                newestData: newestTime ? new Date(newestTime) : null,
                retentionDays: this.retentionDays
            };

        } catch (error) {
            console.error('❌ 获取存储统计失败:', error);
            return null;
        }
    }
}

// 导出到全局
window.StrategyDataStorage = StrategyDataStorage; 