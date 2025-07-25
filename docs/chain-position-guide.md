# 🔗 连锁头寸使用指南

## 📋 概述

连锁头寸是DLMM流动性管理系统的高级功能，通过创建两个连续的69个bin头寸，形成完整的138个bin范围覆盖，实现更大范围的流动性提供和更高的资金效率。

## 🎯 核心特性

### 基本结构
- **两个连续头寸**：每个头寸覆盖69个bin
- **无缝连接**：头寸间无重叠、无间隙
- **完整覆盖**：总共138个bin的连续价格范围
- **差异化策略**：不同头寸采用不同的资金分配和流动性模式

### 范围计算
- **头寸1 (高价格范围)**: `[activeBin-68, activeBin]` (69个bin)
- **头寸2 (低价格范围)**: `[activeBin-137, activeBin-69]` (69个bin)

### 资金分配策略
- **头寸1**: 20%资金，BidAsk模式
- **头寸2**: 80%资金，分两步创建
  - 基础部分：60%资金，BidAsk模式
  - 追加部分：20%资金，Curve模式

## 🚀 快速开始

### 1. 启动系统

```bash
# 启动DLMM流动性管理系统
cd dlmm-liquidity-manager
npm run dev
```

系统启动后，连锁头寸API将在 `http://localhost:7000/api/chain-position` 可用。

### 2. 健康检查

```bash
curl http://localhost:7000/api/chain-position/health
```

### 3. 计算连锁头寸范围

```bash
# 替换 POOL_ADDRESS 为实际的池地址
curl http://localhost:7000/api/chain-position/calculate-ranges/POOL_ADDRESS
```

示例响应：
```json
{
  "success": true,
  "data": {
    "activeBin": 8388608,
    "position1": {
      "lowerBinId": 8388540,
      "upperBinId": 8388608,
      "binCount": 69
    },
    "position2": {
      "lowerBinId": 8388471,
      "upperBinId": 8388539,
      "binCount": 69
    },
    "total": {
      "lowerBinId": 8388471,
      "upperBinId": 8388608,
      "binCount": 138
    },
    "validated": true
  }
}
```

## 📊 API接口详解

### 1. 创建连锁头寸

**端点**: `POST /api/chain-position/create`

**请求体**:
```json
{
  "poolAddress": "string",     // 池地址 (必需)
  "totalAmount": number,       // 总金额 (必需)
  "slippageBps": number,       // 滑点 (可选，默认100 = 1%)
  "password": "string"         // 钱包密码 (可选，如果钱包已解锁)
}
```

**响应**:
```json
{
  "success": true,
  "data": {
    "position1Address": "string",
    "position2Address": "string", 
    "position1Signature": "string",
    "position2BaseSignature": "string",
    "position2CurveSignature": "string",
    "totalBinRange": [8388471, 8388608],
    "fundingAllocation": {
      "position1": 200000,      // 20%
      "position2Base": 600000,  // 60%
      "position2Curve": 200000  // 20%
    },
    "gasUsed": 150000
  }
}
```

### 2. 计算连锁头寸范围

**端点**: `GET /api/chain-position/calculate-ranges/:poolAddress`

**路径参数**:
- `poolAddress`: 池地址

### 3. 验证连锁头寸状态

**端点**: `GET /api/chain-position/validate/:chainPositionId`

**路径参数**:
- `chainPositionId`: 连锁头寸ID

### 4. 健康检查

**端点**: `GET /api/chain-position/health`

## 🛠️ 使用示例

### JavaScript/TypeScript

```typescript
import axios from 'axios';

const API_BASE = 'http://localhost:7000/api';

// 1. 计算连锁头寸范围
async function calculateChainPositionRanges(poolAddress: string) {
  try {
    const response = await axios.get(
      `${API_BASE}/chain-position/calculate-ranges/${poolAddress}`
    );
    
    console.log('连锁头寸范围:', response.data.data);
    return response.data.data;
  } catch (error) {
    console.error('计算范围失败:', error);
    throw error;
  }
}

// 2. 创建连锁头寸
async function createChainPosition(params: {
  poolAddress: string;
  totalAmount: number;
  password?: string;
}) {
  try {
    const response = await axios.post(
      `${API_BASE}/chain-position/create`,
      params
    );
    
    console.log('连锁头寸创建成功:', response.data.data);
    return response.data.data;
  } catch (error) {
    console.error('创建连锁头寸失败:', error);
    throw error;
  }
}

// 使用示例
async function example() {
  const poolAddress = 'YOUR_POOL_ADDRESS';
  
  // 先计算范围
  const ranges = await calculateChainPositionRanges(poolAddress);
  
  // 创建连锁头寸
  const result = await createChainPosition({
    poolAddress,
    totalAmount: 1000000, // 1M lamports
    password: 'your-wallet-password'
  });
  
  console.log('头寸1地址:', result.position1Address);
  console.log('头寸2地址:', result.position2Address);
}
```

