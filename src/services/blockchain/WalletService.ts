import { injectable, inject } from 'tsyringe';
import { Keypair, PublicKey } from '@solana/web3.js';
import * as crypto from 'crypto';
import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import * as path from 'path';
import { IWalletService, IConfigService, ILoggerService, IStateService, ISolanaWeb3Service, TYPES } from '../../types/interfaces';
import { WalletInfo, ModuleConfig, ModuleHealth, ModuleMetrics } from '../../types/interfaces';
import bs58 from 'bs58';

/**
 * 钱包服务 (已升级到新日志系统)
 * 负责钱包创建、加密存储、解密加载、删除管理
 * 
 * 🆕 使用新的三层分离架构日志系统:
 * - 🔧 系统日志: 服务启动停止、配置加载、文件操作
 * - 📝 业务操作日志: 钱包创建、加载、删除、加密解密操作
 * - 📊 业务监控日志: 钱包使用统计、安全指标、性能数据
 */
@injectable()
export class WalletService implements IWalletService {
    public readonly name = 'WalletService';
    public readonly version = '2.0.0';
    public readonly dependencies = ['ConfigService', 'LoggerService', 'StateService', 'SolanaWeb3Service'];

    private config: any;
    private walletPath!: string;
    private currentKeypair: Keypair | null = null;
    private isUnlocked: boolean = false;

    // 操作统计
    private operationCount: number = 0;
    private errorCount: number = 0;
    private lastOperationTime: number = 0;

    // 加密参数 (参考原项目)
    private readonly ALGORITHM = 'aes-256-gcm';
    private readonly KEY_DERIVATION_ITERATIONS = 100000;
    private readonly SALT_LENGTH = 32;
    private readonly IV_LENGTH = 16;
    private readonly TAG_LENGTH = 16;

    constructor(
        @inject(TYPES.ConfigService) private configService: IConfigService,
        @inject(TYPES.LoggerService) private loggerService: ILoggerService,
        @inject(TYPES.StateService) private stateService: IStateService,
        @inject(TYPES.SolanaWeb3Service) private solanaService: ISolanaWeb3Service
    ) { }

    async initialize(config: ModuleConfig): Promise<void> {
        const initStart = Date.now();

        try {
            this.config = this.configService.get('wallet', {});

            // 🔧 系统日志: 初始化开始
            await this.loggerService.logSystem('INFO', '开始初始化WalletService');

            // 设置钱包存储路径，确保路径相对于项目文件夹而不是当前工作目录
            // __dirname 指向 'dist/services/blockchain'
            // 我们需要回退三层到 'dlmm-liquidity-manager' 根目录
            const projectRoot = path.join(__dirname, '..', '..', '..');
            this.walletPath = path.join(projectRoot, 'data', 'wallet.enc');

            // 确保数据目录存在
            await fs.mkdir(path.dirname(this.walletPath), { recursive: true });

            const initDuration = Date.now() - initStart;

            // 🔧 系统日志: 初始化完成
            await this.loggerService.logSystem('INFO', `WalletService初始化完成 (路径: ${this.walletPath})`);

            // 📊 业务监控日志: 初始化性能
            await this.loggerService.logBusinessMonitoring('wallet-service-init', {
                walletPath: this.walletPath,
                initDuration
            });

        } catch (error) {
            this.errorCount++;
            await this.loggerService.logError('wallet-service-init', 'WalletService初始化失败', error as Error);
            throw error;
        }
    }

    async start(): Promise<void> {
        try {
            // 🔧 系统日志: 服务启动
            await this.loggerService.logSystem('INFO', 'WalletService启动完成');
        } catch (error) {
            this.errorCount++;
            await this.loggerService.logError('wallet-service-start', 'WalletService启动失败', error as Error);
            throw error;
        }
    }

    async stop(): Promise<void> {
        try {
            // 📝 业务操作日志: 服务停止
            await this.loggerService.logBusinessOperation('钱包服务停止', {
                wasUnlocked: this.isUnlocked,
                timestamp: Date.now()
            });

            this.lockWallet();

            // 🔧 系统日志: 服务停止
            await this.loggerService.logSystem('INFO', 'WalletService已停止');

        } catch (error) {
            this.errorCount++;
            await this.loggerService.logError('wallet-service-stop', 'WalletService停止失败', error as Error);
            throw error;
        }
    }

