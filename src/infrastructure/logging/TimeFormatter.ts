/**
 * 时间格式化工具
 * 提供统一的MM/DD HH:MM:SS格式
 */
export class TimeFormatter {
    /**
     * 格式化时间为 MM/DD HH:MM:SS 格式
     * @param date 日期对象，默认当前时间
     * @returns 格式化的时间字符串
     */
    static format(date: Date = new Date()): string {
        // 获取月份和日期，补零
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');

        // 获取时分秒，补零 (24小时制)
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        const seconds = String(date.getSeconds()).padStart(2, '0');

        return `${month}/${day} ${hours}:${minutes}:${seconds}`;
    }

    /**
     * 获取当前时间戳
     * @returns 当前时间戳
     */
    static now(): number {
        return Date.now();
    }

    /**
     * 计算持续时间
     * @param startTime 开始时间戳
     * @param endTime 结束时间戳，默认当前时间
     * @returns 持续时间(毫秒)
     */
    static duration(startTime: number, endTime: number = Date.now()): number {
        return endTime - startTime;
    }

    /**
     * 格式化持续时间为可读字符串
     * @param durationMs 持续时间(毫秒)
     * @returns 格式化的持续时间字符串
     */
    static formatDuration(durationMs: number): string {
        // 处理负数或非法值
        if (durationMs < 0) {
            return '0ms';
        }

        if (durationMs < 1000) {
            return `${durationMs}ms`;
        } else if (durationMs < 60000) {
            return `${(durationMs / 1000).toFixed(2)}s`;
        } else if (durationMs < 3600000) {
            return `${(durationMs / 60000).toFixed(2)}m`;
        } else {
            return `${(durationMs / 3600000).toFixed(2)}h`;
        }
    }
} 