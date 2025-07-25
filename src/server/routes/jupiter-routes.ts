/**
 * 🪐 Jupiter交换API路由
 * 提供代币交换、价格查询、报价获取等功能
 */

import { Router } from 'express';
import { z } from 'zod';

// 验证schemas
const getQuoteSchema = z.object({
    inputMint: z.string().min(32, '输入代币地址无效'),
    outputMint: z.string().min(32, '输出代币地址无效'),
    amount: z.string().regex(/^\d+$/, '金额必须为数字'),
    slippageBps: z.number().min(0).max(1000).optional()
});

const executeSwapSchema = z.object({
    inputMint: z.string().min(32, '输入代币地址无效'),
    outputMint: z.string().min(32, '输出代币地址无效'),
    amount: z.string().regex(/^\d+$/, '金额必须为数字'),
    slippageBps: z.number().min(0).max(1000).optional()
});

const getTokenPricesSchema = z.object({
    mints: z.array(z.string().min(32, '代币地址无效')).min(1).max(100)
});

export function createJupiterRoutes(services: any) {
    const router = Router();

    // 获取交换报价
    router.get('/quote', async (req, res) => {
        try {
            const validatedData = getQuoteSchema.parse({
                inputMint: req.query.inputMint as string,
                outputMint: req.query.outputMint as string,
                amount: req.query.amount as string,
                slippageBps: req.query.slippageBps ? parseInt(req.query.slippageBps as string) : undefined
            });

            const quote = await services.jupiter.getQuote(
                validatedData.inputMint,
                validatedData.outputMint,
                validatedData.amount,
                validatedData.slippageBps
            );

            res.json({
                success: true,
                data: quote,
                timestamp: Date.now()
            });
        } catch (error: any) {
            if (error.name === 'ZodError') {
                res.status(400).json({
                    success: false,
                    error: '参数验证失败',
                    details: error.errors,
                    code: 'VALIDATION_ERROR'
                });
            } else {
                res.status(500).json({
                    success: false,
                    error: error.message,
                    code: 'QUOTE_ERROR'
                });
            }
        }
    });

    // 执行代币交换
    router.post('/swap', async (req, res) => {
        try {
            console.log('接收到交换请求:', req.body);

            const validatedData = executeSwapSchema.parse(req.body);
            console.log('参数验证通过:', validatedData);

            // 检查钱包是否解锁 (使用正确的钱包服务方法)
            const isWalletUnlocked = services.wallet.isWalletUnlocked();
            console.log('钱包解锁状态:', isWalletUnlocked);

            if (!isWalletUnlocked) {
                res.status(400).json({
                    success: false,
                    error: '钱包未解锁，请先解锁钱包',
                    code: 'WALLET_LOCKED'
                });
                return;
            }

            // 获取钱包信息
            const walletInfo = await services.wallet.getWalletInfo();
            console.log('钱包信息:', { address: walletInfo.address?.substring(0, 8) + '...' });

            const swapParams = {
                inputMint: validatedData.inputMint,
                outputMint: validatedData.outputMint,
                amount: validatedData.amount,
                slippageBps: validatedData.slippageBps || 800,
                userPublicKey: walletInfo.address
            };

            console.log('执行交换参数:', swapParams);
            const result = await services.jupiter.executeSwap(swapParams);
            console.log('交换成功:', result);

            res.json({
                success: true,
                data: result,
                timestamp: Date.now()
            });
        } catch (error: any) {
            console.error('交换失败:', error);

            if (error.name === 'ZodError') {
                res.status(400).json({
                    success: false,
                    error: '参数验证失败',
                    details: error.errors,
                    code: 'VALIDATION_ERROR'
                });
            } else {
                res.status(500).json({
                    success: false,
                    error: error.message,
                    code: 'SWAP_ERROR'
                });
            }
        }
    });

    // 获取支持的代币列表
    router.get('/tokens', async (req, res) => {
        try {
            const tokens = await services.jupiter.getSupportedTokens();

            res.json({
                success: true,
                data: tokens,
                count: tokens.length,
                timestamp: Date.now()
            });
        } catch (error: any) {
            res.status(500).json({
                success: false,
                error: error.message,
                code: 'TOKENS_ERROR'
            });
        }
    });

    // 获取代币价格
    router.post('/prices', async (req, res) => {
        try {
            const validatedData = getTokenPricesSchema.parse(req.body);

            const prices = await services.jupiter.getTokenPrices(validatedData.mints);

            res.json({
                success: true,
                data: prices,
                requestedTokens: validatedData.mints.length,
                timestamp: Date.now()
            });
        } catch (error: any) {
            if (error.name === 'ZodError') {
                res.status(400).json({
                    success: false,
                    error: '参数验证失败',
                    details: error.errors,
                    code: 'VALIDATION_ERROR'
                });
            } else {
                res.status(500).json({
                    success: false,
                    error: error.message,
                    code: 'PRICES_ERROR'
                });
            }
        }
    });

    // 批量获取路由报价
    router.post('/batch-quotes', async (req, res) => {
        try {
            const requests = req.body.requests;

            if (!Array.isArray(requests) || requests.length === 0) {
                res.status(400).json({
                    success: false,
                    error: '请求列表不能为空',
                    code: 'VALIDATION_ERROR'
                });
                return;
            }

            if (requests.length > 10) {
                res.status(400).json({
                    success: false,
                    error: '批量请求不能超过10个',
                    code: 'VALIDATION_ERROR'
                });
                return;
            }

            // 验证每个请求
            const validatedRequests = requests.map(req => {
                return getQuoteSchema.parse(req);
            });

            const quotes = await services.jupiter.getBatchRoutes(validatedRequests);

            res.json({
                success: true,
                data: quotes,
                requestCount: requests.length,
                successCount: quotes.length,
                timestamp: Date.now()
            });
        } catch (error: any) {
            if (error.name === 'ZodError') {
                res.status(400).json({
                    success: false,
                    error: '参数验证失败',
                    details: error.errors,
                    code: 'VALIDATION_ERROR'
                });
            } else {
                res.status(500).json({
                    success: false,
                    error: error.message,
                    code: 'BATCH_QUOTES_ERROR'
                });
            }
        }
    });

    // Jupiter服务健康检查
    router.get('/health', async (req, res) => {
        try {
            const health = await services.jupiter.healthCheck();

            res.json({
                success: true,
                data: health,
                timestamp: Date.now()
            });
        } catch (error: any) {
            res.status(500).json({
                success: false,
                error: error.message,
                code: 'HEALTH_ERROR'
            });
        }
    });

    // 获取Jupiter服务指标
    router.get('/metrics', async (req, res) => {
        try {
            const metrics = services.jupiter.getMetrics();

            res.json({
                success: true,
                data: metrics,
                timestamp: Date.now()
            });
        } catch (error: any) {
            res.status(500).json({
                success: false,
                error: error.message,
                code: 'METRICS_ERROR'
            });
        }
    });

    return router;
} 