    async healthCheck(): Promise<ModuleHealth> {
        try {
            const exists = this.isWalletExists();
            return {
                status: 'healthy',
                message: exists ? '钱包文件存在' : '钱包文件不存在',
                timestamp: Date.now(),
                details: {
                    walletExists: exists,
                    isUnlocked: this.isUnlocked,
                    walletPath: this.walletPath,
                    operationCount: this.operationCount,
                    errorCount: this.errorCount
                }
            };
        } catch (error) {
            return {
                status: 'error',
                message: `钱包服务检查失败: ${error instanceof Error ? error.message : '未知错误'}`,
                timestamp: Date.now()
            };
        }
    }

    getMetrics(): ModuleMetrics {
        return {
            uptime: Date.now(),
            requestCount: this.operationCount,
            errorCount: this.errorCount,
            lastActivity: this.lastOperationTime,
            performance: {
                avgResponseTime: this.lastOperationTime > 0 ? this.lastOperationTime : 0,
                successRate: this.operationCount > 0 ?
                    ((this.operationCount - this.errorCount) / this.operationCount) * 100 : 100
            }
        };
    }

    /**
     * 创建新钱包 - 使用新日志系统
     * @param password 可选密码，如果提供则加密存储
     */
    async createWallet(password?: string): Promise<WalletInfo> {
        const operationStart = Date.now();
        this.operationCount++;

        try {
            // 📝 业务操作日志: 开始创建钱包
            await this.loggerService.logBusinessOperation('创建钱包-开始', {
                isEncrypted: !!password,
                timestamp: operationStart
            });

            // 生成新的密钥对
            const keypair = Keypair.generate();
            const address = keypair.publicKey.toString();

            // 📝 业务操作日志: 密钥对生成成功
            await this.loggerService.logBusinessOperation('wallet-keypair-generated', {
                address: address.substring(0, 8) + '...',
                timestamp: Date.now()
            });

            // 保存钱包
            await this.saveWallet(keypair, password);

            // 设置当前钱包
            this.currentKeypair = keypair;
            this.isUnlocked = true;

            const walletInfo: WalletInfo = {
                address,
                isEncrypted: !!password,
                createdAt: Date.now(),
                lastUsed: Date.now()
            };

            // 保存钱包信息到状态服务
            await this.stateService.save('wallet_info', walletInfo);

            const operationDuration = Date.now() - operationStart;
            this.lastOperationTime = Date.now();

            // 📝 业务操作日志: 钱包创建成功
            await this.loggerService.logBusinessOperation('创建钱包-成功', {
                address: address.substring(0, 8) + '...',
                isEncrypted: !!password,
                operationDuration
            });

            // 📊 业务监控日志: 钱包创建性能
            await this.loggerService.logBusinessMonitoring('wallet-create-performance', {
                operationDuration,
                isEncrypted: !!password,
                success: true
            });

            return walletInfo;
        } catch (error) {
            this.errorCount++;

            // 📊 业务监控日志: 创建失败
            await this.loggerService.logBusinessMonitoring('wallet-create-performance', {
                operationDuration: Date.now() - operationStart,
                success: false,
                error: error instanceof Error ? error.message : '未知错误'
            });

            await this.loggerService.logError('wallet-create', '钱包创建失败', error as Error);
            throw new Error(`钱包创建失败: ${error instanceof Error ? error.message : '未知错误'}`);
        }
    }

