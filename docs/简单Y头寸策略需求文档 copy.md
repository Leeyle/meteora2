# 简单Y头寸策略需求文档

## 1. 项目概述

基于现有DLMM策略框架，开发一个简单Y头寸策略，实现自动化的Y代币流动性头寸管理。该策略专注于Y代币（通常是稳定币）的单币流动性提供，通过智能监控和自动调整来优化收益并控制风险。

### 1.1 项目目标
- 实现完整的策略生命周期管理（创建→启动→监控→暂停→恢复→停止→清理）
- 支持多实例并发运行，实例间互不干扰
- 集成现有API体系，避免重复开发
- 实现统一的重试机制和错误处理
- 提供灵活的策略参数配置

### 1.2 技术框架
- 基于现有策略模块架构文档v1.0.0
- 集成现有API接口文档v2.2
- 兼容现有日志系统
- 支持本地状态持久化

## 2. 功能需求

### 2.1 策略参数配置

#### 2.1.1 用户输入参数
| 参数名称 | 类型 | 范围/限制 | 默认值 | 说明 |
|---------|------|-----------|--------|------|
| 池子地址 | string | 有效的DLMM池地址 | - | 目标流动性池地址 |
| 策略类型 | string | 'simple_y' | 'simple_y' | 当前仅支持简单Y策略 |
| 投入Y代币金额 | number | > 0 | - | 每次创建头寸的Y代币数量 |
| Y头寸bin范围 | number | 1-69 | 69 | 头寸覆盖的bin数量范围 |
| 止损次数 | number | ≥ 0 | 1 | 允许触发止损重建的次数 |
| 止损bin偏移 | number | 1-55 | 35 | 触发止损的bin偏移量 |
| 上涨脱离超时 | number | ≥ 1 | 300 | 上涨脱离头寸范围的超时时间（秒） |
| 下跌超时时间 | number | ≥ 1 | 60 | 触发止损bin后的等待时间（秒） |

#### 2.1.2 系统计算参数
- 头寸范围计算：基于当前活跃bin和bin范围
- 止损触发点：头寸上边界 - 止损bin偏移
- 监控频率：30秒轮询间隔
- 重试配置：基于API类型的差异化配置

### 2.2 策略流程设计

#### 2.2.1 创建阶段
```
用户填写表单 → 参数验证 → 创建策略实例 → 启动策略
```

#### 2.2.2 运行阶段
```
创建Y头寸 → 获取头寸信息 → 开始监控循环
     ↓
[监控活跃bin] ← 30秒轮询
     ↓
判断条件：
├─ 在范围内 → 继续监控
├─ 上涨脱离 → 计时 → 超时 → 重建头寸
└─ 下跌触发 → 计时 → 超时 → 止损处理
```

#### 2.2.3 止损处理逻辑
```
触发止损 → 检查止损次数
├─ 次数 > 0 → 关闭头寸 → 卖出X代币 → 重建Y头寸 → 减少次数
└─ 次数 = 0 → 关闭头寸 → 卖出X代币 → 停止策略
```

### 2.3 API集成需求

#### 2.3.1 核心API列表
| API名称 | 端点 | 用途 | 重试优先级 |
|---------|------|------|-----------|
| Y头寸创建 | POST /api/positions/y/create | 创建Y代币头寸 | 高 |
| 头寸关闭 | POST /api/positions/{address}/close | 关闭头寸 | 高 |
| 头寸信息查询 | GET /api/positions/{address}/info | 获取头寸详情 | 中 |
| 活跃bin查询 | GET /api/pools/{poolAddress}/price-and-bin | 获取实时bin信息 | 中 |
| Jupiter交换 | POST /api/jupiter/swap | X代币换Y代币 | 高 |
| Jupiter报价 | POST /api/jupiter/quote | 获取交换报价 | 低 |

#### 2.3.2 API调用策略
- **高频调用**：活跃bin查询（30秒间隔）
- **关键调用**：头寸创建/关闭、Jupiter交换（需要重试保障）
- **一次性调用**：头寸信息查询（创建后获取一次）

## 3. 技术需求

### 3.1 架构集成

#### 3.1.1 策略框架集成
```typescript
// 基于现有策略架构
class SimpleYStrategy implements StrategyInterface {
  // 策略类型
  public readonly type = StrategyType.SIMPLE_Y;
  
  // 生命周期方法
  async create(config: SimpleYConfig): Promise<string>;
  async start(instanceId: string): Promise<boolean>;
  async pause(instanceId: string): Promise<boolean>;
  async resume(instanceId: string): Promise<boolean>;
  async stop(instanceId: string): Promise<boolean>;
  async cleanup(instanceId: string): Promise<boolean>;
}
```

#### 3.1.2 实例管理
- 支持多实例并发运行（最多10个实例）
- 每个实例独立的参数配置
- 实例间状态完全隔离
- 本地状态持久化和恢复

### 3.2 重试机制设计

#### 3.2.1 统一重试模块
```typescript
interface RetryConfig {
  maxAttempts: number;        // 最大重试次数
  initialDelay: number;       // 初始延迟（毫秒）
  backoffFactor: number;      // 退避因子
  maxDelay: number;          // 最大延迟
  retryCondition: (error: any) => boolean; // 重试条件
}

interface APIRetryMapping {
  [apiName: string]: RetryConfig;
}
```

