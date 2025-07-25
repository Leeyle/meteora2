/**
 * 🪐 Jupiter交换核心功能
 * 提供代币交换的核心逻辑和API调用
 */

class JupiterCore {
    constructor() {
        this.baseUrl = '/api/jupiter';
        this.isLoading = false;
        this.lastQuote = null;
        this.supportedTokens = [];
        // 代币精度缓存
        this.decimalsCache = new Map();
        // 常用代币精度配置
        this.defaultDecimals = {
            'So11111111111111111111111111111111111111112': 9, // SOL
            'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v': 6, // USDC
            'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB': 6, // USDT
            '4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R': 6, // RAY
            'J8XNoBVdiLjuUd3wk9p7yj1cSqcwX9hpiBoU6Hpnmoon': 6, // 测试代币
            'SRMuApVNdxXokk5GT7XD5cUUgXMBCoAz2LHeuAoKWRt': 6, // SRM
            '8HGyAAB1yoM1ttS7pXjHMa3dukTFGQggnFFH3hJZgzQh': 0, // COPE
            'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263': 5, // BONK
            'mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So': 9, // mSOL
            'J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn': 9, // jitoSOL
        };
    }

    /**
     * 获取代币精度信息
     * @param {string} tokenMint 代币mint地址
     * @returns {Promise<number>} 代币精度
     */
    async getTokenDecimals(tokenMint) {
        try {
            // 检查缓存
            if (this.decimalsCache.has(tokenMint)) {
                console.log(`📋 使用缓存的代币精度: ${tokenMint.substring(0, 8)}... = ${this.decimalsCache.get(tokenMint)}`);
                return this.decimalsCache.get(tokenMint);
            }

            // 检查默认配置
            if (this.defaultDecimals[tokenMint]) {
                const decimals = this.defaultDecimals[tokenMint];
                this.decimalsCache.set(tokenMint, decimals);
                console.log(`📋 使用默认代币精度: ${tokenMint.substring(0, 8)}... = ${decimals}`);
                return decimals;
            }

            // 🔧 修复：跳过慢速的tokens端点，直接使用默认值
            // 避免调用getSupportedTokens()以防止卡住
            console.log(`⚡ 跳过代币列表查询，为${tokenMint.substring(0, 8)}...使用默认精度`);

            // 最后的默认值
            console.warn(`⚠️ 无法获取代币${tokenMint.substring(0, 8)}...的精度，使用默认值9`);
            const defaultDecimals = 9;
            this.decimalsCache.set(tokenMint, defaultDecimals);
            return defaultDecimals;

        } catch (error) {
            console.error('获取代币精度失败:', error);
            const defaultDecimals = 9;
            this.decimalsCache.set(tokenMint, defaultDecimals);
            return defaultDecimals;
        }
    }

    /**
     * 批量获取代币精度
     * @param {string[]} tokenMints 代币mint地址数组
     * @returns {Promise<number[]>} 精度数组
     */
    async batchGetTokenDecimals(tokenMints) {
        const promises = tokenMints.map(mint => this.getTokenDecimals(mint));
        return Promise.all(promises);
    }

    /**
     * 将人类可读数量转换为原子单位
     * @param {string|number} amount 人类可读数量
     * @param {number} decimals 代币精度
     * @returns {string} 原子单位数量
     */
    formatToAtomicUnits(amount, decimals) {
        try {
            if (!amount || amount === '0') return '0';

            const amountFloat = parseFloat(amount.toString());
            const multiplier = Math.pow(10, decimals);
            const atomicAmount = Math.floor(amountFloat * multiplier);

            console.log(`🔢 精度转换: ${amount} × 10^${decimals} = ${atomicAmount}`);
            return atomicAmount.toString();
        } catch (error) {
            console.error('转换原子单位失败:', { amount, decimals, error });
            return '0';
        }
    }