### Python

```python
import requests
import json

API_BASE = 'http://localhost:7000/api'

def calculate_chain_position_ranges(pool_address):
    """计算连锁头寸范围"""
    url = f"{API_BASE}/chain-position/calculate-ranges/{pool_address}"
    
    response = requests.get(url)
    response.raise_for_status()
    
    data = response.json()
    if data['success']:
        return data['data']
    else:
        raise Exception(f"计算范围失败: {data.get('error', '未知错误')}")

def create_chain_position(pool_address, total_amount, password=None):
    """创建连锁头寸"""
    url = f"{API_BASE}/chain-position/create"
    
    payload = {
        'poolAddress': pool_address,
        'totalAmount': total_amount
    }
    
    if password:
        payload['password'] = password
    
    response = requests.post(url, json=payload)
    response.raise_for_status()
    
    data = response.json()
    if data['success']:
        return data['data']
    else:
        raise Exception(f"创建连锁头寸失败: {data.get('error', '未知错误')}")

# 使用示例
if __name__ == "__main__":
    pool_address = "YOUR_POOL_ADDRESS"
    
    # 计算范围
    ranges = calculate_chain_position_ranges(pool_address)
    print(f"连锁头寸范围: {ranges}")
    
    # 创建连锁头寸
    result = create_chain_position(
        pool_address=pool_address,
        total_amount=1000000,  # 1M lamports
        password="your-wallet-password"
    )
    
    print(f"头寸1地址: {result['position1Address']}")
    print(f"头寸2地址: {result['position2Address']}")
```

### cURL

```bash
# 1. 健康检查
curl -X GET "http://localhost:7000/api/chain-position/health"

# 2. 计算连锁头寸范围
curl -X GET "http://localhost:7000/api/chain-position/calculate-ranges/YOUR_POOL_ADDRESS"

# 3. 创建连锁头寸
curl -X POST "http://localhost:7000/api/chain-position/create" \
  -H "Content-Type: application/json" \
  -d '{
    "poolAddress": "YOUR_POOL_ADDRESS",
    "totalAmount": 1000000,
    "slippageBps": 100,
    "password": "your-wallet-password"
  }'

# 4. 验证连锁头寸状态
curl -X GET "http://localhost:7000/api/chain-position/validate/YOUR_CHAIN_POSITION_ID"
```

## 🧪 测试

运行连锁头寸功能测试：

```bash
# 确保系统已启动
npm run dev

# 在另一个终端运行测试
npx ts-node test/chain-position-test.ts
```

测试将验证：
- 连锁头寸健康检查
- 范围计算逻辑
- 创建连锁头寸验证
- 状态验证功能

## ⚠️ 注意事项

### 安全建议
1. **私钥保护**: 确保钱包私钥安全存储
2. **密码管理**: 使用强密码保护钱包
3. **网络安全**: 在生产环境中使用HTTPS
4. **资金安全**: 先用小额资金测试

### 操作建议
1. **测试先行**: 在主网操作前先在测试网验证
2. **范围验证**: 创建前先计算和验证范围
3. **滑点设置**: 根据市场波动性调整滑点
4. **监控管理**: 定期监控头寸状态

### 错误处理
- **钱包未解锁**: 提供密码或先解锁钱包
- **余额不足**: 确保账户有足够的SOL和代币
- **网络错误**: 检查RPC连接状态
- **池地址无效**: 验证池地址格式和存在性

## 📚 相关文档

- [DLMM系统架构文档](./architecture.md)
- [API接口文档](./api.md)
- [开发指南](./development.md)
- [部署手册](./deployment.md)

## 🆘 技术支持

如遇问题，请：
1. 查看日志文件 `logs/operation.log`
2. 检查系统健康状态 `/api/health`
3. 运行测试脚本验证功能
4. 提交Issue或联系开发团队

---

**🎉 享受使用连锁头寸功能！** 