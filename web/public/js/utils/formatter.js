/* 🔧 DLMM流动性管理系统 - 格式化工具模块 */
/* 提供数字、时间、货币等格式化功能 */

/**
 * 数字格式化工具
 */
export class NumberFormatter {
    /**
     * 格式化数字
     */
    static formatNumber(value, options = {}) {
        const {
            decimals = 2,
            thousandsSeparator = ',',
            decimalSeparator = '.',
            prefix = '',
            suffix = ''
        } = options;

        if (value === null || value === undefined || isNaN(value)) {
            return '--';
        }

        const number = Number(value);
        const parts = number.toFixed(decimals).split('.');

        // 添加千位分隔符
        parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, thousandsSeparator);

        // 组合结果
        let result = parts.join(decimalSeparator);
        return `${prefix}${result}${suffix}`;
    }

    /**
     * 格式化百分比
     */
    static formatPercentage(value, decimals = 2) {
        return this.formatNumber(value, {
            decimals,
            suffix: '%'
        });
    }

    /**
     * 格式化金额
     */
    static formatCurrency(value, currency = 'USD', decimals = 8) {
        const symbols = {
            USD: '$',
            EUR: '€',
            GBP: '£',
            JPY: '¥',
            SOL: '◎'
        };

        return this.formatNumber(value, {
            decimals: currency === 'JPY' ? 0 : decimals,
            prefix: symbols[currency] || currency + ' '
        });
    }

    /**
     * 格式化大数字（K、M、B）
     */
    static formatLargeNumber(value, decimals = 1) {
        if (value === null || value === undefined || isNaN(value)) {
            return '--';
        }

        const number = Math.abs(Number(value));
        const sign = value < 0 ? '-' : '';

        if (number >= 1e12) {
            return sign + this.formatNumber(number / 1e12, { decimals }) + 'T';
        } else if (number >= 1e9) {
            return sign + this.formatNumber(number / 1e9, { decimals }) + 'B';
        } else if (number >= 1e6) {
            return sign + this.formatNumber(number / 1e6, { decimals }) + 'M';
        } else if (number >= 1e3) {
            return sign + this.formatNumber(number / 1e3, { decimals }) + 'K';
        } else {
            return sign + this.formatNumber(number, { decimals });
        }
    }

    /**
     * 格式化代币数量
     */
    static formatTokenAmount(value, symbol = '', decimals = 6) {
        if (value === null || value === undefined || isNaN(value)) {
            return '--';
        }

        const number = Number(value);
        let formattedValue;

        if (number === 0) {
            formattedValue = '0';
        } else if (Math.abs(number) < 0.000001) {
            formattedValue = number.toExponential(2);
        } else if (Math.abs(number) < 1) {
            formattedValue = number.toFixed(decimals).replace(/\.?0+$/, '');
        } else {
            formattedValue = this.formatLargeNumber(number, 2);
        }

        return symbol ? `${formattedValue} ${symbol}` : formattedValue;
    }
}

/**
 * 时间格式化工具
 */
export class DateFormatter {
    /**
     * 格式化相对时间
     */
    static formatRelativeTime(timestamp) {
        // 现在显示具体时间而不是相对时间
        return this.formatDateTime(timestamp);
    }

    /**
     * 格式化日期
     */
    static formatDate(timestamp, format = 'YYYY-MM-DD') {
        const date = new Date(timestamp);

        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        const seconds = String(date.getSeconds()).padStart(2, '0');

        return format
            .replace('YYYY', year)
            .replace('MM', month)
            .replace('DD', day)
            .replace('HH', hours)
            .replace('mm', minutes)
            .replace('ss', seconds);
    }

    /**
     * 格式化时间
     */
    static formatTime(timestamp, includeSeconds = true) {
        const format = includeSeconds ? 'HH:mm:ss' : 'HH:mm';
        return this.formatDate(timestamp, format);
    }

    /**
     * 格式化完整日期时间
     */
    static formatDateTime(timestamp) {
        return this.formatDate(timestamp, 'YYYY-MM-DD HH:mm:ss');
    }

    /**
     * 格式化运行时间
     */
    static formatUptime(milliseconds) {
        const seconds = Math.floor(milliseconds / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);

        if (days > 0) {
            return `${days}天 ${hours % 24}小时`;
        } else if (hours > 0) {
            return `${hours}小时 ${minutes % 60}分钟`;
        } else if (minutes > 0) {
            return `${minutes}分钟 ${seconds % 60}秒`;
        } else {
            return `${seconds}秒`;
        }
    }
}

/**
 * 地址格式化工具
 */
export class AddressFormatter {
    /**
     * 缩短地址显示
     */
    static shortenAddress(address, startLength = 6, endLength = 4) {
        if (!address || address.length <= startLength + endLength) {
            return address;
        }

        return `${address.slice(0, startLength)}...${address.slice(-endLength)}`;
    }

