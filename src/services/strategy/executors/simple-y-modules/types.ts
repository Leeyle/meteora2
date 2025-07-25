/**
 * 简单Y头寸策略模块类型定义
 * 
 * 定义各个模块间的通信接口和数据类型
 */

import { SimpleYConfig, SimpleYState } from '../SimpleYExecutor';
import { MarketData } from '../../../modules/SmartStopLossModule';

// 模块间通信的核心上下文
export interface SimpleYModuleContext {
    instanceId: string;
    config: SimpleYConfig;
    state: SimpleYState;
}

// 头寸服务接口
export interface ISimpleYPositionService {
    createPosition(context: SimpleYModuleContext): Promise<{
        success: boolean;
        positionAddress?: string;
        error?: string;
    }>;
    
    calculatePositionRange(context: SimpleYModuleContext): Promise<{
        activeBin: number;
        positionLowerBin: number;
        positionUpperBin: number;
    }>;
    
    closePosition(context: SimpleYModuleContext): Promise<{
        success: boolean;
        signature?: string;
        error?: string;
    }>;
    
    recreatePosition(context: SimpleYModuleContext, instanceAwareServiceFactory?: any): Promise<{
        success: boolean;
        newPositionAddress?: string;
        error?: string;
    }>;

    // 🆕 头寸重建相关方法
    initializePositionRecreation(context: SimpleYModuleContext): Promise<void>;
    shouldRecreatePosition(context: SimpleYModuleContext, marketData: any): Promise<any>;
    cleanupRecreationModule(context: SimpleYModuleContext): Promise<void>;
}

// 监控服务接口
export interface ISimpleYMonitoringService {
    startMonitoring(context: SimpleYModuleContext): Promise<void>;
    stopMonitoring(context: SimpleYModuleContext): Promise<void>;
    performMonitoringCycle(context: SimpleYModuleContext): Promise<void>;
    collectMarketData(context: SimpleYModuleContext): Promise<MarketData>;
    setupAnalyticsService(context: SimpleYModuleContext): Promise<void>;
}

// 风险服务接口
export interface ISimpleYRiskService {
    executeStopLoss(context: SimpleYModuleContext): Promise<{
        success: boolean;
        signature?: string;
        error?: string;
    }>;
    
    swapTokens(context: SimpleYModuleContext, amount: string, swapType: 'STOP_LOSS' | 'RECREATION'): Promise<{
        success: boolean;
        outputAmount?: string;
        signature?: string;
        error?: string;
    }>;
    
    broadcastRiskEvent(context: SimpleYModuleContext, eventData: any): Promise<void>;
}

// 工具服务接口
export interface ISimpleYUtilityService {
    optimizeGas(context: SimpleYModuleContext, operationType: string): Promise<void>;
    getTokenPrecision(context: SimpleYModuleContext): Promise<{
        tokenXDecimals: number;
        tokenYDecimals: number;
        tokenXMint: string;
        tokenYMint: string;
    }>;
    cleanup(context: SimpleYModuleContext): Promise<void>;
    logOperation(context: SimpleYModuleContext, message: string, data?: any): Promise<void>;
    logError(context: SimpleYModuleContext, message: string, error?: Error): Promise<void>;
    
    // 🆕 余额获取方法
    getAccountXTokenBalance(context: SimpleYModuleContext): Promise<string>;
    getAccountYTokenBalance(context: SimpleYModuleContext): Promise<string>;
    
    // 🆕 清理和错误处理方法
    executeCleanupRetry(context: SimpleYModuleContext): Promise<void>;
    cleanupSinglePosition(context: SimpleYModuleContext, positionAddress: string): Promise<any>;
    handleCreateFailureCleanup(context: SimpleYModuleContext, error: any): Promise<void>;
    
    // 🆕 从主执行器迁移的方法
    initializeDynamicRecreationSwitch(context: SimpleYModuleContext): Promise<void>;
    updateDynamicRecreationSwitch(context: SimpleYModuleContext, benchmarkYield5Min: number | null | undefined): Promise<void>;
    isDynamicRecreationSwitchEnabled(context: SimpleYModuleContext): boolean;
}

// 模块事件类型
export enum SimpleYModuleEvent {
    POSITION_CREATED = 'position_created',
    POSITION_CLOSED = 'position_closed',
    MONITORING_STARTED = 'monitoring_started',
    MONITORING_STOPPED = 'monitoring_stopped',
    STOP_LOSS_TRIGGERED = 'stop_loss_triggered',
    RECREATION_TRIGGERED = 'recreation_triggered',
    ERROR_OCCURRED = 'error_occurred'
}

// 模块事件数据
export interface SimpleYModuleEventData {
    event: SimpleYModuleEvent;
    instanceId: string;
    timestamp: number;
    data?: any;
    error?: string;
} 