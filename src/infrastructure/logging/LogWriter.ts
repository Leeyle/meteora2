import fs from 'fs/promises';
import path from 'path';
import { TimeFormatter } from './TimeFormatter';
import type { LogLevel, ILogWriter, LogEntry } from '../../types/logging';

/**
 * 异步日志文件写入器
 * 支持文件轮转、队列缓冲和错误处理
 */
export class LogWriter implements ILogWriter {
    private writeQueue: Array<{ content: string; filePath: string }> = [];
    private isWriting = false;
    private maxFileSize: number;
    private maxFiles: number;
    private logDirectory: string;

    constructor(config: { maxFileSize: number; maxFiles: number; logDirectory: string }) {
        this.maxFileSize = config.maxFileSize;
        this.maxFiles = config.maxFiles;
        this.logDirectory = config.logDirectory;
        // 🔥 异步确保目录存在，但不阻塞构造函数
        this.ensureLogDirectory().catch(error => {
            console.error('初始化日志目录失败:', error);
        });
    }

    /**
     * 写入日志条目
     */
    async writeLog(category: string, level: LogLevel, message: string, traceId?: string): Promise<void> {
        const timestamp = TimeFormatter.format();
        const traceInfo = traceId ? ` [${traceId}]` : '';
        const logEntry = `${timestamp} ${level}${traceInfo} [${category}] ${message}\n`;

        const filePath = this.getLogFilePath(category, 'log');
        await this.enqueueWrite(logEntry, filePath);

        // ERROR级别的日志需要双重记录
        if (level === 'ERROR') {
            const errorPath = this.getLogFilePath('errors', 'error');
            await this.enqueueWrite(logEntry, errorPath);
        }
    }

    /**
     * 写入错误日志（双重记录）
     */
    async writeErrorLog(category: string, message: string, error?: Error, traceId?: string): Promise<void> {
        const timestamp = TimeFormatter.format();
        const traceInfo = traceId ? ` [${traceId}]` : '';
        const errorDetails = error ? `\nError: ${error.message}\nStack: ${error.stack}` : '';
        const logEntry = `${timestamp} ERROR${traceInfo} [${category}] ${message}${errorDetails}\n`;

        // 写入原分类文件
        const categoryPath = this.getLogFilePath(category, 'log');
        await this.enqueueWrite(logEntry, categoryPath);

        // 写入统一错误文件
        const errorPath = this.getLogFilePath('errors', 'error');
        await this.enqueueWrite(logEntry, errorPath);
    }

    /**
     * 刷新所有待写入的日志
     */
    async flush(): Promise<void> {
        while (this.writeQueue.length > 0 || this.isWriting) {
            await new Promise(resolve => setTimeout(resolve, 10));
        }
    }

    /**
     * 关闭日志写入器
     */
    async shutdown(): Promise<void> {
        await this.flush();
    }

    /**
     * 入队写入任务
     */
    private async enqueueWrite(content: string, filePath: string): Promise<void> {
        this.writeQueue.push({ content, filePath });
        if (!this.isWriting) {
            await this.processWriteQueue();
        }
    }

    /**
     * 处理写入队列
     */
    private async processWriteQueue(): Promise<void> {
        if (this.isWriting) return;
        this.isWriting = true;

        try {
            while (this.writeQueue.length > 0) {
                const { content, filePath } = this.writeQueue.shift()!;
                await this.writeToFile(content, filePath);
            }
        } finally {
            this.isWriting = false;
        }
    }

    /**
     * 🔧 修复：写入文件并处理轮转，完全解决目录创建竞态条件问题
     */
    private async writeToFile(content: string, filePath: string): Promise<void> {
        const maxRetries = 3;
        let retryCount = 0;

        while (retryCount < maxRetries) {
            try {
                // 🔧 每次写入前都确保目录存在
                const dir = path.dirname(filePath);
                await this.ensureDirectoryWithWait(dir);

                // 检查文件大小并轮转
                await this.checkAndRotateFile(filePath);

                // 写入文件
                await fs.appendFile(filePath, content, 'utf8');
                return; // 成功写入，退出重试循环
                
            } catch (error) {
                retryCount++;
                console.error(`日志写入失败 (第${retryCount}次尝试): ${filePath}`, error);
                
                if (retryCount >= maxRetries) {
                    // 最后一次尝试：使用同步方式
                    try {
                        const fsSync = require('fs');
                        const dir = path.dirname(filePath);
                        fsSync.mkdirSync(dir, { recursive: true });
                        fsSync.appendFileSync(filePath, content, 'utf8');
                        console.log(`🔄 日志同步写入成功: ${filePath}`);
                        return;
                    } catch (syncError) {
                        console.error(`日志同步写入也失败: ${filePath}`, syncError);
                    }
                } else {
                    // 等待一小段时间后重试
                    await new Promise(resolve => setTimeout(resolve, 100 * retryCount));
                }
            }
        }
    }

