/**
 * 统一的代币精度转换工具类
 * 负责处理所有代币精度相关的转换操作
 * 
 * @author DLMM Liquidity Manager
 * @version 1.0.0
 */

import { Connection, PublicKey } from '@solana/web3.js';

export interface TokenAmount {
    /** 原始单位数量 (链上存储格式) */
    raw: string;
    /** 人类可读数量 (小数格式) */
    formatted: string;
    /** 代币精度 */
    decimals: number;
}

export interface TokenPair {
    tokenX: TokenAmount;
    tokenY: TokenAmount;
}

/**
 * 代币精度转换器
 * 提供原始单位与人类可读格式之间的双向转换
 */
export class TokenPrecisionConverter {
    private connection: Connection;
    private precisionCache: Map<string, number> = new Map();

    // 常用代币精度配置
    private static readonly DEFAULT_DECIMALS = {
        SOL: 9,
        USDC: 6,
        USDT: 6,
        DEFAULT: 6
    };

    constructor(connection: Connection) {
        this.connection = connection;
    }

    /**
     * 从链上获取代币精度信息
     * @param tokenMint 代币mint地址
     * @returns 代币精度，获取失败返回null
     */
    private async fetchDecimalsFromChain(tokenMint: PublicKey): Promise<number | null> {
        try {
            const mintInfo = await this.connection.getParsedAccountInfo(tokenMint);
            if (mintInfo.value?.data && 'parsed' in mintInfo.value.data) {
                const parsedData = mintInfo.value.data.parsed;
                if (parsedData?.info?.decimals !== undefined) {
                    return parsedData.info.decimals;
                }
            }
        } catch (error) {
            console.error(`获取代币${tokenMint.toString()}精度失败:`, error);
        }
        return null;
    }

    /**
     * 获取代币精度（优先从链上获取，带缓存）
     * @param tokenMint 代币mint地址
     * @returns 代币精度
     */
    async getTokenDecimals(tokenMint: PublicKey): Promise<number> {
        const mintKey = tokenMint.toString();

        // 检查缓存
        if (this.precisionCache.has(mintKey)) {
            return this.precisionCache.get(mintKey)!;
        }

        // 从链上获取
        const decimals = await this.fetchDecimalsFromChain(tokenMint);
        if (decimals !== null) {
            this.precisionCache.set(mintKey, decimals);
            // 静默获取代币精度（避免重复打印）
            return decimals;
        }

        // 最后的默认值
        console.warn(`⚠️ 无法获取代币${mintKey}的精度，使用默认值9`);
        const defaultDecimals = 9;
        this.precisionCache.set(mintKey, defaultDecimals);
        return defaultDecimals;
    }

    /**
     * 批量获取代币精度
     * @param tokenMints 代币mint地址数组
     * @returns 精度数组
     */
    async batchGetTokenDecimals(tokenMints: PublicKey[]): Promise<number[]> {
        const promises = tokenMints.map(mint => this.getTokenDecimals(mint));
        return Promise.all(promises);
    }

    /**
     * 将原始单位转换为人类可读格式
     * @param rawAmount 原始单位数量
     * @param decimals 代币精度
     * @returns 人类可读的数量字符串
     */
    static rawToFormatted(rawAmount: string | number, decimals: number = 6): string {
        try {
            if (!rawAmount || rawAmount === '0') return '0';

            const amount = parseFloat(rawAmount.toString());
            const divisor = Math.pow(10, decimals);
            const formatted = amount / divisor;

            // 根据数值大小选择合适的精度
            if (formatted >= 1) {
                return formatted.toFixed(6);
            } else if (formatted >= 0.001) {
                return formatted.toFixed(8);
            } else if (formatted > 0) {
                return formatted.toExponential(3);
            } else {
                return '0';
            }
        } catch (error) {
            console.error('代币精度转换失败', { rawAmount, decimals, error });
            return '0';
        }
    }

