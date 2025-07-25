/**
 * 🏗️ DLMM流动性管理系统 - 核心接口定义
 * 
 * 基于PancakeSwap V3架构的模块化接口设计
 */

import { Connection, Keypair, PublicKey, Transaction, VersionedTransaction, SendOptions } from '@solana/web3.js';
const anchor = require('@coral-xyz/anchor');
const { BN: AnchorBN } = anchor;

// 类型和值别名
export type BN = typeof AnchorBN;
export const BN = AnchorBN;

// ==== 依赖注入类型标识 ====
export const TYPES = {
    // 基础设施服务
    EventBus: Symbol.for('EventBus'),
    LoggerService: Symbol.for('LoggerService'),
    ConfigService: Symbol.for('ConfigService'),
    StateService: Symbol.for('StateService'),
    CacheService: Symbol.for('CacheService'),

    // 区块链服务
    SolanaWeb3Service: Symbol.for('SolanaWeb3Service'),
    MultiRPCService: Symbol.for('MultiRPCService'),
    WalletService: Symbol.for('WalletService'),
    GasService: Symbol.for('GasService'),
    TransactionService: Symbol.for('TransactionService'),

    // 外部服务
    JupiterService: Symbol.for('JupiterService'),
    JupiterServiceV7: Symbol.for('JupiterServiceV7'),
    MeteoraService: Symbol.for('MeteoraService'),
    HeliusService: Symbol.for('HeliusService'),

    // 协议适配器
    MeteoraAdapter: Symbol.for('MeteoraAdapter'),
    JupiterAdapter: Symbol.for('JupiterAdapter'),

    // 业务服务
    PositionManager: Symbol.for('PositionManager'),
    YPositionManager: Symbol.for('YPositionManager'),
    XPositionManager: Symbol.for('XPositionManager'),
    PositionFeeHarvester: Symbol.for('PositionFeeHarvester'),
    PositionInfoService: Symbol.for('PositionInfoService'),
    PositionValidatorService: Symbol.for('PositionValidatorService'),
    PositionAnalyticsService: Symbol.for('PositionAnalyticsService'),

    // 旧版分析服务组件已删除，使用新架构

    // 新架构分析服务组件
    UnifiedDataProvider: Symbol.for('UnifiedDataProvider'),
    YieldAnalyzer: Symbol.for('YieldAnalyzer'),
    YieldOperator: Symbol.for('YieldOperator'),

    // 策略相关 - 新架构
    StrategyManager: Symbol.for('StrategyManager'),
    StrategyRegistry: Symbol.for('StrategyRegistry'),
    StrategyScheduler: Symbol.for('StrategyScheduler'),
    StrategyStorage: Symbol.for('StrategyStorage'),
    SimpleYExecutor: Symbol.for('SimpleYExecutor'),
    ChainPositionExecutor: Symbol.for('ChainPositionExecutor'),
    StrategyHealthChecker: Symbol.for('StrategyHealthChecker'),

    // 旧架构已完全移除

    // 钱包相关
    WalletManager: Symbol.for('WalletManager'),
    BalanceManager: Symbol.for('BalanceManager'),

    // 监控服务
    DLMMMonitorService: Symbol.for('DLMMMonitorService'),
    HealthCheckService: Symbol.for('HealthCheckService'),

    // 错误和重试
    ErrorHandlingService: Symbol.for('ErrorHandlingService'),
    RetryService: Symbol.for('RetryService'),
    SynchronousRetryManager: Symbol.for('SynchronousRetryManager')
};

// ==== 基础模块接口 ====
export interface ModuleConfig {
    [key: string]: any;
}

export interface ModuleHealth {
    status: 'healthy' | 'warning' | 'error';
    message: string;
    timestamp: number;
    details?: any;
}

export interface ModuleMetrics {
    uptime: number;
    requestCount: number;
    errorCount: number;
    lastActivity: number;
    performance?: {
        avgResponseTime: number;
        successRate: number;
    };
}

export interface IService {
    readonly name: string;
    readonly version: string;
    readonly dependencies: string[];

    initialize(config: ModuleConfig): Promise<void>;
    start(): Promise<void>;
    stop(): Promise<void>;
    healthCheck(): Promise<ModuleHealth>;
    getMetrics(): ModuleMetrics;
}

// ==== 事件系统接口 ====
export interface DLMMEvent {
    type: string;
    data: any;
    timestamp: number;
    source: string;
    correlationId?: string;
}

