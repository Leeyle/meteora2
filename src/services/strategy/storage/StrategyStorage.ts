import 'reflect-metadata';
import { injectable, inject } from 'tsyringe';
import { TYPES, ILoggerService } from '../../../types/interfaces';
import { StrategyInstance } from '../StrategyManager';
import fs from 'fs/promises';
import path from 'path';

@injectable()
export class StrategyStorage {
    private storagePath: string;
    private initialized = false;

    constructor(
        @inject(TYPES.LoggerService) private logger: ILoggerService
    ) {
        this.storagePath = path.join(process.cwd(), 'data', 'strategies');
    }

    async initialize(): Promise<void> {
        if (this.initialized) return;

        try {
            // 确保存储目录存在
            await fs.mkdir(this.storagePath, { recursive: true });

            this.initialized = true;
            await this.logger.logSystem('INFO', `[StrategyStorage] 存储初始化完成: ${this.storagePath}`);
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            await this.logger.logSystem('ERROR', `[StrategyStorage] 存储初始化失败: ${errorMessage}`);
            throw error;
        }
    }

    async saveInstance(instance: StrategyInstance): Promise<void> {
        if (!this.initialized) {
            await this.initialize();
        }

        try {
            const filePath = this.getInstanceFilePath(instance.id);
            const tempPath = filePath + '.tmp';
            const data = JSON.stringify(instance, null, 2);

            // 🔒 原子写入：先写临时文件，再重命名（防止意外中断清空文件）
            await fs.writeFile(tempPath, data, 'utf-8');
            await fs.rename(tempPath, filePath);

            // 只在调试模式下记录详细日志
            // await this.logger.logSystem('DEBUG', `[StrategyStorage] 策略实例已保存: ${instance.id}`);
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            await this.logger.logError('strategy-storage', `[StrategyStorage] 保存策略实例失败: ${instance.id}`, error as Error);
            throw error;
        }
    }

    async loadInstance(instanceId: string): Promise<StrategyInstance | null> {
        if (!this.initialized) {
            await this.initialize();
        }

        try {
            const filePath = this.getInstanceFilePath(instanceId);
            const data = await fs.readFile(filePath, 'utf-8');
            const instance = JSON.parse(data);

            // 转换日期字段
            instance.createdAt = new Date(instance.createdAt);
            if (instance.startedAt) instance.startedAt = new Date(instance.startedAt);
            if (instance.stoppedAt) instance.stoppedAt = new Date(instance.stoppedAt);

            return instance;
        } catch (error) {
            if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
                return null; // 文件不存在
            }

            const errorMessage = error instanceof Error ? error.message : String(error);
            await this.logger.logError('strategy-storage', `[StrategyStorage] 加载策略实例失败: ${instanceId}`, error as Error);
            throw error;
        }
    }

    async loadInstances(): Promise<StrategyInstance[]> {
        if (!this.initialized) {
            await this.initialize();
        }

        try {
            const files = await fs.readdir(this.storagePath);
            const instances: StrategyInstance[] = [];

            for (const file of files) {
                if (file.endsWith('.json')) {
                    const instanceId = path.basename(file, '.json');
                    const instance = await this.loadInstance(instanceId);
                    if (instance) {
                        instances.push(instance);
                    }
                }
            }

            await this.logger.logSystem('INFO', `[StrategyStorage] 加载了 ${instances.length} 个策略实例`);
            return instances;
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            await this.logger.logError('strategy-storage', '[StrategyStorage] 加载策略实例列表失败', error as Error);
            throw error;
        }
    }

    async deleteInstance(instanceId: string): Promise<void> {
        if (!this.initialized) {
            await this.initialize();
        }

        try {
            const filePath = this.getInstanceFilePath(instanceId);
            await fs.unlink(filePath);

            await this.logger.logSystem('INFO', `[StrategyStorage] 策略实例已删除: ${instanceId}`);
        } catch (error) {
            if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
                return; // 文件不存在，视为成功
            }

            const errorMessage = error instanceof Error ? error.message : String(error);
            await this.logger.logError('strategy-storage', `[StrategyStorage] 删除策略实例失败: ${instanceId}`, error as Error);
            throw error;
        }
    }

    async instanceExists(instanceId: string): Promise<boolean> {
        if (!this.initialized) {
            await this.initialize();
        }

        try {
            const filePath = this.getInstanceFilePath(instanceId);
            await fs.access(filePath);
            return true;
        } catch (error) {
            return false;
        }
    }

    async listInstanceIds(): Promise<string[]> {
        if (!this.initialized) {
            await this.initialize();
        }

        try {
            const files = await fs.readdir(this.storagePath);
            return files
                .filter(file => file.endsWith('.json'))
                .map(file => path.basename(file, '.json'));
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            await this.logger.logError('strategy-storage', '[StrategyStorage] 列出策略实例ID失败', error as Error);
            throw error;
        }
    }

    async cleanup(): Promise<void> {
        // 清理临时文件或备份等
        await this.logger.logSystem('INFO', '[StrategyStorage] 存储清理完成');
    }

    private getInstanceFilePath(instanceId: string): string {
        return path.join(this.storagePath, `${instanceId}.json`);
    }
} 