    /**
     * 将人类可读格式转换为原始单位
     * @param formattedAmount 人类可读数量
     * @param decimals 代币精度
     * @returns 原始单位数量字符串
     */
    static formattedToRaw(formattedAmount: string | number, decimals: number = 6): string {
        try {
            if (!formattedAmount || formattedAmount === '0') return '0';

            const amount = parseFloat(formattedAmount.toString());
            const multiplier = Math.pow(10, decimals);
            const raw = Math.floor(amount * multiplier);

            return raw.toString();
        } catch (error) {
            console.error('格式化数量转换失败', { formattedAmount, decimals, error });
            return '0';
        }
    }

    /**
     * 创建TokenAmount对象
     * @param rawAmount 原始单位数量
     * @param decimals 代币精度
     * @returns TokenAmount对象
     */
    static createTokenAmount(rawAmount: string | number, decimals: number = 6): TokenAmount {
        const raw = rawAmount.toString();
        const formatted = this.rawToFormatted(raw, decimals);

        return {
            raw,
            formatted,
            decimals
        };
    }

    /**
     * 转换头寸数据为标准格式
     * @param positionData 原始头寸数据
     * @param tokenXDecimals X代币精度
     * @param tokenYDecimals Y代币精度
     * @returns 转换后的头寸数据
     */
    static convertPositionData(
        positionData: { totalXAmount: string; totalYAmount: string },
        tokenXDecimals: number = 6,
        tokenYDecimals: number = 6
    ): TokenPair {
        return {
            tokenX: this.createTokenAmount(positionData.totalXAmount, tokenXDecimals),
            tokenY: this.createTokenAmount(positionData.totalYAmount, tokenYDecimals)
        };
    }

    /**
     * 使用链上真实精度转换头寸数据
     * @param positionData 原始头寸数据
     * @param tokenXMint X代币mint地址
     * @param tokenYMint Y代币mint地址
     * @returns 转换后的头寸数据
     */
    async convertPositionDataWithChainDecimals(
        positionData: { totalXAmount: string; totalYAmount: string },
        tokenXMint: PublicKey,
        tokenYMint: PublicKey
    ): Promise<TokenPair> {
        const [tokenXDecimals, tokenYDecimals] = await this.batchGetTokenDecimals([tokenXMint, tokenYMint]);

        console.log(`🔍 使用链上精度转换头寸数据:`);
        console.log(`   X代币精度: ${tokenXDecimals}, Y代币精度: ${tokenYDecimals}`);

        return {
            tokenX: TokenPrecisionConverter.createTokenAmount(positionData.totalXAmount, tokenXDecimals),
            tokenY: TokenPrecisionConverter.createTokenAmount(positionData.totalYAmount, tokenYDecimals)
        };
    }



    /**
     * 批量转换代币数量
     * @param amounts 原始数量数组
     * @param decimals 代币精度
     * @returns 转换后的TokenAmount数组
     */
    static batchConvert(amounts: (string | number)[], decimals: number = 6): TokenAmount[] {
        return amounts.map(amount => this.createTokenAmount(amount, decimals));
    }

    /**
     * 获取默认代币精度
     * @param tokenSymbol 代币符号
     * @returns 代币精度
     */
    static getDefaultDecimals(tokenSymbol?: string): number {
        if (!tokenSymbol) return this.DEFAULT_DECIMALS.DEFAULT;

        const symbol = tokenSymbol.toUpperCase();
        return this.DEFAULT_DECIMALS[symbol as keyof typeof this.DEFAULT_DECIMALS] || this.DEFAULT_DECIMALS.DEFAULT;
    }

    /**
     * 格式化显示数量 (用于UI显示)
     * @param tokenAmount TokenAmount对象
     * @param maxDecimals 最大小数位数
     * @returns 格式化的显示字符串
     */
    static formatForDisplay(tokenAmount: TokenAmount, maxDecimals: number = 8): string {
        const amount = parseFloat(tokenAmount.formatted);

        if (amount === 0) return '0';
        if (amount >= 1) return amount.toFixed(Math.min(6, maxDecimals));
        if (amount >= 0.001) return amount.toFixed(Math.min(8, maxDecimals));
        return amount.toExponential(3);
    }

    /**
     * 验证代币数量格式
     * @param amount 代币数量
     * @returns 是否有效
     */
    static isValidAmount(amount: string | number): boolean {
        try {
            const num = parseFloat(amount.toString());
            return !isNaN(num) && num >= 0 && isFinite(num);
        } catch {
            return false;
        }
    }
} 