export interface EventHandler {
    (event: DLMMEvent): Promise<void> | void;
}

export interface IEventBus extends IService {
    publish<T>(eventType: string, data: T, source?: string): Promise<void>;
    subscribe(eventType: string, handler: EventHandler): string;
    unsubscribe(subscriptionId: string): void;
    getEventHistory(eventType: string, timeframe?: Timeframe): Promise<DLMMEvent[]>;
}

export interface Timeframe {
    unit: 'minute' | 'hour' | 'day' | 'week';
    value: number;
}

// ==== 日志服务接口 ====
export interface LoggerConfig {
    showInConsole: boolean;
    logFile?: string;
    maxFileSize: number;
    maxFiles: number;
    level?: 'debug' | 'info' | 'warn' | 'error';
}

// 兼容新的三层分离架构日志系统
export interface ILoggerService extends IService {
    // 移除旧的兼容接口

    // 新的三层分离架构日志方法
    logSystem(level: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR', message: string, traceId?: string): Promise<void>;
    logBusinessOperation(operation: string, details: any, traceId?: string): Promise<void>;
    logBusinessMonitoring(metric: string, value: any, traceId?: string): Promise<void>;

    // 🔥 新增：便捷方法 - 业务操作 + 系统日志回显
    logBusinessOperationWithEcho(operation: string, details: any, systemMessage?: string, traceId?: string): Promise<void>;
    logStrategyOperationWithEcho(instanceId: string, operation: string, details: any, systemMessage?: string, traceId?: string): Promise<void>;

    // 🆕 新增：实例感知的日志方法
    logInstanceAwareOperation(operation: string, details: any, instanceId?: string, traceId?: string): Promise<void>;
    logFilteredInstanceOperation(operation: string, details: any, instanceId?: string, traceId?: string): Promise<void>;
    logSmartOperation(operation: string, details: any, options?: { instanceId?: string; forceInstanceLog?: boolean; traceId?: string }): Promise<void>;

    createStrategyLogger(instanceId: string): IStrategyLogger;
    removeStrategyLogger(instanceId: string): Promise<void>;
    getStrategyLogger(instanceId: string): IStrategyLogger | undefined;
    getActiveStrategyInstances(): string[];

    logError(category: string, error: string, errorObj?: Error, traceId?: string): Promise<void>;
    flush(): Promise<void>;
    shutdown(): Promise<void>;

    // 日志清理和统计
    clearAllLogs(): Promise<void>;
    getLogStatistics(): Promise<{
        totalFiles: number;
        totalSize: number;
        categories: { [key: string]: { files: number; size: number } };
    }>;

    // 日志查询方法
    getRecentLogs(limit?: number): Promise<any[]>;
    getErrorLogs(limit?: number): Promise<any[]>;
    getBusinessOperationLogs(limit?: number): Promise<any[]>;
    getBusinessMonitoringLogs(limit?: number): Promise<any[]>;
    getLogsByCategory(category: string, limit?: number): Promise<any[]>;
    getAvailableLogFiles(): Promise<string[]>;
    getMixedLogs(limit?: number): Promise<any[]>;
}

// 策略实例专用日志器接口
export interface IStrategyLogger {
    logOperation(operation: string, details: any, traceId?: string): Promise<void>;
    logMonitoring(metric: string, value: any, traceId?: string): Promise<void>;
    logError(error: string, errorObj?: Error, traceId?: string): Promise<void>;
    cleanup(): Promise<void>;

