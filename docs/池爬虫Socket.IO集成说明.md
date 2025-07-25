# 池爬虫Socket.IO集成说明

## 概述

池爬虫监控功能已成功集成到系统中，**完全取代了原有的实时监控模块**。用户现在点击导航栏的"池爬虫监控"即可访问所有池爬虫相关功能。

## 集成架构

### 1. 后端Socket.IO扩展

扩展了 `src/server/socketio-server.ts`：
- 新增 `pool-crawler` 房间管理
- 添加订阅/取消订阅事件处理
- 支持5个核心事件的实时推送

### 2. 前端替代结构

```
主页面 (index.html)
├── 池爬虫监控页面 (monitor) [完全取代原有实时监控]
    └── PoolCrawlerMonitor组件
```

### 3. 文件结构

```
dlmm-liquidity-manager/
├── src/server/
│   └── socketio-server.ts (已扩展)
├── web/public/
│   ├── index.html (已修改导航和页面标题)
│   ├── css/
│   │   └── pool-crawler-monitor.css
│   └── js/
│       ├── app.js (已修改页面加载逻辑)
│       └── components/pool-crawler/
│           └── PoolCrawlerMonitor.js
```

## 使用方法

### 1. 访问池爬虫监控
1. 在主页面导航栏点击"池爬虫监控"
2. 系统将直接加载池爬虫监控组件
3. 自动连接Socket.IO并显示实时数据

### 2. 功能特性
- **实时状态监控**：显示爬虫运行状态、发现池数量、合格池数量
- **池数据表格**：实时显示发现的池和合格池信息
- **过滤器配置**：支持TVL、交易量、APR等过滤条件
- **爬虫控制**：启动/停止爬虫功能
- **通知系统**：实时错误和状态通知

## Socket.IO事件

### 客户端 → 服务器

```javascript
// 订阅池爬虫监控
socket.emit('subscribe:pool-crawler', {
    clientId: 'pool-crawler-monitor-xxx',
    timestamp: Date.now()
});

// 启动爬虫
socket.emit('pool-crawler.start', {
    timestamp: Date.now()
});

// 停止爬虫
socket.emit('pool-crawler.stop', {
    timestamp: Date.now()
});

// 刷新数据
socket.emit('pool-crawler.refresh', {
    timestamp: Date.now()
});

// 更新过滤器
socket.emit('pool-crawler.filters.update', {
    filters: { minTvl: 1000, maxTvl: 1000000 },
    timestamp: Date.now()
});
```

### 服务器 → 客户端

```javascript
// 订阅确认
socket.on('subscribed:pool-crawler', (data) => {
    console.log('池爬虫监控订阅成功', data);
});

// 爬虫状态更新
socket.on('pool-crawler.status.update', (data) => {
    // data: { isRunning, poolsDiscovered, qualifiedPools, nextCrawlTime, status }
});

// 池发现通知
socket.on('pool-crawler.pools.discovered', (data) => {
    // data: { pools: Array<PoolInfo>, timestamp }
});

// 合格池通知
socket.on('pool-crawler.pools.qualified', (data) => {
    // data: { pools: Array<QualifiedPool>, timestamp }
});

// 过滤器更新
socket.on('pool-crawler.filters.updated', (data) => {
    // data: { filters: FilterConfig, timestamp }
});

// 错误通知
socket.on('pool-crawler.error', (data) => {
    // data: { message: string, type: string, timestamp }
});
```

## 数据结构

### 池信息 (PoolInfo)
```typescript
interface PoolInfo {
    address: string;           // 池地址
    tokenPair: string;         // 代币对
    tvl: number;              // 总锁定价值
    volume24h: number;        // 24小时交易量
    apr: number;              // 年化收益率
    discoveredAt: number;     // 发现时间戳
}
```

### 合格池 (QualifiedPool)
```typescript
interface QualifiedPool extends PoolInfo {
    matchedConditions: string[];  // 匹配的条件
    score: number;               // 评分
    recommendation: string;      // 推荐理由
}
```