#### 3.2.2 API重试配置
| API类型 | 最大重试 | 初始延迟 | 退避因子 | 最大延迟 | 特殊条件 |
|---------|----------|----------|----------|----------|----------|
| 头寸创建 | 3次 | 2秒 | 2.0 | 30秒 | 资金不足不重试 |
| 头寸关闭 | 5次 | 1秒 | 1.5 | 15秒 | 网络错误重试 |
| Jupiter交换 | 3次 | 3秒 | 2.0 | 30秒 | 滑点过大重新报价 |
| 数据查询 | 2次 | 1秒 | 1.5 | 5秒 | 所有错误重试 |

### 3.3 日志系统集成

#### 3.3.1 日志分层结构
```
现有日志系统
├── 系统日志层 (SystemLogger)
├── 业务操作日志层 (OperationLogger) 
├── 业务监控日志层 (MonitorLogger)
└── 策略实例日志层 (StrategyLogger) ← 新增层
    ├── 实例操作日志 (instance-{id}-operation.log)
    ├── 实例监控日志 (instance-{id}-monitor.log)
    └── 实例错误日志 (instance-{id}-error.log)
```

#### 3.3.2 日志内容设计
- **操作日志**：策略状态变更、API调用、头寸操作
- **监控日志**：活跃bin监控、条件判断、超时计时
- **错误日志**：API失败、重试记录、异常信息

### 3.4 状态管理

#### 3.4.1 状态持久化
```typescript
interface SimpleYStrategyState {
  // 基础信息
  instanceId: string;
  status: StrategyStatus;
  config: SimpleYConfig;
  
  // 运行时状态
  currentPositionAddress?: string;
  positionRange?: [number, number];
  stopLossCount: number;        // 剩余止损次数
  
  // 计时状态
  outOfRangeStartTime?: number; // 脱离范围开始时间
  stopLossStartTime?: number;   // 止损触发开始时间
  
  // 历史记录
  operationHistory: OperationRecord[];
  performanceMetrics: PerformanceData;
}
```

#### 3.4.2 状态恢复机制
- 系统启动时自动扫描本地状态文件
- 恢复中断的策略实例
- 验证链上头寸状态一致性
- 继续执行监控循环

## 4. 用户界面需求

### 4.1 表单设计

#### 4.1.1 当前表单扩展
- 新增字段：止损次数、上涨脱离超时、下跌超时时间
- 策略类型选择：当前仅显示'简单Y策略'
- 预留扩展接口：支持未来策略类型动态加载

#### 4.1.2 表单验证
```typescript
interface FormValidation {
  poolAddress: (value: string) => boolean;     // 地址格式验证
  yAmount: (value: number) => boolean;         // 最小金额验证
  binRange: (value: number) => boolean;        // 范围1-69验证
  stopLossCount: (value: number) => boolean;   // 非负整数验证
  timeouts: (value: number) => boolean;        // 最小1秒验证
}
```

### 4.2 实例管理界面

#### 4.2.1 实例列表显示
- 实例ID、策略类型、状态
- 当前头寸地址、投入金额
- 运行时长、收益情况
- 操作按钮：暂停/恢复/停止/查看日志

#### 4.2.2 实时状态监控
- 当前活跃bin、头寸范围
- 止损计数器、超时计时器
- 最近操作记录、错误状态

## 5. 性能与扩展性需求

### 5.1 性能要求
- 监控延迟：≤ 60秒（30秒轮询 + 30秒处理时间）
- 并发支持：最多10个策略实例
- 内存使用：每实例 ≤ 10MB
- API响应时间：95%的调用 ≤ 5秒

### 5.2 扩展性设计

#### 5.2.1 策略扩展接口
```typescript
interface StrategyExtension {
  registerStrategy(type: string, implementation: StrategyInterface): void;
  getAvailableStrategies(): StrategyType[];
  createStrategyInstance(type: string, config: any): Promise<string>;
}
```

#### 5.2.2 参数配置扩展
```typescript
interface StrategyConfigSchema {
  strategyType: string;
  requiredFields: ConfigField[];
  optionalFields: ConfigField[];
  validationRules: ValidationRule[];
}
```

## 6. 风险控制需求

### 6.1 资金风险控制
- 最小投入金额限制
- 头寸创建前余额验证
- 滑点保护（交换时）
- 止损次数耗尽时强制停止

### 6.2 技术风险控制
- API调用失败的重试和降级
- 网络异常的自动恢复
- 状态不一致的检测和修复
- 异常情况的自动停止

### 6.3 操作风险控制
- 参数合理性验证
- 危险操作的二次确认
- 关键日志的完整记录
- 紧急停止功能

## 7. 测试需求

### 7.1 单元测试
- 策略逻辑测试
- 参数验证测试
- 状态管理测试
- 重试机制测试

### 7.2 集成测试
- API调用集成测试
- 多实例并发测试
- 状态持久化测试
- 异常恢复测试

### 7.3 端到端测试
- 完整策略流程测试
- 实际资金的小额测试
- 长时间运行稳定性测试
- 异常场景处理测试

## 8. 交付物

### 8.1 核心代码
- SimpleYStrategy 策略实现类
- RetryManager 统一重试模块
- StrategyStateManager 状态管理器
- StrategyLogger 日志管理器

### 8.2 配置文件
- 策略参数配置模板
- API重试配置文件
- 日志配置文件
- 系统默认配置

### 8.3 文档
- 策略使用说明
- API集成文档
- 故障排查指南
- 扩展开发指南

---

**文档版本**: v1.0  
**创建时间**: 2025年1月  
**审核状态**: 待确认 