    // 扩展方法
    logLifecycle(event: 'start' | 'stop' | 'pause' | 'resume', details?: any): Promise<void>;
    logTrade(action: string, details: any): Promise<void>;
    logPosition(action: string, details: any): Promise<void>;
    logPerformance(metric: string, value: number, unit?: string): Promise<void>;
    logPriceMonitoring(data: any): Promise<void>;
}

// ILogger接口已移除，使用新的三层分离架构

// ==== Solana区块链服务接口 ====
export interface SolanaConfig {
    network: string;
    rpcEndpoints: string[];
    priorityFee: number;
    commitment: string;
    timeout: number;
    wsEndpoint?: string;
}

export interface CustomSendOptions extends SendOptions {
    signers?: Keypair[];
}

export interface ISolanaWeb3Service extends IService {
    getConnection(): Connection;
    getCurrentEndpoint(): string;
    switchToNextEndpoint(): Promise<boolean>;
    sendTransaction(transaction: Transaction | VersionedTransaction, sendOptions?: CustomSendOptions): Promise<TransactionResult>;
    getBalance(publicKey: PublicKey): Promise<BalanceResult>;
    getTokenBalance(tokenAccount: PublicKey): Promise<BalanceResult>;
    getAccountInfo(publicKey: PublicKey): Promise<AccountInfoResult>;
    simulateTransaction(transaction: Transaction | VersionedTransaction): Promise<{
        success: boolean;
        logs?: string[];
        error?: string;
        unitsConsumed?: number;
    }>;
    getLatestBlockhash(): Promise<{ blockhash: string; lastValidBlockHeight: number } | null>;
}

export interface IMultiRPCService extends IService {
    getCurrentEndpoint(): string;
    getAllEndpoints(): string[];
    switchToNext(): Promise<void>;
    switchToBest(): Promise<void>;
    addEndpoint(endpoint: string): void;
    removeEndpoint(endpoint: string): void;
    getEndpointMetrics(): EndpointMetrics[];
    getNextHealthyEndpoint(): Promise<string | null>;
}

export interface EndpointMetrics {
    endpoint: string;
    latency: number;
    successRate: number;
    lastCheck: number;
    isActive: boolean;
}

// ==== 交易和余额查询结果类型 ====
export type TransactionStatus = 'pending' | 'confirmed' | 'finalized' | 'failed';

export interface TransactionResult {
    success: boolean;
    signature: string;
    status?: TransactionStatus;
    slot?: number;
    error?: string;
    gasUsed?: number;
}

export interface BalanceResult {
    success: boolean;
    balance: number;
    lamports?: number;
    decimals?: number;
    uiAmount?: number | null;
    error?: string;
}

export interface AccountInfoResult {
    success: boolean;
    exists: boolean;
    accountInfo?: {
        executable: boolean;
        owner: string;
        lamports: number;
        data: Buffer;
        rentEpoch?: number;
    };
    error?: string;
}

// ==== 钱包服务接口 ====
export interface WalletInfo {
    address: string | null;
    isEncrypted: boolean;
    createdAt: number | null;
    lastUsed: number | null;
    status?: 'not_created' | 'locked' | 'unlocked' | 'error';
    currentAddress?: string | null;
    message?: string;
}

export interface IWalletService extends IService {
    createWallet(password?: string): Promise<WalletInfo>;
    importFromPrivateKey(privateKey: string, password?: string): Promise<WalletInfo>;
    loadWallet(password?: string): Promise<Keypair>;
    saveWallet(keypair: Keypair, password?: string): Promise<void>;
    deleteWallet(): Promise<void>;
    isWalletExists(): boolean;
    getWalletInfo(): Promise<WalletInfo | null>;
    lockWallet(): void;
    unlockWallet(password: string): Promise<boolean>;
    isWalletUnlocked(): boolean;
    getSolBalance(): Promise<number>;
    unlock(password: string): Promise<boolean>;
    getCurrentKeypair(): Keypair | null;
}

// ==== 头寸相关接口 ====
export interface PositionInfo {
    address: string;
    owner: string;
    poolAddress: string;
    lowerBinId: number;
    upperBinId: number;
    binIds: number[];
    totalXAmount: string;
    totalYAmount: string;
    fees: {
        feeX: string;
        feeY: string;
    };
    lastUpdated: number;
    inRange: boolean;
}

export interface CreatePositionParams {
    poolAddress: string;
    lowerBinId: number;
    upperBinId: number;
    amount: string;
    tokenMint: string;
    slippageBps?: number;
    priorityFee?: number;
}

export interface PositionResult {
    success: boolean;
    positionAddress?: string;
    signature?: string;
    error?: string;
    gasUsed?: number;
    closureDetails?: any; // 头寸关闭详情
}

export interface IPositionManager extends IService {
    createPosition(params: CreatePositionParams): Promise<PositionResult>;
    closePosition(positionAddress: string, password?: string): Promise<PositionResult>;
    getPosition(positionAddress: string): Promise<PositionInfo | null>;
    getUserPositions(userAddress: string): Promise<PositionInfo[]>;
    validatePosition(positionAddress: string): Promise<boolean>;
    refreshPosition(positionAddress: string): Promise<boolean>;
    addPositionToCache(positionState: any): Promise<boolean>;
    removePositionState(positionAddress: string): Promise<void>;