    /**
     * 加载钱包 - 使用新日志系统
     * @param password 密码 (如果钱包已加密)
     */
    async loadWallet(password?: string): Promise<Keypair> {
        const operationStart = Date.now();
        this.operationCount++;

        try {
            if (!this.isWalletExists()) {
                throw new Error('钱包文件不存在');
            }

            // 📝 业务操作日志: 开始加载钱包
            await this.loggerService.logBusinessOperation('加载钱包-开始', {
                hasPassword: !!password,
                timestamp: operationStart
            });

            const encryptedData = await fs.readFile(this.walletPath);
            let keypairData: Uint8Array;

            if (password) {
                // 解密钱包
                keypairData = await this.decryptWallet(encryptedData, password);

                // 📝 业务操作日志: 钱包解密成功
                await this.loggerService.logBusinessOperation('wallet-decrypt-success', {
                    timestamp: Date.now()
                });
            } else {
                // 检查是否为加密钱包
                if (this.isEncryptedWallet(encryptedData)) {
                    throw new Error('钱包已加密，需要提供密码');
                }
                keypairData = encryptedData;

                // 📝 业务操作日志: 明文钱包加载
                await this.loggerService.logBusinessOperation('wallet-load-plaintext', {
                    timestamp: Date.now()
                });
            }

            // 从字节数组恢复密钥对
            const keypair = Keypair.fromSecretKey(keypairData);

            this.currentKeypair = keypair;
            this.isUnlocked = true;

            // 更新最后使用时间
            await this.updateLastUsedTime();

            const operationDuration = Date.now() - operationStart;
            this.lastOperationTime = Date.now();

            // 📝 业务操作日志: 钱包加载成功
            await this.loggerService.logBusinessOperation('加载钱包-成功', {
                address: keypair.publicKey.toString().substring(0, 8) + '...',
                operationDuration,
                wasEncrypted: !!password
            });

            // 📊 业务监控日志: 加载性能
            await this.loggerService.logBusinessMonitoring('wallet-load-performance', {
                operationDuration,
                wasEncrypted: !!password,
                success: true
            });

            return keypair;
        } catch (error) {
            this.errorCount++;

            // 📊 业务监控日志: 加载失败
            await this.loggerService.logBusinessMonitoring('wallet-load-performance', {
                operationDuration: Date.now() - operationStart,
                success: false,
                error: error instanceof Error ? error.message : '未知错误'
            });

            await this.loggerService.logError('wallet-load', '钱包加载失败', error as Error);
            throw new Error(`钱包加载失败: ${error instanceof Error ? error.message : '未知错误'}`);
        }
    }

    /**
     * 保存钱包
     * @param keypair 密钥对
     * @param password 可选密码进行加密
     */
    async saveWallet(keypair: Keypair, password?: string): Promise<void> {
        try {
            const secretKey = keypair.secretKey;

            if (password) {
                // 加密保存
                const encryptedData = await this.encryptWallet(secretKey, password);
                await fs.writeFile(this.walletPath, encryptedData);

                // 📝 业务操作日志: 钱包加密保存
                await this.loggerService.logBusinessOperation('wallet-encrypted-save', {
                    timestamp: Date.now()
                });
            } else {
                // 明文保存
                await fs.writeFile(this.walletPath, secretKey);

                // 📝 业务操作日志: 钱包明文保存
                await this.loggerService.logBusinessOperation('wallet-plaintext-save', {
                    timestamp: Date.now()
                });
            }

            // 设置文件权限 (仅所有者可读写)
            await fs.chmod(this.walletPath, 0o600);

        } catch (error) {
            this.errorCount++;
            await this.loggerService.logError('wallet-save', '钱包保存失败', error as Error);
            throw new Error(`钱包保存失败: ${error instanceof Error ? error.message : '未知错误'}`);
        }
    }

    /**
     * 删除钱包
     */
    async deleteWallet(): Promise<void> {
        const operationStart = Date.now();
        this.operationCount++;

        try {
            if (!this.isWalletExists()) {
                // 🔧 系统日志: 钱包文件不存在
                await this.loggerService.logSystem('WARN', '钱包文件不存在，无需删除');
                return;
            }

            // 📝 业务操作日志: 开始删除钱包
            await this.loggerService.logBusinessOperation('wallet-delete-start', {
                timestamp: operationStart
            });

            await fs.unlink(this.walletPath);

            // 清理内存中的钱包数据
            this.lockWallet();

            // 删除钱包信息
            await this.stateService.delete('wallet_info');

            this.lastOperationTime = Date.now();

            // 📝 业务操作日志: 钱包删除成功
            await this.loggerService.logBusinessOperation('wallet-delete-success', {
                operationDuration: Date.now() - operationStart
            });

        } catch (error) {
            this.errorCount++;
            await this.loggerService.logError('wallet-delete', '钱包删除失败', error as Error);
            throw new Error(`钱包删除失败: ${error instanceof Error ? error.message : '未知错误'}`);
        }
    }

    /**
     * 检查钱包文件是否存在
     */
    isWalletExists(): boolean {
        try {
            fsSync.accessSync(this.walletPath, fsSync.constants.F_OK);
            // 🔧 系统日志: 钱包文件存在检查通过 
            this.loggerService.logSystem('DEBUG', `钱包文件存在检查通过: ${this.walletPath}`);
            return true;
        } catch (error) {
            // 🔧 系统日志: 钱包文件不存在
            this.loggerService.logSystem('DEBUG', `钱包文件不存在: ${this.walletPath}`);
            return false;
        }
    }

