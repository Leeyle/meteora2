/**
 * ⚙️ DLMM流动性管理系统 - 配置服务
 * 
 * 系统配置管理服务
 */

import { injectable } from 'tsyringe';
import type { ILoggerService } from '../../types/interfaces';

/**
 * 系统配置接口
 */
export interface SystemConfig {
    // 网络配置
    network: 'mainnet' | 'devnet' | 'testnet';
    rpcUrl: string;
    wsUrl?: string;

    // API配置
    apiPort: number;
    wsPort: number;

    // Solana配置
    commitment: 'processed' | 'confirmed' | 'finalized';

    // 外部服务配置
    jupiterApiUrl?: string;
    meteoraApiUrl?: string;
    heliusApiKey?: string;

    // 系统配置
    logLevel: 'debug' | 'info' | 'warn' | 'error';
    maxRetries: number;
    retryDelay: number;

    // 本地存储配置
    dataDir: string;
    enablePersistence: boolean;

    // 应用配置
    app?: {
        dataDir: string;
    };

    // Solana 特定配置
    solana?: {
        network: string;
        rpcEndpoints: string[];
        priorityFee: number;
        commitment: string;
        timeout: number;
        wsEndpoint?: string;
    };
}

/**
 * 配置服务接口
 */
export interface IConfigService {
    get<T = any>(key: string, defaultValue?: T): T | undefined;
    set<T = any>(key: string, value: T): void;
    has(key: string): boolean;
    getAll(): SystemConfig;
    load(): Promise<void>;
    save(): Promise<void>;
    reset(): void;
}

/**
 * 配置服务实现类
 */
@injectable()
export class ConfigService implements IConfigService {
    private config: Partial<SystemConfig> = {};
    private logger!: ILoggerService;
    private defaultConfig: SystemConfig;

    constructor() {
        // Logger将通过依赖注入设置
        this.defaultConfig = this.getDefaultConfig();
        this.config = { ...this.defaultConfig };
        // 配置服务初始化完成（日志将在服务启动后记录）
    }

    /**
     * 安全的日志记录方法，避免在logger未注入时出错
     */
    private async safeLog(level: 'INFO' | 'WARN' | 'ERROR', message: string): Promise<void> {
        try {
            if (this.logger && typeof this.logger.logSystem === 'function') {
                await this.logger.logSystem(level, message);
            } else {
                // 回退到console.log
                console.log(`[Config-${level}] ${message}`);
            }
        } catch (error) {
            // 静默失败，避免影响配置加载
            console.log(`[Config-${level}] ${message}`);
        }
    }

    /**
     * 获取配置值
     */
    public get<T = any>(key: string, defaultValue?: T): T | undefined {
        const keys = key.split('.');
        let value: any = this.config;

        for (const k of keys) {
            if (value && typeof value === 'object' && k in value) {
                value = value[k];
            } else {
                return defaultValue;
            }
        }

        return value as T;
    }

    /**
     * 设置配置值
     */
    public async set<T = any>(key: string, value: T): Promise<void> {
        const keys = key.split('.');
        let current: any = this.config;

        for (let i = 0; i < keys.length - 1; i++) {
            const k = keys[i];
            if (!current[k] || typeof current[k] !== 'object') {
                current[k] = {};
            }
            current = current[k];
        }

        current[keys[keys.length - 1]] = value;
        await this.safeLog('INFO', `⚙️ [Config] 配置已更新: ${key} = ${JSON.stringify(value)}`);
    }

    /**
     * 检查配置是否存在
     */
    public has(key: string): boolean {
        return this.get(key) !== undefined;
    }

    /**
     * 获取所有配置
     */
    public getAll(): SystemConfig {
        return { ...this.config } as SystemConfig;
    }

    /**
     * 加载配置
     */
    public async load(): Promise<void> {
        try {
            // 从环境变量加载配置
            this.loadFromEnv();

            // 从本地文件加载配置（如果存在）
            await this.loadFromFile();

            await this.safeLog('INFO', '⚙️ [Config] 配置加载完成');
        } catch (error) {
            await this.safeLog('ERROR', `❌ [Config] 配置加载失败: ${(error as Error).message}`);
            throw error;
        }
    }

    /**
     * 保存配置
     */
    public async save(): Promise<void> {
        try {
            // 本地部署不需要持久化到文件
            await this.logger.logSystem('INFO', '⚙️ [Config] 配置已保存到内存');
        } catch (error) {
            await this.logger.logError('Service', '❌ [Config] 配置保存失败:', error as Error);
            throw error;
        }
    }

    /**
     * 重置配置
     */
    public async reset(): Promise<void> {
        this.config = { ...this.defaultConfig };
        await this.logger.logSystem('INFO', '⚙️ [Config] 配置已重置为默认值');
    }