    // 🆕 新增的链上头寸信息获取方法
    getPositionOnChainInfo(positionAddress: string): Promise<{
        success: boolean;
        data?: {
            address: string;
            owner: string;
            poolAddress: string;
            lowerBinId: number;
            upperBinId: number;
            totalXAmount: string;
            totalYAmount: string;
            fees: {
                feeX: string;
                feeY: string;
            };
            inRange: boolean;
            activeBinId: number;
            binCount: number;
            lastUpdated: number;
            tokenInfo?: {
                tokenXSymbol: string;
                tokenYSymbol: string;
                tokenXDecimals: number;
                tokenYDecimals: number;
            };
            formattedAmounts?: {
                tokenXFormatted: string;
                tokenYFormatted: string;
            };
            // 新增字段
            tokenXAmount?: string;
            tokenYAmount?: string;
            xAmount?: string;
            yAmount?: string;
            binXAmount?: string;
            binYAmount?: string;
            tokenXMeta?: {
                mint: string;
                decimals: number;
                symbol?: string;
                name?: string;
            };
            tokenYMeta?: {
                mint: string;
                decimals: number;
                symbol?: string;
                name?: string;
            };
        };
        error?: string;
    }>;

    getPositionWithRefresh?(positionAddress: string, fromChain?: boolean): Promise<{
        success: boolean;
        data?: any;
        error?: string;
        meta?: any;
    }>;

    getBatchPositionsOnChainInfo(positionAddresses: string[]): Promise<{
        success: boolean;
        data?: Array<{
            address: string;
            success: boolean;
            info?: any;
            error?: string;
        }>;
        summary?: {
            total: number;
            successful: number;
            failed: number;
        };
    }>;
}

export interface IYPositionManager extends IPositionManager {
    createYPosition(params: CreateYPositionParams): Promise<PositionResult>;
    closeYPosition(positionAddress: string): Promise<PositionResult>;
    getYPositionRange(activeBin: number, binRange: number): Promise<[number, number]>;
}

export interface IXPositionManager extends IPositionManager {
    createXPosition(params: CreateXPositionParams): Promise<PositionResult>;
    closeXPosition(positionAddress: string): Promise<PositionResult>;
    getXPositionRange(activeBin: number, binRange: number): Promise<[number, number]>;
}

export interface CreateYPositionParams extends CreatePositionParams {
    binRange: number;
    activeBin: number;
    strategy?: string;
}

export interface CreateXPositionParams extends CreatePositionParams {
    binRange: number;
    activeBin: number;
}

// 扩展CreatePositionParams接口
interface CreatePositionParamsExtended extends CreatePositionParams {
    strategy?: string;
    tags?: string[];
    notes?: string;
}

// ==== Jupiter交易接口 ====
export interface JupiterQuote {
    inputMint: string;
    outputMint: string;
    inAmount: string;
    outAmount: string;
    priceImpactPct: number;
    marketInfos: any[];
}

export interface SwapParams {
    inputMint: string;
    outputMint: string;
    amount: string;
    slippageBps: number;
    userPublicKey: string;
    instanceId?: string;
}

export interface SwapResult {
    signature: string;
    inputAmount: string;
    outputAmount: string;
    priceImpact: number;
}

export interface IJupiterService extends IService {
    getQuote(inputMint: string, outputMint: string, amount: string, slippageBps?: number): Promise<JupiterQuote>;
    executeSwap(params: SwapParams): Promise<SwapResult>;
    getTokenPrices(mints: string[]): Promise<Record<string, number>>;
    getSupportedTokens(): Promise<Array<{
        address: string;
        symbol: string;
        name: string;
        decimals: number;
        logoURI?: string;
    }>>;
    getBatchRoutes(requests: Array<{
        inputMint: string;
        outputMint: string;
        amount: string;
        slippageBps?: number;
    }>): Promise<JupiterQuote[]>;
}

// ==== Meteora DLMM服务接口 ====
export interface IMeteoraService extends IService {
    getActiveBin(poolAddress: string): Promise<number>;
    getPoolInfo(poolAddress: string): Promise<PoolInfo>;
    getBinInfo(poolAddress: string, binId: number): Promise<BinInfo>;
    getBinRange(poolAddress: string, startBin: number, endBin: number): Promise<BinInfo[]>;
    subscribeActiveBinChanges(poolAddress: string, callback: (activeBin: number) => void): string;
    unsubscribeActiveBinChanges(subscriptionId: string): void;
    createPositionTransaction(params: any): Promise<Transaction>;
    createRemoveLiquidityTransaction(
        poolAddress: string,
        userAddress: string,
        positionAddress: string,
        binIds: number[],
        slippageTolerance?: number
    ): Promise<Transaction>;
    getUserPositions(userAddress: string, poolAddress?: string): Promise<any[]>;
    calculateBinPrice(poolAddress: string, binId: number): Promise<number>;
    // 优化方法 - 一次性获取价格和bin信息
    getPoolPriceAndBin?(poolAddress: string): Promise<{
        activeBin: number;
        activePrice: number;
        tokenX: any;
        tokenY: any;
        binStep: number;
        activeBinInfo: BinInfo;
    }>;
    // 实时获取方法 - 绕过缓存获取最新数据
    getRealtimePoolState?(poolAddress: string): Promise<{
        poolAddress: string;
        activeBin: number;
        activePrice: number;
        tokenX: any;
        tokenY: any;
        binStep: number;
        lastUpdated: number;
    }>;
}

// ==== Helius增强RPC服务接口 ====
export interface IHeliusService extends IService {
    getTransactionHistory(address: string, options?: any): Promise<any[]>;
    getEnhancedAccountInfo(address: string): Promise<any>;
    getBatchTransactions(signatures: string[]): Promise<any[]>;
}

// ==== 业务服务接口 ====
export interface IPositionInfoService extends IService {
    getPositionAnalytics(positionAddress: string): Promise<any>;
    getPortfolioSummary(userAddress: string): Promise<any>;
    getPositionMetrics(positionAddress: string, timeframe?: string): Promise<any>;
    comparePositions(position1Address: string, position2Address: string): Promise<any>;
    getPositionHistory(positionAddress: string, days?: number): Promise<any[]>;
    searchPositions(criteria: any): Promise<PositionInfo[]>;
}

export interface IPositionFeeHarvester extends IService {
    // ✅ 重构后的3个核心方法
    getPositionFeesFromChain(positionAddress: string): Promise<any>;
    calculateTotalYTokenValue(tokenXAmount: string, tokenYAmount: string, poolAddress: string, tokenXDecimals: number, tokenYDecimals: number): Promise<any>;
    harvestPositionFees(positionAddress: string): Promise<any>;