    /**
     * 获取钱包信息
     */
    async getWalletInfo(): Promise<WalletInfo | null> {
        try {
            // 如果钱包文件不存在，返回"未创建"状态而不是null
            if (!this.isWalletExists()) {
                // 📝 业务操作日志: 钱包文件不存在
                await this.loggerService.logBusinessOperation('wallet-not-found', {
                    message: '钱包文件不存在，返回未创建状态',
                    timestamp: Date.now()
                });
                return {
                    address: null,
                    isEncrypted: false,
                    createdAt: null,
                    lastUsed: null,
                    status: 'not_created',
                    message: '钱包尚未创建'
                } as WalletInfo;
            }

            // 从状态服务获取钱包信息
            const walletInfo = await this.stateService.load<WalletInfo>('wallet_info');

            if (walletInfo) {
                // 添加当前状态信息
                walletInfo.status = this.isWalletUnlocked() ? 'unlocked' : 'locked';
                walletInfo.currentAddress = this.currentKeypair?.publicKey.toString() || null;
                return walletInfo;
            }

            // 如果状态服务中没有信息，通过文件分析生成
            const encryptedData = await fs.readFile(this.walletPath);
            const stats = await fs.stat(this.walletPath);

            return {
                address: this.currentKeypair?.publicKey.toString() || '需要解锁查看',
                isEncrypted: this.isEncryptedWallet(encryptedData),
                createdAt: stats.birthtime.getTime(),
                lastUsed: stats.mtime.getTime(),
                status: this.isWalletUnlocked() ? 'unlocked' : 'locked',
                currentAddress: this.currentKeypair?.publicKey.toString() || null,
                message: this.isWalletUnlocked() ? '钱包已解锁' : '钱包已锁定'
            };
        } catch (error) {
            // 安全的日志记录
            this.errorCount++;
            await this.loggerService.logError('wallet-info', '获取钱包信息失败', error as Error);

            return {
                address: null,
                isEncrypted: false,
                createdAt: null,
                lastUsed: null,
                status: 'error',
                message: `钱包信息获取失败: ${error instanceof Error ? error.message : '未知错误'}`
            } as WalletInfo;
        }
    }

    /**
     * 锁定钱包
     */
    lockWallet(): void {
        if (this.currentKeypair) {
            // 清零内存中的私钥 (安全做法)
            this.currentKeypair.secretKey.fill(0);
            this.currentKeypair = null;
        }

        this.isUnlocked = false;

        // 📝 业务操作日志: 钱包锁定
        this.loggerService.logBusinessOperation('wallet-locked', {
            timestamp: Date.now()
        });
    }

    /**
     * 解锁钱包
     * @param password 密码
     */
    async unlockWallet(password: string): Promise<boolean> {
        try {
            await this.loadWallet(password);
            return true;
        } catch (error) {
            this.errorCount++;
            await this.loggerService.logError('wallet-unlock', '钱包解锁失败', error as Error);
            return false;
        }
    }

    /**
     * 检查钱包是否已解锁
     */
    isWalletUnlocked(): boolean {
        return this.isUnlocked;
    }

    /**
     * 获取SOL余额
     */
    async getSolBalance(): Promise<number> {
        if (!this.isUnlocked || !this.currentKeypair) {
            throw new Error('钱包未解锁');
        }

        try {
            // 使用注入的SolanaWeb3Service获取余额
            const balanceResult = await this.solanaService.getBalance(this.currentKeypair.publicKey);

            if (!balanceResult.success) {
                throw new Error(`查询余额失败: ${balanceResult.error}`);
            }

            // balanceResult.balance 已经是SOL单位了，不需要再次转换
            const solBalance = balanceResult.balance;

            await this.loggerService.logSystem('DEBUG', `钱包SOL余额: ${solBalance} SOL (${balanceResult.lamports} lamports)`);

            return solBalance;
        } catch (error) {
            await this.loggerService.logError('WalletService', '获取SOL余额失败:', error as Error);
            throw error;
        }
    }

