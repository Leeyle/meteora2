# DLMM池子API使用说明

## 概述

本文档描述了DLMM流动性管理系统中的池子相关API接口。这些API提供了获取池子基本信息、实时价格数据、活跃bin信息和流动性分布等功能。

## API端点列表

### 1. 获取池子基本信息
- **端点**: `GET /api/pools/{poolAddress}/info`
- **描述**: 获取指定池子的基本信息，包括代币信息、活跃bin、储备金等
- **缓存时间**: 30秒

### 2. 获取实时价格与活跃bin信息
- **端点**: `GET /api/pools/{poolAddress}/price-and-bin`
- **描述**: 获取池子的实时价格和活跃bin信息（合并API）
- **缓存时间**: 10秒

### 3. 获取流动性分布信息
- **端点**: `GET /api/pools/{poolAddress}/liquidity`
- **描述**: 获取池子的流动性分布情况
- **缓存时间**: 15秒
- **参数**: `range` (可选，默认20，范围5-100)

## 详细API文档

### 1. 池子基本信息API

#### 请求
```
GET /api/pools/{poolAddress}/info
```

#### 路径参数
- `poolAddress` (string, required): 池子地址，长度至少32个字符

#### 响应示例
```json
{
    "success": true,
    "data": {
        "poolAddress": "FtJMkZYEAbv2RWo3Pz8LsRwqNgwTqrHAJpMBMEhDGhKC",
        "tokenX": "So11111111111111111111111111111111111111112",
        "tokenY": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
        "binStep": 25,
        "activeBin": 12345,
        "reserve": {
            "reserveX": "1000000000",
            "reserveY": "2000000000"
        },
        "fees": {
            "totalFeeX": "1000000",
            "totalFeeY": "2000000"
        },
        "protocolFees": {
            "protocolFeeX": "100000",
            "protocolFeeY": "200000"
        },
        "timestamp": 1703000000000
    }
}
```

#### 错误响应
```json
{
    "success": false,
    "error": "无效的池子地址格式",
    "code": "INVALID_POOL_ADDRESS"
}
```

### 2. 实时价格与活跃bin API

#### 请求
```
GET /api/pools/{poolAddress}/price-and-bin
```

#### 路径参数
- `poolAddress` (string, required): 池子地址

#### 响应示例
```json
{
    "success": true,
    "data": {
        "poolAddress": "FtJMkZYEAbv2RWo3Pz8LsRwqNgwTqrHAJpMBMEhDGhKC",
        "activeBin": 12345,
        "activePrice": 1.234567,
        "activeBinInfo": {
            "binId": 12345,
            "reserveX": "1000000000",
            "reserveY": "2000000000",
            "liquidityX": "1000000000",
            "liquidityY": "2000000000"
        },
        "tokenInfo": {
            "tokenX": "So11111111111111111111111111111111111111112",
            "tokenY": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
            "binStep": 25
        },
        "timestamp": 1703000000000
    }
}
```

### 3. 流动性分布API

#### 请求
```
GET /api/pools/{poolAddress}/liquidity?range=20
```

#### 路径参数
- `poolAddress` (string, required): 池子地址

#### 查询参数
- `range` (number, optional): bin范围，默认20，限制在5-100之间

#### 响应示例
```json
{
    "success": true,
    "data": {
        "poolAddress": "FtJMkZYEAbv2RWo3Pz8LsRwqNgwTqrHAJpMBMEhDGhKC",
        "activeBin": 12345,
        "binRange": 20,
        "totalBins": 41,
        "totalLiquidityX": 50000000000,
        "totalLiquidityY": 100000000000,
        "totalLiquidity": 150000000000,
        "liquidityDistribution": [
            {
                "binId": 12325,
                "price": 1.2,
                "liquidityX": 1000000000,
                "liquidityY": 2000000000,
                "totalLiquidity": 3000000000,
                "isActiveBin": false,
                "utilization": 0.75
            },
            // ... 更多bin数据
        ],
        "statistics": {
            "activeBinLiquidity": 5000000000,
            "avgLiquidityPerBin": 3658536585,
            "nonEmptyBins": 25
        },
        "timestamp": 1703000000000
    }
}
```

## 错误代码说明

| 错误代码 | HTTP状态码 | 描述 |
|---------|-----------|------|
| `INVALID_POOL_ADDRESS` | 400 | 池子地址格式无效 |
| `POOL_NOT_FOUND` | 404 | 未找到指定池子信息 |
| `PRICE_DATA_NOT_FOUND` | 404 | 未找到池子价格信息 |
| `LIQUIDITY_DATA_NOT_FOUND` | 404 | 未找到池子流动性信息 |
| `GET_POOL_INFO_ERROR` | 500 | 获取池子信息失败 |
| `GET_PRICE_AND_BIN_ERROR` | 500 | 获取价格和bin信息失败 |
| `GET_LIQUIDITY_ERROR` | 500 | 获取流动性信息失败 |