    // 🆕 智能池子级别批量提取方法
    harvestPoolPositionFees(poolAddress: string, positionAddresses: string[]): Promise<any>;

    // ⚠️ 已删除但保留接口兼容性的空方法
    batchHarvestFees(positionAddresses: string[]): Promise<any[]>;
    getAllHarvestablePositions(userAddress?: string): Promise<any[]>;
    getAllPositionFees(userAddress?: string): Promise<any[]>;
}

// ==== 策略引擎服务接口 ====
export interface IStrategyEngine extends IService {
    registerStrategy(strategyConfig: any): Promise<boolean>;
    createStrategyInstance(strategyId: string, parameters?: Record<string, any>): Promise<string | null>;
    startStrategyInstance(instanceId: string): Promise<boolean>;
    stopStrategyInstance(instanceId: string): Promise<boolean>;
    getStrategyInstances(filter?: any): any[];
}

export interface IStrategyInstanceManager extends IService {
    createInstance(strategyId: string, parameters?: Record<string, any>, options?: any): Promise<string | null>;
    batchOperation(operation: string, instanceIds: string[], parameters?: Record<string, any>): Promise<string>;
    cloneInstance(sourceInstanceId: string, options?: any): Promise<string | null>;
    searchInstances(criteria: any): Promise<any[]>;
    getInstanceStatistics(): Promise<any>;
    createTemplate(template: any): Promise<string>;
    getBatchOperationStatus(batchId: string): any;
}

export interface IStrategyStateManager extends IService {
    createSnapshot(instanceId: string, strategyInstance: any): Promise<string | null>;
    recoverState(instanceId: string, options?: any): Promise<any>;
    getSnapshotHistory(instanceId: string, limit?: number): Promise<any[]>;
    validateSnapshot(snapshot: any): Promise<any>;
    createMigrationTask(instanceIds: string[], targetVersion: string): Promise<string | null>;
    getMigrationTaskStatus(taskId: string): any;
}

export interface IStrategyRecoveryManager extends IService {
    recordFailure(instanceId: string, failureType: string, errorMessage: string, context: any): Promise<string>;
    triggerRecovery(instanceId: string, action: string): Promise<boolean>;
    getFailureHistory(instanceId?: string, limit?: number): Promise<any[]>;
    getRecoveryTaskStatus(taskId: string): any;
    analyzeFailurePatterns(timeWindow?: number): Promise<any>;
}

export interface IStrategyMonitor extends IService {
    getMonitoringDashboard(): Promise<any>;
    generatePerformanceReport(instanceId: string, periodHours?: number): Promise<any>;
    getAlertHistory(instanceId?: string, limit?: number): Promise<any[]>;
    acknowledgeAlert(alertId: string): Promise<boolean>;
}

// ==== DLMM监控接口 ====
export interface BinInfo {
    binId: number;
    price: number;
    liquidityX: string;
    liquidityY: string;
    totalLiquidity: string;
}

export interface PoolInfo {
    address: string;
    tokenX: string;
    tokenY: string;
    binStep: number;
    activeBin: number;
    activePrice: number;
    reserve: {
        reserveX: string;
        reserveY: string;
    };
    fees: {
        totalFeeX: string;
        totalFeeY: string;
    };
}

export interface IDLMMMonitorService extends IService {
    getActiveBin(poolAddress: string): Promise<number>;
    getPoolInfo(poolAddress: string): Promise<PoolInfo>;
    getBinInfo(poolAddress: string, binId: number): Promise<BinInfo>;
    getBinRange(poolAddress: string, startBin: number, endBin: number): Promise<BinInfo[]>;
    subscribeActiveBinChanges(poolAddress: string, callback: (activeBin: number) => void): string;
    unsubscribeActiveBinChanges(subscriptionId: string): void;
}

// ==== 策略相关接口 ====
export type StrategyType = 'simple-y' | 'dual-position' | 'price-trigger' | 'force-stop' | 'chain-position';

export type StrategyStatus = 'created' | 'running' | 'paused' | 'stopped' | 'error' | 'completed';

export interface StrategyConfig {
    type: StrategyType;
    poolAddress: string;
    yAmount: number;
    xAmount?: number;
    binRange: number;
    xBinRange?: number;
    stopLossBinOffset: number;
    outOfRangeTimeoutMinutes: number;
    forceStopPrice?: number;
    triggerPrice?: number;
    slippageBps?: number;

