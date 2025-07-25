/**
 * 🔐 钱包管理API路由
 * 提供钱包创建、导入、余额查询等功能
 */

import { Router } from 'express';
import { z } from 'zod';

// 验证schemas
const createWalletSchema = z.object({
    password: z.string().min(8, '密码至少8个字符'),
    mnemonic: z.string().optional()
});

const importWalletSchema = z.object({
    mnemonic: z.string().min(1, '助记词不能为空'),
    password: z.string().min(8, '密码至少8个字符')
});

const unlockWalletSchema = z.object({
    password: z.string().min(1, '密码不能为空')
});

const importByKeySchema = z.object({
    privateKey: z.string().min(1, '私钥不能为空'),
    password: z.string().min(8, '密码至少8个字符')
});

export function createWalletRoutes(services: any) {
    const router = Router();

    // 获取钱包信息
    router.get('/info', async (req, res) => {
        try {
            const walletInfo = await services.wallet.getWalletInfo();
            res.json({
                success: true,
                data: walletInfo
            });
        } catch (error: any) {
            res.status(500).json({
                success: false,
                error: error.message,
                code: 'WALLET_INFO_ERROR'
            });
        }
    });

    // 创建新钱包
    router.post('/create', async (req, res) => {
        try {
            const validatedData = createWalletSchema.parse(req.body);

            const result = await services.wallet.createWallet(
                validatedData.password,
                validatedData.mnemonic
            );

            res.json({
                success: true,
                data: {
                    address: result.address,
                    // 不返回私钥和助记词到前端
                    created: true
                }
            });
        } catch (error: any) {
            if (error.name === 'ZodError') {
                res.status(400).json({
                    success: false,
                    error: '输入验证失败',
                    details: error.errors,
                    code: 'VALIDATION_ERROR'
                });
            } else {
                res.status(500).json({
                    success: false,
                    error: error.message,
                    code: 'WALLET_CREATE_ERROR'
                });
            }
        }
    });

    // 导入钱包
    router.post('/import', async (req, res) => {
        try {
            const validatedData = importWalletSchema.parse(req.body);

            const result = await services.wallet.importFromMnemonic(
                validatedData.mnemonic,
                validatedData.password
            );

            res.json({
                success: true,
                data: {
                    address: result.address,
                    imported: true
                }
            });
        } catch (error: any) {
            if (error.name === 'ZodError') {
                res.status(400).json({
                    success: false,
                    error: '输入验证失败',
                    details: error.errors,
                    code: 'VALIDATION_ERROR'
                });
            } else {
                res.status(500).json({
                    success: false,
                    error: error.message,
                    code: 'WALLET_IMPORT_ERROR'
                });
            }
        }
    });

    // 通过私钥导入钱包
    router.post('/import-by-key', async (req, res) => {
        try {
            const validatedData = importByKeySchema.parse(req.body);

            const result = await services.wallet.importFromPrivateKey(
                validatedData.privateKey,
                validatedData.password
            );

            res.json({
                success: true,
                data: {
                    address: result.address,
                    imported: true
                }
            });
        } catch (error: any) {
            if (error.name === 'ZodError') {
                res.status(400).json({
                    success: false,
                    error: '输入验证失败',
                    details: error.errors,
                    code: 'VALIDATION_ERROR'
                });
            } else {
                res.status(500).json({
                    success: false,
                    error: error.message,
                    code: 'WALLET_IMPORT_BY_KEY_ERROR'
                });
            }
        }
    });

    // 获取余额
    router.get('/balance/:tokenMint?', async (req, res) => {
        try {
            const { tokenMint } = req.params;

            const balance = tokenMint
                ? await services.wallet.getTokenBalance(tokenMint)
                : await services.wallet.getSolBalance();

            res.json({
                success: true,
                data: {
                    balance,
                    tokenMint: tokenMint || 'SOL',
                    timestamp: Date.now()
                }
            });
        } catch (error: any) {
            res.status(500).json({
                success: false,
                error: error.message,
                code: 'BALANCE_ERROR'
            });
        }
    });

    // 获取所有代币余额
    router.get('/balances', async (req, res) => {
        try {
            const balances = await services.wallet.getAllTokenBalances();

            res.json({
                success: true,
                data: balances
            });
        } catch (error: any) {
            res.status(500).json({
                success: false,
                error: error.message,
                code: 'BALANCES_ERROR'
            });
        }
    });

    // 解锁钱包
    router.post('/unlock', async (req, res) => {
        try {
            const { password } = req.body;
            if (!password) {
                return res.status(400).json({
                    success: false,
                    error: '必须提供密码',
                    code: 'PASSWORD_REQUIRED'
                });
            }

            const success = await services.wallet.unlock(password);

            if (success) {
                const info = await services.wallet.getWalletInfo();
                return res.json({
                    success: true,
                    message: '钱包解锁成功',
                    data: info
                });
            } else {
                return res.status(401).json({
                    success: false,
                    error: '密码错误，解锁失败',
                    code: 'UNLOCK_FAILED'
                });
            }
        } catch (error: any) {
            return res.status(500).json({
                success: false,
                error: error.message,
                code: 'WALLET_UNLOCK_ERROR'
            });
        }
    });

    // 锁定钱包
    router.post('/lock', async (req, res) => {
        try {
            services.wallet.lockWallet();

            res.json({
                success: true,
                data: {
                    locked: true,
                    message: '钱包已锁定'
                }
            });
        } catch (error: any) {
            res.status(500).json({
                success: false,
                error: error.message,
                code: 'WALLET_LOCK_ERROR'
            });
        }
    });

    // 删除钱包
    router.delete('/delete', async (req, res) => {
        try {
            const { password } = req.body;

            if (!password) {
                return res.status(400).json({
                    success: false,
                    error: '必须提供密码才能删除钱包',
                    code: 'PASSWORD_REQUIRED'
                });
            }

            // 尝试用密码解锁，如果失败则说明密码错误，无法授权删除
            const isUnlocked = await services.wallet.unlock(password);
            if (!isUnlocked) {
                return res.status(401).json({
                    success: false,
                    error: '密码错误，无权删除钱包',
                    code: 'UNAUTHORIZED_DELETION'
                });
            }

            // 密码正确，执行删除
            await services.wallet.deleteWallet();

            return res.json({
                success: true,
                data: {
                    deleted: true,
                    message: '钱包已成功删除'
                }
            });
        } catch (error: any) {
            return res.status(500).json({
                success: false,
                error: error.message,
                code: 'WALLET_DELETE_ERROR'
            });
        }
    });

    // 检查钱包状态
    router.get('/status', async (req, res) => {
        try {
            const exists = services.wallet.isWalletExists();
            const unlocked = services.wallet.isWalletUnlocked();

            res.json({
                success: true,
                data: {
                    exists,
                    unlocked,
                    status: !exists ? 'not_created' : (unlocked ? 'unlocked' : 'locked')
                }
            });
        } catch (error: any) {
            res.status(500).json({
                success: false,
                error: error.message,
                code: 'WALLET_STATUS_ERROR'
            });
        }
    });

    // 获取交易历史 (TODO: 需要实现)
    router.get('/transactions', async (req, res) => {
        try {
            // TODO: 实现交易历史功能
            res.json({
                success: true,
                data: [],
                message: '交易历史功能待实现'
            });
        } catch (error: any) {
            res.status(500).json({
                success: false,
                error: error.message,
                code: 'TRANSACTIONS_ERROR'
            });
        }
    });

    return router;
} 