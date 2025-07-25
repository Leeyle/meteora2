/**
 * 日志系统统一导出
 * 遵循三层分离架构的日志系统组件
 */

// 核心类型定义
export * from '../../types/logging';

// 核心类
export { LoggerService } from './LoggerService';
export { LogWriter } from './LogWriter';
export { StrategyLogger } from './StrategyLogger';
export { CrawlerLogger } from './CrawlerLogger';
export { TimeFormatter } from './TimeFormatter';
export { TraceContext } from './TraceContext';

// 便捷创建函数
import { LoggerService } from './LoggerService';
import { DEFAULT_DEV_CONFIG, PRODUCTION_CONFIG, ILogConfig, LogLevel } from '../../types/logging';
import path from 'path';
import fs from 'fs';

/**
 * 从配置文件加载日志配置
 * 确保正确映射到三层分离架构的 ILogConfig 接口
 */
export function loadLogConfigFromFile(environment?: string): ILogConfig {
    const env = environment || process.env.NODE_ENV || 'development';
    // 配置文件在项目根目录的 config/logging/ 目录下
    const configPath = path.join(__dirname, '../../../config/logging', `${env}.json`);

    try {
        if (fs.existsSync(configPath)) {
            const configData = JSON.parse(fs.readFileSync(configPath, 'utf8'));
            console.log(`📄 [日志系统] 加载配置文件: ${configPath}`);

            // 转换配置格式为 ILogConfig 接口
            const logConfig: ILogConfig = {
                globalLevel: LogLevel[configData.levels.system as keyof typeof LogLevel] || LogLevel.INFO,
                enableTracing: true,
                maxFileSize: configData.fileConfig?.maxFileSize || 2 * 1024 * 1024,
                maxFiles: configData.fileConfig?.maxFiles || 3,

                // 三层分离架构：映射各个层级的日志级别
                categoryLevels: {
                    system: LogLevel[configData.levels.system as keyof typeof LogLevel] || LogLevel.INFO,
                    business: LogLevel[configData.levels.business as keyof typeof LogLevel] || LogLevel.INFO,
                    strategies: LogLevel[configData.levels.strategies as keyof typeof LogLevel] || LogLevel.INFO
                },

                // ILogConfig 接口中的其他属性
                enableConsole: configData.levels.console !== 'OFF',
                enableFile: true,
                timeFormat: 'MM/DD HH:mm:ss'
            };

            console.log(`📄 [日志系统] 配置加载成功:`);
            console.log(`   - 系统级别: ${logConfig.categoryLevels.system}`);
            console.log(`   - 业务级别: ${logConfig.categoryLevels.business} (控制 [BUSINESS-MON] 显示)`);
            console.log(`   - 策略级别: ${logConfig.categoryLevels.strategies}`);

            return logConfig;
        } else {
            console.warn(`⚠️  [日志系统] 配置文件不存在: ${configPath}，使用默认配置`);
            return env === 'production' ? PRODUCTION_CONFIG : DEFAULT_DEV_CONFIG;
        }
    } catch (error) {
        console.error(`❌ [日志系统] 加载配置文件失败: ${configPath}`, error);
        return env === 'production' ? PRODUCTION_CONFIG : DEFAULT_DEV_CONFIG;
    }
}

/**
 * 创建开发环境日志服务
 */
export function createDevLogger(logDirectory = './logs'): LoggerService {
    return new LoggerService(DEFAULT_DEV_CONFIG, logDirectory);
}

/**
 * 创建生产环境日志服务
 */
export function createProductionLogger(logDirectory = './logs'): LoggerService {
    return new LoggerService(PRODUCTION_CONFIG, logDirectory);
}

/**
 * 根据环境变量创建日志服务
 */
export function createLogger(environment: 'development' | 'production' = 'development', logDirectory = './logs'): LoggerService {
    const config = environment === 'production' ? PRODUCTION_CONFIG : DEFAULT_DEV_CONFIG;
    return new LoggerService(config, logDirectory);
}

/**
 * 使用从配置文件加载的配置创建日志服务
 */
export function createLoggerFromConfig(environment?: string): LoggerService {
    const config = loadLogConfigFromFile(environment);
    return new LoggerService(config);
} 