    // 扩展配置
    [key: string]: any;
}

export interface StrategyState {
    instanceId: string;
    type: StrategyType;
    status: StrategyStatus;
    config: StrategyConfig;
    currentStage: string;
    positions: {
        yPosition?: string;
        xPosition?: string;
    };
    metadata: {
        createdAt: number;
        startedAt?: number;
        lastUpdate: number;
        executionCount: number;
        errorCount: number;
    };
    runtime: {
        activeBin?: number;
        lastActiveBin?: number;
        outOfRangeStartTime?: number;
        lastMonitorTime?: number;
    };
}

export interface StrategyResult {
    success: boolean;
    message: string;
    data?: any;
    error?: string;
    nextStage?: string;
    shouldContinue?: boolean;
}

export interface IStrategy {
    readonly type: StrategyType;
    readonly name: string;
    readonly description: string;

    execute(state: StrategyState, context: StrategyContext): Promise<StrategyResult>;
    validate(config: StrategyConfig): boolean;
    getDefaultConfig(): Partial<StrategyConfig>;
}

export interface StrategyContext {
    // 服务依赖
    solanaService: ISolanaWeb3Service;
    positionManager: IPositionManager;
    jupiterService: IJupiterService;
    dlmmMonitor: IDLMMMonitorService;
    eventBus: IEventBus;
    // logger已移除，使用注入的loggerService

    // 工具方法
    utils: {
        sleep(ms: number): Promise<void>;
        retry<T>(operation: () => Promise<T>, maxRetries: number): Promise<T>;
        calculateBinRange(activeBin: number, percentage: number, binStep: number): [number, number];
    };
}

export interface IStrategyEngine extends IService {
    createStrategy(config: StrategyConfig): Promise<string>;
    startStrategy(instanceId: string): Promise<void>;
    stopStrategy(instanceId: string): Promise<void>;
    pauseStrategy(instanceId: string): Promise<void>;
    resumeStrategy(instanceId: string): Promise<void>;
    deleteStrategy(instanceId: string): Promise<void>;

    getStrategy(instanceId: string): Promise<StrategyState | null>;
    getAllStrategies(): Promise<StrategyState[]>;
    getActiveStrategies(): Promise<StrategyState[]>;