    /**
     * 获取指定代币余额 (暂时返回0，需要实现代币账户查找逻辑)
     */
    async getTokenBalance(tokenMint: string): Promise<number> {
        if (!this.isUnlocked || !this.currentKeypair) {
            throw new Error('钱包未解锁');
        }

        try {
            // TODO: 需要实现代币账户查找和余额查询逻辑
            // 目前暂时返回0，避免API错误
            await this.loggerService.logSystem('DEBUG', `代币余额查询 (${tokenMint}): 功能待实现`);
            return 0;
        } catch (error) {
            await this.loggerService.logError('WalletService', `获取代币余额失败 (${tokenMint}):`, error as Error);
            throw error;
        }
    }

    /**
     * 获取所有代币余额
     */
    async getAllTokenBalances(): Promise<any> {
        if (!this.isUnlocked || !this.currentKeypair) {
            throw new Error('钱包未解锁');
        }

        try {
            // 获取SOL余额
            const solBalance = await this.getSolBalance();

            // 目前只返回SOL余额，代币余额功能待实现
            const allBalances = {
                sol: {
                    mint: 'SOL',
                    balance: solBalance,
                    decimals: 9,
                    symbol: 'SOL',
                    name: 'Solana'
                },
                tokens: [] // 代币余额功能待实现
            };

            await this.loggerService.logSystem('DEBUG', `获取所有余额完成，SOL: ${solBalance}, 代币数量: 0 (功能待实现)`);

            return allBalances;
        } catch (error) {
            await this.loggerService.logError('WalletService', '获取所有代币余额失败:', error as Error);
            throw error;
        }
    }

    /**
     * 加密钱包数据
     * 参考原项目: scryptSync + AES-256-GCM
     */
    private async encryptWallet(data: Uint8Array, password: string): Promise<Buffer> {
        try {
            // 生成随机盐值
            const salt = crypto.randomBytes(this.SALT_LENGTH);

            // 使用scrypt派生密钥 (与原项目一致)
            const key = crypto.scryptSync(password, salt, 32, {
                N: 16384,  // CPU成本参数
                r: 8,      // 内存成本参数
                p: 1       // 并行成本参数
            });

            // 生成随机初始化向量
            const iv = crypto.randomBytes(this.IV_LENGTH);

            // 创建加密器
            const cipher = crypto.createCipheriv(this.ALGORITHM, key, iv);

            // 加密数据
            const encrypted = Buffer.concat([
                cipher.update(data),
                cipher.final()
            ]);

            // 获取认证标签
            const tag = cipher.getAuthTag();

            // 组合最终数据: 盐值 + IV + 认证标签 + 加密数据
            const result = Buffer.concat([
                salt,
                iv,
                tag,
                encrypted
            ]);

            this.loggerService.logSystem('DEBUG', `钱包加密完成，加密数据大小: ${encrypted.length}`);

            // 📊 业务监控日志: 钱包加密完成
            await this.loggerService.logBusinessMonitoring('wallet-encryption', {
                dataSize: data.length,
                encryptedSize: result.length,
                algorithm: this.ALGORITHM
            });

            return result;
        } catch (error) {
            this.errorCount++;
            await this.loggerService.logError('wallet-encrypt', '钱包加密失败', error as Error);
            throw new Error(`钱包加密失败: ${error instanceof Error ? error.message : '未知错误'}`);
        }
    }

    /**
     * 解密钱包数据
     */
    private async decryptWallet(encryptedData: Buffer, password: string): Promise<Uint8Array> {
        try {
            // 提取组件
            const salt = encryptedData.subarray(0, this.SALT_LENGTH);
            const iv = encryptedData.subarray(this.SALT_LENGTH, this.SALT_LENGTH + this.IV_LENGTH);
            const tag = encryptedData.subarray(
                this.SALT_LENGTH + this.IV_LENGTH,
                this.SALT_LENGTH + this.IV_LENGTH + this.TAG_LENGTH
            );
            const encrypted = encryptedData.subarray(this.SALT_LENGTH + this.IV_LENGTH + this.TAG_LENGTH);

            // 派生密钥
            const key = crypto.scryptSync(password, salt, 32, {
                N: 16384,
                r: 8,
                p: 1
            });

            // 创建解密器
            const decipher = crypto.createDecipheriv(this.ALGORITHM, key, iv);
            decipher.setAuthTag(tag);

            // 解密数据
            const decrypted = Buffer.concat([
                decipher.update(encrypted),
                decipher.final()
            ]);

            this.loggerService.logSystem('DEBUG', `钱包解密完成，解密数据大小: ${decrypted.length}`);

            // 📊 业务监控日志: 钱包解密完成
            await this.loggerService.logBusinessMonitoring('wallet-decryption', {
                encryptedSize: encryptedData.length,
                decryptedSize: decrypted.length
            });

            return new Uint8Array(decrypted);
        } catch (error) {
            this.errorCount++;
            await this.loggerService.logError('wallet-decrypt', '钱包解密失败', error as Error);
            throw new Error(`钱包解密失败: ${error instanceof Error ? error.message : '未知错误'}`);
        }
    }