    /**
     * 将原子单位转换为人类可读数量
     * @param {string|number} atomicAmount 原子单位数量
     * @param {number} decimals 代币精度
     * @returns {string} 人类可读数量
     */
    formatFromAtomicUnits(atomicAmount, decimals) {
        try {
            if (!atomicAmount || atomicAmount === '0') return '0';

            const amount = parseFloat(atomicAmount.toString());
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
            console.error('转换人类可读数量失败:', { atomicAmount, decimals, error });
            return '0';
        }
    }

    /**
     * 获取交换报价
     * @param {string} inputMint 输入代币地址
     * @param {string} outputMint 输出代币地址
     * @param {string} amount 输入金额
     * @param {number} slippageBps 滑点(基点)
     */
    async getQuote(inputMint, outputMint, amount, slippageBps = 800) {
        try {
            console.log('获取Jupiter报价:', { inputMint, outputMint, amount, slippageBps });

            const params = new URLSearchParams({
                inputMint,
                outputMint,
                amount,
                slippageBps: slippageBps.toString()
            });

            const response = await fetch(`${this.baseUrl}/quote?${params}`);
            const data = await response.json();

            if (!data.success) {
                throw new Error(data.error || '获取报价失败');
            }

            this.lastQuote = data.data;
            console.log('获取报价成功:', data.data);
            return data.data;
        } catch (error) {
            console.error('获取报价失败:', error);
            throw new Error(`获取报价失败: ${error.message}`);
        }
    }