    /**
     * 获取默认配置
     */
    private getDefaultConfig(): SystemConfig {
        return {
            // 网络配置
            network: 'mainnet',
            rpcUrl: 'https://api.mainnet-beta.solana.com',
            wsUrl: 'wss://api.mainnet-beta.solana.com',

            // API配置
            apiPort: 7000,
            wsPort: 7002,

            // Solana配置
            commitment: 'confirmed',

            // 外部服务配置
            jupiterApiUrl: 'https://quote-api.jup.ag/v6',
            meteoraApiUrl: 'https://dlmm-api.meteora.ag',

            // 系统配置
            logLevel: 'info',
            maxRetries: 3,
            retryDelay: 1000,

            // 本地存储配置
            dataDir: './data',
            enablePersistence: false,

            // 应用配置
            app: {
                dataDir: './data'
            },

            // Solana 特定配置
            solana: {
                network: 'mainnet-beta',
                rpcEndpoints: [
                    'https://mainnet.helius-rpc.com/?api-key=13d60095-6323-4ef5-bf9a-2a39f0ca7f62',
                    'https://solana-rpc.publicnode.com',
                    'https://api.mainnet-beta.solana.com',
                    'https://solana-api.projectserum.com'
                ],
                priorityFee: 100000,
                commitment: 'confirmed',
                timeout: 30000,
                wsEndpoint: 'wss://api.mainnet-beta.solana.com'
            }
        };
    }

    /**
     * 从环境变量加载配置
     */
    private async loadFromEnv(): Promise<void> {
        const env = process.env;

        // 网络配置
        if (env.SOLANA_NETWORK) {
            this.set('network', env.SOLANA_NETWORK);
        }
        if (env.SOLANA_RPC_URL) {
            this.set('rpcUrl', env.SOLANA_RPC_URL);
        }
        if (env.SOLANA_WS_URL) {
            this.set('wsUrl', env.SOLANA_WS_URL);
        }

        // API配置
        if (env.API_PORT) {
            this.set('apiPort', parseInt(env.API_PORT));
        }
        if (env.WS_PORT) {
            this.set('wsPort', parseInt(env.WS_PORT));
        }

        // 外部服务配置
        if (env.JUPITER_API_URL) {
            this.set('jupiterApiUrl', env.JUPITER_API_URL);
        }
        if (env.METEORA_API_URL) {
            this.set('meteoraApiUrl', env.METEORA_API_URL);
        }
        if (env.HELIUS_API_KEY) {
            this.set('heliusApiKey', env.HELIUS_API_KEY);
        }

        // 系统配置
        if (env.LOG_LEVEL) {
            this.set('logLevel', env.LOG_LEVEL);
        }

        await this.safeLog('INFO', '⚙️ [Config] 环境变量配置已加载');
    }

    /**
     * 从文件加载配置
     */
    private async loadFromFile(): Promise<void> {
        try {
            const path = require('path');
            const fs = require('fs').promises;

            // 配置文件路径
            const configPath = path.join(process.cwd(), 'config', 'default.json');

            // 检查文件是否存在
            try {
                await fs.access(configPath);
            } catch (error) {
                await this.safeLog('INFO', '⚙️ [Config] 配置文件不存在，跳过文件配置加载');
                return;
            }

            // 读取配置文件
            const configContent = await fs.readFile(configPath, 'utf8');
            const fileConfig = JSON.parse(configContent);

            // 合并配置到当前配置中
            this.mergeConfig(fileConfig);

            await this.safeLog('INFO', `⚙️ [Config] 成功加载配置文件: ${configPath}`);

        } catch (error) {
            await this.safeLog('ERROR', `❌ [Config] 加载配置文件失败: ${(error as Error).message}`);
            // 不抛出错误，继续使用默认配置
        }
    }

    /**
     * 合并配置对象
     */
    private mergeConfig(newConfig: any): void {
        // 深度合并配置
        const mergeDeep = (target: any, source: any): any => {
            for (const key in source) {
                if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
                    if (!target[key] || typeof target[key] !== 'object') {
                        target[key] = {};
                    }
                    mergeDeep(target[key], source[key]);
                } else {
                    target[key] = source[key];
                }
            }
            return target;
        };

        mergeDeep(this.config, newConfig);
    }

    /**
     * 获取网络相关配置
     */
    public getNetworkConfig() {
        return {
            network: this.get<string>('network'),
            rpcUrl: this.get<string>('rpcUrl'),
            wsUrl: this.get<string>('wsUrl'),
            commitment: this.get<string>('commitment')
        };
    }

    /**
     * 获取API相关配置
     */
    public getApiConfig() {
        return {
            apiPort: this.get<number>('apiPort'),
            wsPort: this.get<number>('wsPort')
        };
    }

    /**
     * 获取外部服务配置
     */
    public getExternalConfig() {
        return {
            jupiterApiUrl: this.get<string>('jupiterApiUrl'),
            meteoraApiUrl: this.get<string>('meteoraApiUrl'),
            heliusApiKey: this.get<string>('heliusApiKey')
        };
    }
} 