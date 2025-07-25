/**
 * 累积收益追踪管理器
 * 负责记录提取历史和计算真实总收益
 */

import { injectable, inject } from 'tsyringe';
import * as fs from 'fs/promises';
import * as path from 'path';
import { TYPES } from '../../../types/interfaces';
import type { ILoggerService } from '../../../types/interfaces';

// 累积收益追踪数据结构
export interface AccumulatedYieldTracker {
    poolAddress: string;
    positionAddresses: string[];
    totalExtractedYield: string;  // 累积提取的Y代币价值
    extractionHistory: YieldExtractionRecord[];
    lastUpdated: number;
}

// 单次提取记录
export interface YieldExtractionRecord {
    timestamp: number;
    extractedXAmount: string;     // 原始X代币数量
    extractedYAmount: string;     // 原始Y代币数量
    calculatedYValue: string;     // 计算后的Y代币等价值
    transactionSignature: string;
    gasUsed: number;
}

// 真实收益计算结果
export interface RealYieldCalculation {
    currentPendingYield: string;      // 当前待提取收益
    totalExtractedYield: string;      // 历史累积提取
    realTotalYield: string;           // 真实总收益
    extractionCount: number;          // 提取次数
}

@injectable()
export class AccumulatedYieldManager {
    private yieldTrackers: Map<string, AccumulatedYieldTracker> = new Map();
    private readonly STORAGE_PATH: string;
    private logger: any;

    constructor(
        @inject(TYPES.LoggerService) private loggerService: any
    ) {
        this.logger = this.loggerService; // 直接使用loggerService
        this.STORAGE_PATH = path.join(process.cwd(), 'data', 'yield-trackers.json');
    }

    /**
     * 初始化管理器，加载历史数据
     */
    async initialize(): Promise<void> {
        try {
            await this.loadAllTrackers();
            await this.logger.logSystem('INFO', '✅ 累积收益追踪管理器初始化完成');
        } catch (error) {
            await this.logger.logSystem('ERROR', '❌ 累积收益追踪管理器初始化失败: ' + (error instanceof Error ? error.message : '未知错误'));
            throw error;
        }
    }

    /**
     * 记录收益提取事件
     */
    async recordYieldExtraction(
        poolAddress: string,
        positionAddresses: string[],
        extractedXAmount: string,
        extractedYAmount: string,
        calculatedYValue: string,
        transactionSignature: string,
        gasUsed: number = 0
    ): Promise<void> {
        try {
            const trackerId = this.generateTrackerId(poolAddress, positionAddresses);

            // 获取或创建追踪器
            let tracker = this.yieldTrackers.get(trackerId);
            if (!tracker) {
                tracker = this.createNewTracker(poolAddress, positionAddresses);
            }

            // 创建提取记录
            const extractionRecord: YieldExtractionRecord = {
                timestamp: Date.now(),
                extractedXAmount,
                extractedYAmount,
                calculatedYValue,
                transactionSignature,
                gasUsed
            };

            // 累加到总提取金额
            tracker.totalExtractedYield = this.addYieldAmounts(
                tracker.totalExtractedYield,
                calculatedYValue
            );

            // 添加到历史记录
            tracker.extractionHistory.push(extractionRecord);
            tracker.lastUpdated = Date.now();

            // 更新内存和持久化
            this.yieldTrackers.set(trackerId, tracker);
            await this.saveTracker(tracker);

            await this.logger.logSystem('INFO', `✅ 记录收益提取: ${calculatedYValue}Y, 累积: ${tracker.totalExtractedYield}Y`);

        } catch (error) {
            await this.logger.logSystem('ERROR', '❌ 记录收益提取失败: ' + (error instanceof Error ? error.message : '未知错误'));
            throw error;
        }
    }