### 过滤器配置 (FilterConfig)
```typescript
interface FilterConfig {
    minTvl?: number;         // 最小TVL
    maxTvl?: number;         // 最大TVL
    minVolume?: number;      // 最小24h交易量
    minApr?: number;         // 最小APR
    tokenBlacklist?: string[]; // 代币黑名单
}
```

## 集成测试

### 1. 基本连接测试
```javascript
// 在浏览器控制台测试
const monitor = window.poolCrawlerMonitor;
console.log('连接状态:', monitor.isConnected);
console.log('监控器状态:', monitor.isInitialized);
```

### 2. 事件推送测试
```javascript
// 手动触发事件测试
window.poolCrawlerMonitor.socket.emit('pool-crawler.refresh', {
    timestamp: Date.now()
});
```

### 3. UI更新测试
```javascript
// 模拟数据更新
window.poolCrawlerMonitor.handleStatusUpdate({
    isRunning: true,
    poolsDiscovered: 10,
    qualifiedPools: 3,
    nextCrawlTime: Date.now() + 180000
});
```

## 自定义配置

### 1. 连接配置
```javascript
// 在 PoolCrawlerMonitor.js 中可配置
const config = {
    socketUrl: 'ws://localhost:3000',
    reconnectInterval: 3000,
    maxReconnectAttempts: 5
};
```

### 2. UI配置
```css
/* 在 pool-crawler-monitor.css 中自定义样式 */
.pool-crawler-monitor {
    --primary-color: #00d4aa;
    --background-color: #1a1a1a;
    --text-color: #ffffff;
}
```

## 与现有系统集成

### 1. 策略创建集成
池爬虫监控中的"创建策略"按钮可以集成到现有的策略创建流程：

```javascript
// 在 PoolCrawlerMonitor.js 中
createStrategy(poolAddress) {
    // 跳转到连锁头寸策略页面
    window.dlmmApp.appManager.navigateToPage('chain-position');
    
    // 预填充池地址
    // 这里可以集成到现有的策略创建器中
}
```

### 2. 数据共享
监控数据可以与其他组件共享：

```javascript
// 访问全局监控实例
const poolData = window.poolCrawlerMonitor.discoveredPools;
const qualifiedPools = window.poolCrawlerMonitor.qualifiedPools;
```

## 注意事项

1. **Socket.IO版本兼容性**：确保客户端和服务器使用相同版本的Socket.IO
2. **内存管理**：池数据会积累，需要定期清理或设置最大数量限制
3. **错误处理**：网络断开时会自动重连，但需要处理长时间断开的情况
4. **性能优化**：大量池数据可能影响UI性能，考虑使用虚拟滚动
5. **权限控制**：考虑为不同用户设置不同的监控权限

## 故障排除

### 1. 连接失败
- 检查Socket.IO服务器是否正常运行
- 验证端口和URL配置
- 查看浏览器控制台错误信息

### 2. 数据不更新
- 确认后端池爬虫服务正常运行
- 检查EventBus事件发布是否正常
- 验证Socket.IO事件监听是否正确

### 3. UI显示问题
- 检查CSS文件是否正确加载
- 验证JavaScript组件是否正确初始化
- 查看浏览器开发者工具的错误信息

## 重要变更说明

### ⚠️ 替代原有监控模块
- **池爬虫监控现已完全取代原有的实时监控模块**
- 导航栏中的"实时监控"已更名为"池爬虫监控"
- 移除了原有的系统监控、钱包监控、头寸监控等功能
- 专注于池发现、过滤和推荐功能

### 🔄 架构简化
- 移除了标签页结构，池爬虫监控直接占用整个页面
- 移除了不必要的MonitorManager、MonitorCore等组件引用
- 简化了加载逻辑和用户界面

---

## 完成状态

✅ **后端Socket.IO扩展** - 已完成
✅ **前端监控组件** - 已完成  
✅ **主页面集成** - 已完成
✅ **原有监控模块替代** - 已完成
✅ **CSS样式优化** - 已完成
✅ **事件处理机制** - 已完成
✅ **文档更新** - 已完成

池爬虫监控功能现已完全取代原有的实时监控系统，用户可以通过导航栏的"池爬虫监控"直接访问所有池爬虫相关功能。 