    // 恢复相关
    recoverStrategies(): Promise<void>;
    saveState(state: StrategyState): Promise<void>;
    loadState(instanceId: string): Promise<StrategyState | null>;
}

// ==== 配置管理接口 ====
export interface IConfigService extends IService {
    get<T>(key: string, defaultValue?: T): T;
    set<T>(key: string, value: T): void;
    has(key: string): boolean;
    getAll(): any;
    load(): Promise<void>;
    reload(): Promise<void>;
    watch(key: string, callback: (value: any) => void): string;
    unwatch(watchId: string): void;
}

// ==== 状态管理接口 ====
export interface IStateService extends IService {
    save<T>(key: string, data: T): Promise<void>;
    load<T>(key: string): Promise<T | null>;
    delete(key: string): Promise<void>;
    exists(key: string): Promise<boolean>;
    list(pattern?: string): Promise<string[]>;
    backup(): Promise<string>;
    restore(backupPath: string): Promise<void>;
}

// ==== 缓存服务接口 ====
export interface ICacheService extends IService {
    get<T>(key: string): Promise<T | null>;
    set<T>(key: string, value: T, ttl?: number): Promise<void>;
    delete(key: string): Promise<void>;
    clear(): Promise<void>;
    has(key: string): Promise<boolean>;
    keys(pattern?: string): Promise<string[]>;
}

// ==== 错误处理接口 ====
export interface DLMMError extends Error {
    code: string;
    category: 'network' | 'validation' | 'execution' | 'configuration' | 'system';
    retryable: boolean;
    context?: any;
}

export interface RetryConfig {
    maxRetries: number;
    delayMs: number;
    backoffFactor: number;
    retryCondition?: (error: any) => boolean;
}

export interface IRetryService extends IService {
    executeWithRetry<T>(
        operation: () => Promise<T>,
        config?: Partial<RetryConfig>
    ): Promise<T>;

    retryUntilCondition(
        condition: () => Promise<boolean>,
        config?: Partial<RetryConfig>
    ): Promise<boolean>;
}

// ==== API响应格式 ====
export interface ApiResponse<T = any> {
    success: boolean;
    data?: T;
    error?: string;
    meta: {
        timestamp: string;
        requestId: string;
        version: string;
    };
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
    pagination: {
        page: number;
        limit: number;
        total: number;
        hasNext: boolean;
        hasPrev: boolean;
    };
}



// ==== 健康检查接口 ====
export interface SystemHealth {
    status: 'healthy' | 'degraded' | 'unhealthy';
    services: { [serviceName: string]: ModuleHealth };
    system: {
        uptime: number;
        memory: {
            used: number;
            total: number;
            percentage: number;
        };
        cpu: {
            percentage: number;
        };
    };
    timestamp: number;
}

export interface IHealthCheckService extends IService {
    checkSystem(): Promise<SystemHealth>;
    checkService(serviceName: string): Promise<ModuleHealth>;
    registerHealthCheck(serviceName: string, checkFn: () => Promise<ModuleHealth>): void;
}

// ==== 费用和Gas相关 ====
export interface GasEstimate {
    baseFee: number;
    priorityFee: number;
    totalFee: number;
    units: number;
}

export interface IGasService extends IService {
    estimateGas(transaction: Transaction): Promise<GasEstimate>;
    getOptimalPriorityFee(): Promise<number>;
    getCurrentBaseFee(): Promise<number>;
    getCurrentGasSettings(): Promise<{ baseFee: number; priorityFee: number; }>;
    updatePriorityFeeForTransaction(): Promise<void>;
    getNetworkCongestion(): 'low' | 'medium' | 'high';
    addComputeBudgetInstructions(transaction: Transaction, estimate?: GasEstimate): Promise<Transaction>;
    optimizeGasForOperation(operationType: string): Promise<void>;

    // 🚀 新增：止损和紧急操作的最高级优先费用
    getStopLossMaxPriorityFee(): Promise<number>;
    getEmergencyMaxPriorityFee(): Promise<number>;

    // 🚀 新增：止损模式控制
    activateStopLossModeManually(): void;
    deactivateStopLossMode(): void;

    // 🚨 新增：智能费用调整方法
    getEmergencyPriorityFeeAfterTimeout(): Promise<number>;
    getSmartPriorityFee(hasRecentFailures?: boolean): Promise<number>;
} 