    /**
     * 格式化交易哈希
     */
    static formatTxHash(hash, length = 8) {
        return this.shortenAddress(hash, length, 0);
    }

    /**
     * 验证地址格式
     */
    static isValidSolanaAddress(address) {
        // Solana地址长度为32-44个字符，Base58编码
        const regex = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
        return regex.test(address);
    }
}

/**
 * 状态格式化工具
 */
export class StatusFormatter {
    /**
     * 格式化策略状态
     */
    static formatStrategyStatus(status) {
        const statusMap = {
            idle: { text: '空闲', color: 'secondary', icon: '⏸️' },
            running: { text: '运行中', color: 'success', icon: '▶️' },
            paused: { text: '已暂停', color: 'warning', icon: '⏸️' },
            stopped: { text: '已停止', color: 'error', icon: '⏹️' },
            error: { text: '错误', color: 'error', icon: '❌' }
        };

        return statusMap[status] || { text: status, color: 'secondary', icon: '❓' };
    }

    /**
     * 格式化连接状态
     */
    static formatConnectionStatus(connected) {
        return {
            text: connected ? '已连接' : '未连接',
            color: connected ? 'success' : 'error',
            icon: connected ? '🟢' : '🔴'
        };
    }

    /**
     * 格式化健康状态
     */
    static formatHealthStatus(healthy) {
        return {
            text: healthy ? '健康' : '异常',
            color: healthy ? 'success' : 'error',
            icon: healthy ? '✅' : '⚠️'
        };
    }
}

/**
 * 文件大小格式化工具
 */
export class FileSizeFormatter {
    /**
     * 格式化文件大小
     */
    static formatFileSize(bytes) {
        if (bytes === 0) return '0 B';

        const units = ['B', 'KB', 'MB', 'GB', 'TB'];
        const k = 1024;
        const i = Math.floor(Math.log(bytes) / Math.log(k));

        return NumberFormatter.formatNumber(bytes / Math.pow(k, i), {
            decimals: i === 0 ? 0 : 1
        }) + ' ' + units[i];
    }
}

/**
 * 颜色工具
 */
export class ColorUtils {
    /**
     * 根据值获取变化颜色
     */
    static getChangeColor(value, positive = 'success', negative = 'error', neutral = 'secondary') {
        if (value > 0) return positive;
        if (value < 0) return negative;
        return neutral;
    }

    /**
     * 根据百分比获取颜色
     */
    static getPercentageColor(percentage) {
        if (percentage >= 10) return 'success';
        if (percentage >= 5) return 'info';
        if (percentage >= 0) return 'warning';
        return 'error';
    }

    /**
     * 获取随机颜色
     */
    static getRandomColor() {
        const colors = ['primary', 'success', 'warning', 'error', 'info', 'secondary'];
        return colors[Math.floor(Math.random() * colors.length)];
    }
}

/**
 * 验证工具
 */
export class Validator {
    /**
     * 验证电子邮件
     */
    static isValidEmail(email) {
        const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return regex.test(email);
    }

    /**
     * 验证数字范围
     */
    static isInRange(value, min, max) {
        const num = Number(value);
        return !isNaN(num) && num >= min && num <= max;
    }

    /**
     * 验证正数
     */
    static isPositiveNumber(value) {
        const num = Number(value);
        return !isNaN(num) && num > 0;
    }

    /**
     * 验证非负数
     */
    static isNonNegativeNumber(value) {
        const num = Number(value);
        return !isNaN(num) && num >= 0;
    }
}

/**
 * 统一格式化器
 */
export class Formatter {
    static number = NumberFormatter;
    static date = DateFormatter;
    static address = AddressFormatter;
    static status = StatusFormatter;
    static fileSize = FileSizeFormatter;
    static color = ColorUtils;
    static validator = Validator;

    /**
     * 自动格式化值
     */
    static auto(value, type, options = {}) {
        switch (type) {
            case 'number':
                return this.number.formatNumber(value, options);
            case 'percentage':
                return this.number.formatPercentage(value, options.decimals);
            case 'currency':
                return this.number.formatCurrency(value, options.currency, options.decimals);
            case 'token':
                return this.number.formatTokenAmount(value, options.symbol, options.decimals);
            case 'date':
                return this.date.formatDate(value, options.format);
            case 'time':
                return this.date.formatTime(value, options.includeSeconds);
            case 'relative':
                return this.date.formatRelativeTime(value);
            case 'uptime':
                return this.date.formatUptime(value);
            case 'address':
                return this.address.shortenAddress(value, options.startLength, options.endLength);
            case 'filesize':
                return this.fileSize.formatFileSize(value);
            default:
                return String(value);
        }
    }
}

export default Formatter; 