    /**
     * 🔧 新增：确保目录存在并等待创建完成
     */
    private async ensureDirectoryWithWait(dirPath: string): Promise<void> {
        try {
            await fs.mkdir(dirPath, { recursive: true });
            
            // 额外验证：确认目录确实存在
            await fs.access(dirPath, fs.constants.F_OK);
            
        } catch (error) {
            // 如果是ENOENT，再次尝试创建
            if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
                console.warn(`目录创建失败，重试: ${dirPath}`);
                await new Promise(resolve => setTimeout(resolve, 50)); // 短暂等待
                await fs.mkdir(dirPath, { recursive: true });
                await fs.access(dirPath, fs.constants.F_OK); // 再次验证
                console.log(`✅ 重试创建目录成功: ${dirPath}`);
            } else {
                throw error; // 其他错误继续抛出
            }
        }
    }

    /**
     * 检查文件大小并轮转
     */
    private async checkAndRotateFile(filePath: string): Promise<void> {
        try {
            const stats = await fs.stat(filePath);
            if (stats.size >= this.maxFileSize) {
                await this.rotateFile(filePath);
            }
        } catch (error) {
            // 文件不存在，无需轮转
        }
    }

    /**
     * 文件轮转
     */
    private async rotateFile(filePath: string): Promise<void> {
        const dir = path.dirname(filePath);
        const ext = path.extname(filePath);
        const basename = path.basename(filePath, ext);

        try {
            // 删除最旧的文件（如果存在）
            const oldestFile = path.join(dir, `${basename}.${this.maxFiles - 1}${ext}`);
            try {
                await fs.unlink(oldestFile);
            } catch {
                // 文件不存在，忽略
            }

            // 移动现有文件
            for (let i = this.maxFiles - 2; i >= 1; i--) {
                const oldFile = path.join(dir, `${basename}.${i}${ext}`);
                const newFile = path.join(dir, `${basename}.${i + 1}${ext}`);
                try {
                    await fs.rename(oldFile, newFile);
                } catch {
                    // 文件不存在，继续
                }
            }

            // 移动当前文件
            const backupFile = path.join(dir, `${basename}.1${ext}`);
            await fs.rename(filePath, backupFile);
        } catch (error) {
            console.error(`文件轮转失败: ${filePath}`, error);
        }
    }

    /**
     * 获取日志文件路径
     */
    private getLogFilePath(category: string, type: 'log' | 'error'): string {
        const subDir = category.includes('/') ? '' : this.getCategorySubDirectory(category);
        const fileName = `${category.replace('/', '-')}.${type}`;
        return path.join(this.logDirectory, subDir, fileName);
    }

    /**
     * 🔧 修复：获取分类子目录 - 统一策略实例日志路径格式
     */
    private getCategorySubDirectory(category: string): string {
        // 🔧 关键修复：检查是否为策略实例目录（支持多种路径格式）
        const isStrategyInstanceDir = 
            this.logDirectory.includes('/strategies/instance-') ||
            this.logDirectory.includes('\\strategies\\instance-') ||  // Windows路径
            this.logDirectory.endsWith('/operations') ||              // operations目录
            this.logDirectory.endsWith('/monitoring') ||              // monitoring目录
            this.logDirectory.match(/instance-[^/\\]+[/\\](operations|monitoring)$/); // 匹配实例子目录

        if (isStrategyInstanceDir) {
            // 策略实例目录中不创建额外的子目录分类
            return '';
        }
        
        // 根据三层架构分配子目录（仅用于主日志目录）
        if (category.startsWith('system')) return 'system';
        if (category.startsWith('business')) return 'business';
        if (category.startsWith('strategy-')) return 'strategies';
        if (category === 'errors') return 'errors';
        return 'misc';
    }

    /**
     * 🔧 修复：确保目录存在，增强父目录创建和错误处理
     */
    private async ensureDirectory(dirPath: string): Promise<void> {
        try {
            // 🔧 使用递归创建，确保所有父目录都存在
            await fs.mkdir(dirPath, { recursive: true });
        } catch (error) {
            // 🔧 增强错误处理：如果是ENOENT错误，尝试先创建父目录
            if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
                try {
                    const parentDir = path.dirname(dirPath);
                    console.warn(`父目录不存在，先创建父目录: ${parentDir}`);
                    await fs.mkdir(parentDir, { recursive: true });
                    
                    // 重试创建目标目录
                    await fs.mkdir(dirPath, { recursive: true });
                    console.log(`✅ 重试创建目录成功: ${dirPath}`);
                } catch (retryError) {
                    console.error(`❌ 重试创建目录仍然失败: ${dirPath}`, retryError);
                }
            } else {
                console.error(`创建目录失败: ${dirPath}`, error);
            }
            // 🔥 不要抛出错误，让系统继续运行
        }
    }

    /**
     * 读取最近的日志条目
     */
    async readLogs(category: string, limit: number = 50): Promise<LogEntry[]> {
        const filePath = this.getLogFilePath(category, 'log');
        return this.readLogFile(filePath, limit);
    }

    /**
     * 读取错误日志
     */
    async readErrorLogs(limit: number = 50): Promise<LogEntry[]> {
        const filePath = this.getLogFilePath('errors', 'error');
        return this.readLogFile(filePath, limit);
    }

    /**
     * 读取指定日志文件
     */
    private async readLogFile(filePath: string, limit: number): Promise<LogEntry[]> {
        try {
            // 确保写入队列已处理完成
            await this.flush();

            const content = await fs.readFile(filePath, 'utf8');
            const lines = content.split('\n').filter(line => line.trim());

            // 取最后limit行
            const recentLines = lines.slice(-limit);

            return recentLines.map(line => this.parseLogLine(line)).filter(entry => entry !== null) as LogEntry[];
        } catch (error) {
            // 文件不存在或读取失败，返回空数组
            return [];
        }
    }

    /**
     * 解析日志行
     */
    private parseLogLine(line: string): LogEntry | null {
        try {
            // 日志格式: 2025-06-09T12:30:15.123Z INFO [req-123] [category] message
            const match = line.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z)\s+(\w+)(?:\s+\[([^\]]+)\])?\s+\[([^\]]+)\]\s+(.*)$/);

            if (match) {
                const [, timestamp, level, traceId, category, message] = match;
                const logEntry: LogEntry = {
                    timestamp: new Date(timestamp),
                    level: level as LogLevel,
                    category,
                    message
                };
                if (traceId) {
                    logEntry.traceId = traceId;
                }
                return logEntry;
            }

            // 如果解析失败，返回基本格式
            return {
                timestamp: new Date(),
                level: 'INFO' as LogLevel,
                category: 'unknown',
                message: line
            };
        } catch (error) {
            return null;
        }
    }

    /**
     * 获取所有日志文件列表
     */
    async getLogFiles(): Promise<string[]> {
        try {
            const files: string[] = [];

            // 递归读取所有子目录的.log文件
            const readDirectory = async (dirPath: string): Promise<void> => {
                try {
                    const entries = await fs.readdir(dirPath, { withFileTypes: true });

                    for (const entry of entries) {
                        const fullPath = path.join(dirPath, entry.name);

                        if (entry.isDirectory()) {
                            await readDirectory(fullPath);
                        } else if (entry.name.endsWith('.log') || entry.name.endsWith('.error')) {
                            files.push(fullPath);
                        }
                    }
                } catch (error) {
                    // 目录不存在或无法读取，忽略
                }
            };

            await readDirectory(this.logDirectory);
            return files;
        } catch (error) {
            return [];
        }
    }

    /**
     * 确保日志根目录存在
     */
    private async ensureLogDirectory(): Promise<void> {
        // 🔥 首先创建主日志目录（递归创建整个路径）
        await this.ensureDirectory(this.logDirectory);

        // 🔥 创建基础分类目录（所有类型的日志都需要这些基础目录）
        const subDirs = ['system', 'business', 'strategies', 'errors'];
        for (const subDir of subDirs) {
            await this.ensureDirectory(path.join(this.logDirectory, subDir));
        }
    }
} 