    /**
     * 执行代币交换
     * @param {string} inputMint 输入代币地址
     * @param {string} outputMint 输出代币地址
     * @param {string} amount 输入金额
     * @param {number} slippageBps 滑点(基点)
     */
    async executeSwap(inputMint, outputMint, amount, slippageBps = 800) {
        try {
            this.isLoading = true;
            console.log('执行Jupiter交换:', { inputMint, outputMint, amount, slippageBps });

            const response = await fetch(`${this.baseUrl}/swap`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    inputMint,
                    outputMint,
                    amount,
                    slippageBps
                })
            });

            const data = await response.json();

            if (!data.success) {
                throw new Error(data.error || '交换失败');
            }

            console.log('交换成功:', data.data);
            return data.data;
        } catch (error) {
            console.error('交换失败:', error);
            throw new Error(`交换失败: ${error.message}`);
        } finally {
            this.isLoading = false;
        }
    }

    /**
     * 获取支持的代币列表
     */
    async getSupportedTokens() {
        try {
            if (this.supportedTokens.length > 0) {
                return this.supportedTokens;
            }

            console.log('获取支持的代币列表...');

            const response = await fetch(`${this.baseUrl}/tokens`);
            const data = await response.json();

            if (!data.success) {
                throw new Error(data.error || '获取代币列表失败');
            }

            // 只保留主要代币，避免列表过长
            this.supportedTokens = data.data.slice(0, 100);
            console.log('获取代币列表成功:', this.supportedTokens.length, '个代币');
            return this.supportedTokens;
        } catch (error) {
            console.error('获取代币列表失败:', error);
            return [];
        }
    }

    /**
     * 获取代币价格
     * @param {string[]} mints 代币地址数组
     */
    async getTokenPrices(mints) {
        try {
            console.log('获取代币价格:', mints);

            const response = await fetch(`${this.baseUrl}/prices`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ mints })
            });

            const data = await response.json();

            if (!data.success) {
                throw new Error(data.error || '获取价格失败');
            }

            console.log('获取价格成功:', data.data);
            return data.data;
        } catch (error) {
            console.error('获取价格失败:', error);
            return {};
        }
    }

    /**
     * 检查Jupiter服务健康状态
     */
    async checkHealth() {
        try {
            const response = await fetch(`${this.baseUrl}/health`);
            const data = await response.json();

            if (!data.success) {
                throw new Error(data.error || '健康检查失败');
            }

            return data.data;
        } catch (error) {
            console.error('Jupiter服务健康检查失败:', error);
            return { status: 'error', message: error.message };
        }
    }

    /**
     * 获取Jupiter服务指标
     */
    async getMetrics() {
        try {
            const response = await fetch(`${this.baseUrl}/metrics`);
            const data = await response.json();

            if (!data.success) {
                throw new Error(data.error || '获取指标失败');
            }

            return data.data;
        } catch (error) {
            console.error('获取Jupiter指标失败:', error);
            return {};
        }
    }

    /**
     * 检查钱包是否解锁 (参考头寸管理的实现)
     */
    isWalletUnlocked() {
        // 检查本地存储的钱包状态（主要方法）
        try {
            const walletInfo = localStorage.getItem('walletInfo');
            console.log('[Jupiter] 检查localStorage中的walletInfo:', walletInfo);

            if (walletInfo) {
                const info = JSON.parse(walletInfo);
                console.log('[Jupiter] 解析的钱包信息:', info);
                console.log('[Jupiter] 状态检查 - isUnlocked:', info.isUnlocked, ', status:', info.status);

                const isUnlocked = info.isUnlocked === true || info.status === 'unlocked';
                console.log('[Jupiter] 最终判断结果:', isUnlocked);
                return isUnlocked;
            }

            console.log('[Jupiter] localStorage中没有walletInfo');
        } catch (error) {
            console.warn('[Jupiter] 从本地存储检查钱包状态失败:', error);
        }

        console.log('[Jupiter] 钱包状态检查返回false');
        return false;
    }

    /**
 * 异步检查钱包解锁状态（通过API）
 */
    async checkWalletUnlockedAsync() {
        try {
            console.log('[Jupiter] 通过API检查钱包状态...');
            const response = await fetch('/api/wallet/status');
            const data = await response.json();
            console.log('[Jupiter] API响应:', data);

            if (data.success && data.data) {
                console.log('[Jupiter] API钱包状态 - unlocked:', data.data.unlocked, ', status:', data.data.status);
                const isUnlocked = data.data.unlocked === true;
                console.log('[Jupiter] API最终判断结果:', isUnlocked);
                return isUnlocked;
            }

            console.log('[Jupiter] API检查失败或无数据');
        } catch (error) {
            console.warn('[Jupiter] 异步检查钱包状态失败:', error);
        }
        return false;
    }

    /**
     * 验证代币地址格式
     * @param {string} address 代币地址
     */
    validateTokenAddress(address) {
        if (!address || typeof address !== 'string') {
            return false;
        }

        // Solana地址通常是32-44个字符的base58编码
        return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address);
    }

    /**
     * 验证交换金额
     * @param {string} amount 金额
     */
    validateAmount(amount) {
        if (!amount || typeof amount !== 'string') {
            return false;
        }

        const num = parseFloat(amount);
        return !isNaN(num) && num > 0;
    }

    /**
     * 验证滑点值
     * @param {number} slippageBps 滑点(基点)
     */
    validateSlippage(slippageBps) {
        return typeof slippageBps === 'number' && slippageBps >= 0 && slippageBps <= 1000;
    }

    /**
     * 格式化代币数量 (已弃用，请使用formatFromAtomicUnits)
     * @param {string|number} amount 数量
     * @param {number} decimals 小数位数
     * @deprecated 使用formatFromAtomicUnits替代
     */
    formatTokenAmount(amount, decimals = 9) {
        console.warn('formatTokenAmount已弃用，请使用formatFromAtomicUnits');
        return this.formatFromAtomicUnits(amount, decimals);
    }

    /**
     * 计算价格影响百分比显示
     * @param {number} priceImpact 价格影响
     */
    formatPriceImpact(priceImpact) {
        if (typeof priceImpact !== 'number') return '0.00%';

        const percent = Math.abs(priceImpact * 100);
        return `${percent.toFixed(2)}%`;
    }

    /**
     * 获取价格影响颜色类
     * @param {number} priceImpact 价格影响
     */
    getPriceImpactClass(priceImpact) {
        if (typeof priceImpact !== 'number') return 'neutral';

        const percent = Math.abs(priceImpact * 100);
        if (percent < 0.1) return 'low';
        if (percent < 1) return 'medium';
        return 'high';
    }
}

// 暴露到全局作用域
window.JupiterCore = JupiterCore;
window.jupiterCore = new JupiterCore(); 