    /**
     * 计算真实总收益
     */
    calculateRealTotalYield(
        poolAddress: string,
        positionAddresses: string[],
        currentPendingYield: string
    ): RealYieldCalculation {
        const trackerId = this.generateTrackerId(poolAddress, positionAddresses);
        const tracker = this.yieldTrackers.get(trackerId);

        const totalExtractedYield = tracker?.totalExtractedYield || '0';
        const realTotalYield = this.addYieldAmounts(currentPendingYield, totalExtractedYield);

        return {
            currentPendingYield,
            totalExtractedYield,
            realTotalYield,
            extractionCount: tracker?.extractionHistory.length || 0
        };
    }

    /**
     * 获取提取历史
     */
    getExtractionHistory(poolAddress: string, positionAddresses: string[]): YieldExtractionRecord[] {
        const trackerId = this.generateTrackerId(poolAddress, positionAddresses);
        const tracker = this.yieldTrackers.get(trackerId);
        return tracker?.extractionHistory || [];
    }

    /**
     * 更新头寸地址列表（用于头寸重新创建后的同步）
     */
    async updatePositionAddresses(newPositionAddresses: string[]): Promise<void> {
        try {
            await this.logger.logSystem('INFO', `🔄 更新累积收益管理器的头寸列表 - 新头寸数量: ${newPositionAddresses.length}`);

            // 这里可以根据需要实现具体的更新逻辑
            // 目前主要是为了接口兼容性，实际的头寸地址更新会在recordYieldExtraction时自动处理

            await this.logger.logSystem('DEBUG', '✅ 累积收益管理器头寸列表更新完成');
        } catch (error) {
            await this.logger.logSystem('ERROR', '❌ 更新累积收益管理器头寸列表失败: ' + (error instanceof Error ? error.message : '未知错误'));
            throw error;
        }
    }

    // ==================== 私有方法 ====================

    private generateTrackerId(poolAddress: string, positionAddresses: string[]): string {
        const sortedPositions = [...positionAddresses].sort();
        return `${poolAddress}_${sortedPositions.join('_')}`;
    }

    private createNewTracker(poolAddress: string, positionAddresses: string[]): AccumulatedYieldTracker {
        return {
            poolAddress,
            positionAddresses: [...positionAddresses],
            totalExtractedYield: '0',
            extractionHistory: [],
            lastUpdated: Date.now()
        };
    }

    private addYieldAmounts(amount1: string, amount2: string): string {
        const num1 = parseFloat(amount1) || 0;
        const num2 = parseFloat(amount2) || 0;
        return (num1 + num2).toString();
    }

    private async loadAllTrackers(): Promise<void> {
        try {
            // 确保目录存在
            await fs.mkdir(path.dirname(this.STORAGE_PATH), { recursive: true });

            const data = await fs.readFile(this.STORAGE_PATH, 'utf-8');
            const trackersData: Record<string, AccumulatedYieldTracker> = JSON.parse(data);

            // 加载到内存
            this.yieldTrackers.clear();
            for (const [trackerId, tracker] of Object.entries(trackersData)) {
                this.yieldTrackers.set(trackerId, tracker);
            }

            await this.logger.logSystem('INFO', `📋 加载 ${this.yieldTrackers.size} 个收益追踪器`);

        } catch (error) {
            if ((error as any).code === 'ENOENT') {
                // 文件不存在，创建空的追踪器
                await this.logger.logSystem('INFO', '📋 收益追踪文件不存在，创建新的追踪器');
                await this.saveAllTrackers();
            } else {
                throw error;
            }
        }
    }

    private async saveTracker(tracker: AccumulatedYieldTracker): Promise<void> {
        await this.saveAllTrackers();
    }

    private async saveAllTrackers(): Promise<void> {
        try {
            const trackersData: Record<string, AccumulatedYieldTracker> = {};

            for (const [trackerId, tracker] of this.yieldTrackers.entries()) {
                trackersData[trackerId] = tracker;
            }

            await fs.writeFile(this.STORAGE_PATH, JSON.stringify(trackersData, null, 2));

        } catch (error) {
            await this.logger.logSystem('ERROR', '❌ 保存收益追踪器失败: ' + (error instanceof Error ? error.message : '未知错误'));
            throw error;
        }
    }
} 