## 使用示例

### JavaScript/Node.js 示例

```javascript
const API_BASE_URL = 'http://localhost:7000/api';
const poolAddress = 'FtJMkZYEAbv2RWo3Pz8LsRwqNgwTqrHAJpMBMEhDGhKC';

// 获取池子基本信息
async function getPoolInfo() {
    const response = await fetch(`${API_BASE_URL}/pools/${poolAddress}/info`);
    const data = await response.json();
    
    if (data.success) {
        console.log('池子信息:', data.data);
    } else {
        console.error('获取失败:', data.error);
    }
}

// 获取实时价格
async function getPriceAndBin() {
    const response = await fetch(`${API_BASE_URL}/pools/${poolAddress}/price-and-bin`);
    const data = await response.json();
    
    if (data.success) {
        console.log('当前价格:', data.data.activePrice);
        console.log('活跃bin:', data.data.activeBin);
    }
}

// 获取流动性分布
async function getLiquidity() {
    const response = await fetch(`${API_BASE_URL}/pools/${poolAddress}/liquidity?range=10`);
    const data = await response.json();
    
    if (data.success) {
        console.log('总流动性:', data.data.totalLiquidity);
        console.log('活跃bin流动性:', data.data.statistics.activeBinLiquidity);
    }
}
```

### cURL 示例

```bash
# 获取池子基本信息
curl -X GET "http://localhost:7000/api/pools/FtJMkZYEAbv2RWo3Pz8LsRwqNgwTqrHAJpMBMEhDGhKC/info"

# 获取实时价格与活跃bin
curl -X GET "http://localhost:7000/api/pools/FtJMkZYEAbv2RWo3Pz8LsRwqNgwTqrHAJpMBMEhDGhKC/price-and-bin"

# 获取流动性分布 (范围15)
curl -X GET "http://localhost:7000/api/pools/FtJMkZYEAbv2RWo3Pz8LsRwqNgwTqrHAJpMBMEhDGhKC/liquidity?range=15"
```

## 性能优化

### 缓存策略
- **池子信息**: 30秒缓存，适用于相对稳定的基本信息
- **价格数据**: 10秒缓存，保证价格信息的实时性
- **流动性数据**: 15秒缓存，平衡实时性和性能

### 并发处理
- 实时价格API使用 `Promise.all` 并行获取多个数据源
- 流动性分布API批量处理bin信息，提高效率

### 请求优化建议
1. **合理设置请求频率**: 遵循缓存时间，避免过于频繁的请求
2. **使用合适的范围参数**: 流动性API的range参数影响响应时间
3. **错误处理**: 实现适当的重试逻辑和错误处理

## 监控和日志

### 业务日志
每个API调用都会记录业务操作日志，包含:
- 池子地址（前8位+...）
- 请求参数
- 响应时间
- 缓存命中情况

### 错误日志
所有错误都会被记录，包含:
- 错误类型和消息
- 堆栈跟踪
- 请求上下文

### 监控指标
- API响应时间
- 错误率统计
- 缓存命中率
- 请求频率

## 测试

使用提供的测试脚本验证API功能：

```bash
cd dlmm-liquidity-manager
node test/test-pool-apis.js
```

测试脚本会验证：
1. 池子基本信息API
2. 实时价格与活跃bin API  
3. 流动性分布API
4. 错误处理机制
5. 缓存功能

## 注意事项

1. **池子地址有效性**: 确保使用有效的DLMM池子地址
2. **服务依赖**: API依赖MeteoraService，需要确保服务正常运行
3. **网络延迟**: Solana网络状况可能影响响应时间
4. **数据精度**: 价格和流动性数据可能存在精度限制
5. **频率限制**: API服务器有全局频率限制（1000请求/15分钟）

## 故障排除

### 常见问题

1. **池子未找到**: 检查池子地址是否正确
2. **服务超时**: 检查MeteoraService是否正常运行
3. **缓存问题**: 重启服务清理缓存
4. **网络错误**: 检查Solana RPC连接

### 调试建议

1. 查看服务器日志: `tail -f logs/system.log`
2. 检查服务状态: `GET /api/health`
3. 验证池子存在: 使用Solana Explorer确认池子地址
4. 测试网络连接: 检查RPC端点响应

## 更新历史

- v1.0.0: 初始版本，实现3个基础池子API
- 后续版本将根据需求添加更多功能 