    /**
     * 检查数据是否为加密钱包
     */
    private isEncryptedWallet(data: Buffer): boolean {
        // 加密钱包的最小长度: 盐值32 + IV16 + 标签16 + 私钥64 = 128字节
        if (data.length < 128) {
            return false;
        }

        // 明文私钥长度应该是64字节
        if (data.length === 64) {
            return false;
        }

        // 其他情况视为加密钱包
        return true;
    }

    /**
     * 更新最后使用时间
     */
    private async updateLastUsedTime(): Promise<void> {
        try {
            const walletInfo = await this.stateService.load<WalletInfo>('wallet_info');
            if (walletInfo) {
                walletInfo.lastUsed = Date.now();
                await this.stateService.save('wallet_info', walletInfo);
            }
        } catch (error) {
            // 🔧 系统日志: 更新钱包最后使用时间失败
            await this.loggerService.logSystem('WARN', `更新钱包最后使用时间失败: ${error instanceof Error ? error.message : '未知错误'}`);
        }
    }

    /**
     * 获取当前密钥对 (内部使用)
     */
    getCurrentKeypair(): Keypair | null {
        return this.currentKeypair;
    }

    /**
     * 销毁服务，清理资源
     */
    async destroy(): Promise<void> {
        this.lockWallet();
        await this.loggerService.logSystem('INFO', 'WalletService资源已清理');
    }

    public async unlock(password: string): Promise<boolean> {
        if (this.isWalletUnlocked()) {
            return true;
        }

        try {
            const encryptedData = await fs.readFile(this.walletPath);
            const decryptedSecretKey = await this.decryptWallet(encryptedData, password);
            this.currentKeypair = Keypair.fromSecretKey(decryptedSecretKey);
            this.isUnlocked = true;

            await this.loggerService.logSystem('INFO', `🔓 钱包已解锁: ${this.currentKeypair?.publicKey.toString()}`);
            return true;
        } catch (error) {
            this.errorCount++;
            this.lockWallet();
            await this.loggerService.logError('wallet-unlock', '钱包解锁失败', error as Error);
            return false;
        }
    }

    /**
     * 通过私钥导入钱包
     * @param privateKey Base58编码的私钥
     * @param password 可选密码，用于加密钱包
     */
    async importFromPrivateKey(privateKey: string, password?: string): Promise<WalletInfo> {
        const operationStart = Date.now();
        this.operationCount++;

        try {
            await this.loggerService.logBusinessOperation('wallet-import-by-key-start', {
                isEncrypted: !!password,
                timestamp: operationStart
            });

            // 验证并解码私钥
            const decodedKey = bs58.decode(privateKey);
            if (decodedKey.length !== 64) {
                throw new Error('私钥格式无效，解码后的长度必须为64字节');
            }
            const keypair = Keypair.fromSecretKey(decodedKey);
            const address = keypair.publicKey.toString();

            // 复用已有的 saveWallet 方法
            await this.saveWallet(keypair, password);

            // 更新当前服务状态
            this.currentKeypair = keypair;
            this.isUnlocked = true;

            const walletInfo: WalletInfo = {
                address,
                isEncrypted: !!password,
                createdAt: Date.now(),
                lastUsed: Date.now()
            };

            // 更新持久化状态
            await this.stateService.save('wallet_info', walletInfo);
            this.lastOperationTime = Date.now();

            await this.loggerService.logBusinessOperation('wallet-import-by-key-success', {
                address: address.substring(0, 8) + '...',
                isEncrypted: !!password,
                operationDuration: Date.now() - operationStart
            });

            return walletInfo;
        } catch (error) {
            this.errorCount++;
            await this.loggerService.logError('wallet-import-by-key', '通过私钥导入钱包失败', error as Error);
            throw new Error(`通过私钥导入钱包失败: ${error instanceof Error ? error.message : '未知错误'}`);
        }
    }
} 