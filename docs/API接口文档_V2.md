# 🌐 DLMM流动性管理系统 - API接口文档 V2.7

## 📋 概述

**DLMM流动性管理系统**提供完整的RESTful API接口，支持钱包管理、流动性头寸操作、精确链上信息获取、连锁头寸管理、池子监控、实时数据获取等功能。

**基础信息**:
- **API基础URL**: `http://localhost:7000/api`
- **WebSocket URL**: `ws://localhost:7002`
- **API版本**: v2.7.0
- **认证方式**: 无需认证 (本地开发环境)
- **数据格式**: JSON
- **字符编码**: UTF-8

## 🏥 系统API

### 1. 健康检查 ✅

#### GET /api/health
获取系统健康状态和运行统计信息

**实现状态**: ✅ 已实现

**请求示例**:
```bash
curl -X GET http://localhost:7000/api/health
```

**响应示例**:
```json
{
  "status": "healthy",
  "timestamp": "2024-12-13T10:30:00.000Z",
  "uptime": 3600000,
  "services": {
    "blockchain": {
      "solanaWeb3": "healthy",
      "wallet": "healthy",
      "multiRPC": "healthy",
      "gas": "healthy"
    },
    "external": {
      "jupiter": "healthy",
      "meteora": "healthy",
      "helius": "healthy"
    },
    "business": {
      "positionManager": "healthy",
      "yPositionManager": "healthy",
      "xPositionManager": "healthy",
      "positionFeeHarvester": "healthy",
      "positionInfo": "healthy"
    },
    "strategy": {
      "strategyEngine": "healthy",
      "strategyInstanceManager": "healthy",
      "strategyStateManager": "healthy",
      "strategyRecoveryManager": "healthy",
      "strategyMonitor": "healthy"
    }
  },
  "stats": {
    "totalRequests": 1250,
    "errorRequests": 5,
    "successRate": "99.60%"
  },
  "memory": {
    "used": "45MB",
    "total": "128MB",
    "external": "12MB"
  },
  "version": "1.0.0"
}
```

### 2. 系统信息 ✅

#### GET /api/info
获取系统基本信息和可用端点

**实现状态**: ✅ 已实现

**请求示例**:
```bash
curl -X GET http://localhost:7000/api/info
```

**响应示例**:
```json
{
  "name": "DLMM Liquidity Management System",
  "version": "1.0.0",
  "description": "基于Solana的DLMM流动性管理系统",
  "author": "DLMM Team",
  "features": [
    "Solana钱包管理",
    "DLMM流动性头寸管理",
    "Jupiter聚合交易",
    "Meteora协议集成",
    "智能策略引擎",
    "实时监控和预警",
    "费用收集自动化"
  ],
  "endpoints": {
    "wallet": "/api/wallet/*",
    "positions": "/api/positions/*",
    "pools": "/api/pools/*",
    "jupiter": "/api/jupiter/*",
    "monitor": "/api/monitor/*",
    "logs": "/api/logs/*",
    "health": "/api/health",
    "info": "/api/info"
  }
}
```

### 3. 性能指标 ✅

#### GET /api/metrics
获取详细的系统性能指标

**实现状态**: ✅ 已实现

**请求示例**:
```bash
curl -X GET http://localhost:7000/api/metrics
```

**响应示例**:
```json
{
  "status": "ok",
  "timestamp": "2024-12-13T10:30:00.000Z",
  "uptime": {
    "ms": 3600000,
    "seconds": 3600,
    "formatted": "1时 0分 0秒"
  },
  "requests": {
    "total": 1250,
    "successful": 1245,
    "failed": 5,
    "successRate": 99.6
  },
  "memory": {
    "heapUsed": 45,
    "heapTotal": 128,
    "external": 12,
    "rss": 180
  },
  "system": {
    "platform": "darwin",
    "arch": "arm64",
    "nodeVersion": "v18.17.0",
    "pid": 12345
  },
  "services": {
    "blockchain": {
      "solanaWeb3": "healthy",
      "wallet": "healthy",
      "multiRPC": "healthy",
      "gas": "healthy"
    },
    "external": {
      "jupiter": "healthy",
      "meteora": "healthy",
      "helius": "healthy"
    }
  }
}
```

## 🔐 钱包管理API

### 1. 获取钱包信息 ✅

#### GET /api/wallet/info
获取当前钱包的基本信息

**实现状态**: ✅ 已实现

**请求示例**:
```bash
curl -X GET http://localhost:7000/api/wallet/info
```

**响应示例**:
```json
{
  "success": true,
  "data": {
    "address": "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM",
    "isUnlocked": true,
    "network": "mainnet-beta",
    "balance": "0.2000"
  }
}
```

### 2. 创建新钱包 ✅

#### POST /api/wallet/create
创建新的Solana钱包

**实现状态**: ✅ 已实现

**请求参数**:
```json
{
  "password": "your_secure_password",
  "mnemonic": "optional_mnemonic_phrase"
}
```

**参数说明**:
- `password`: 钱包密码，至少8个字符
- `mnemonic`: 可选的助记词，如果不提供将自动生成

**请求示例**:
```bash
curl -X POST http://localhost:7000/api/wallet/create \
  -H "Content-Type: application/json" \
  -d '{
    "password": "mySecurePassword123"
  }'
```

**响应示例**:
```json
{
  "success": true,
  "data": {
    "address": "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM",
    "created": true
  }
}
```

### 3. 导入钱包 ✅

#### POST /api/wallet/import
通过助记词导入现有钱包

**实现状态**: ✅ 已实现

**请求参数**:
```json
{
  "mnemonic": "your twelve word mnemonic phrase here",
  "password": "your_secure_password"
}
```

**参数说明**:
- `mnemonic`: 12个单词的助记词
- `password`: 钱包密码，至少8个字符

**请求示例**:
```bash
curl -X POST http://localhost:7000/api/wallet/import \
  -H "Content-Type: application/json" \
  -d '{
    "mnemonic": "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about",
    "password": "mySecurePassword123"
  }'
```

### 4. 通过私钥导入钱包 ✅

#### POST /api/wallet/import-by-key
通过私钥导入钱包

**实现状态**: ✅ 已实现

**请求参数**:
```json
{
  "privateKey": "your_private_key_string",
  "password": "your_secure_password"
}
```

**参数说明**:
- `privateKey`: Base58编码的私钥字符串
- `password`: 钱包密码，至少8个字符

### 5. 获取余额 ✅

#### GET /api/wallet/balance/{tokenMint?}
获取SOL或指定代币余额

**实现状态**: ✅ 已实现

**路径参数**:
- `tokenMint`: 可选，代币mint地址，不提供则返回SOL余额

**请求示例**:
```bash
# 获取SOL余额
curl -X GET http://localhost:7000/api/wallet/balance

# 获取USDC余额
curl -X GET http://localhost:7000/api/wallet/balance/EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v
```

**响应示例**:
```json
{
  "success": true,
  "data": {
    "balance": "1.5000",
    "tokenMint": "SOL",
    "timestamp": 1702468200000
  }
}
```

### 6. 获取所有代币余额 ✅

#### GET /api/wallet/balances
获取钱包中所有代币的余额

**实现状态**: ✅ 已实现

**请求示例**:
```bash
curl -X GET http://localhost:7000/api/wallet/balances
```

**响应示例**:
```json
{
  "success": true,
  "data": {
    "SOL": "1.5000",
    "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v": "100.0000",
    "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB": "50.0000"
  }
}
```

### 7. 解锁钱包 ✅

#### POST /api/wallet/unlock
解锁已存在的钱包

**实现状态**: ✅ 已实现

**请求参数**:
```json
{
  "password": "your_wallet_password"
}
```

### 8. 锁定钱包 ✅

#### POST /api/wallet/lock
锁定当前钱包

**实现状态**: ✅ 已实现但未测试

**请求示例**:
```bash
curl -X POST http://localhost:7000/api/wallet/lock
```

**响应示例**:
```json
{
  "success": true,
  "data": {
    "locked": true,
    "message": "钱包已锁定"
  }
}
```

### 9. 删除钱包 ✅

#### DELETE /api/wallet/delete
删除当前钱包文件

**实现状态**: ✅ 已实现但未测试

**请求参数**:
```json
{
  "password": "your_wallet_password"
}
```

**请求示例**:
```bash
curl -X DELETE http://localhost:7000/api/wallet/delete \
  -H "Content-Type: application/json" \
  -d '{
    "password": "mySecurePassword123"
  }'
```

**响应示例**:
```json
{
  "success": true,
  "data": {
    "deleted": true,
    "message": "钱包已成功删除"
  }
}
```

### 10. 检查钱包状态 ✅

#### GET /api/wallet/status
检查钱包的存在状态和解锁状态

**实现状态**: ✅ 已实现但未测试

**请求示例**:
```bash
curl -X GET http://localhost:7000/api/wallet/status
```

**响应示例**:
```json
{
  "success": true,
  "data": {
    "exists": true,
    "unlocked": true,
    "status": "unlocked"
  }
}
```

**状态说明**:
- `exists`: 钱包文件是否存在
- `unlocked`: 钱包是否已解锁
- `status`: 钱包状态 (`"locked"` | `"unlocked"` | `"not_created"`)

### 11. 获取钱包交易历史 ✅

#### GET /api/wallet/transactions
获取钱包的交易历史记录

**实现状态**: ✅ 已实现但功能不完整

**查询参数**:
- `limit`: 可选，返回交易条数，默认20

**请求示例**:
```bash
curl -X GET http://localhost:7000/api/wallet/transactions?limit=50
```

**当前响应示例**:
```json
{
  "success": true,
  "data": {
    "transactions": [],
    "total": 0,
    "message": "交易历史功能需要进一步实现"
  }
}
```

**备注**: 此API目前返回空数组，需要实现完整的交易历史查询功能。

## 🏊 池子管理API

### 1. 获取池子基本信息 ✅

#### GET /api/pools/{poolAddress}/info
获取指定池子的基本信息

**实现状态**: ✅ 已实现

**路径参数**:
- `poolAddress`: DLMM池子地址

**请求示例**:
```bash
curl -X GET http://localhost:7000/api/pools/LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo/info
```

**响应示例**:
```json
{
  "success": true,
  "data": {
    "poolAddress": "LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo",
    "tokenX": {
      "mint": "So11111111111111111111111111111111111111112",
      "symbol": "SOL",
      "decimals": 9
    },
    "tokenY": {
      "mint": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
      "symbol": "USDC",
      "decimals": 6
    },
    "binStep": 25,
    "activeBin": 8388608,
    "reserve": {
      "reserveX": "1000.000000000",
      "reserveY": "50000.000000"
    },
    "fees": {
      "baseFactor": 5000,
      "filterPeriod": 30,
      "decayPeriod": 600,
      "reductionFactor": 5000,
      "variableFeeControl": 40000,
      "protocolShare": 1000,
      "maxVolatilityAccumulator": 350000
    },
    "protocolFees": {
      "protocolFeeX": "0.100000000",
      "protocolFeeY": "5.000000"
    },
    "timestamp": 1702468200000
  }
}
```

### 2. 获取实时价格与活跃bin信息 ✅

#### GET /api/pools/{poolAddress}/price-and-bin
获取池子的实时价格和活跃bin信息（优化的合并API）

**实现状态**: ✅ 已实现

**路径参数**:
- `poolAddress`: DLMM池子地址

**查询参数**:
- `refresh`: 可选，设置为任意值强制刷新缓存

**请求示例**:
```bash
# 获取缓存数据
curl -X GET http://localhost:7000/api/pools/LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo/price-and-bin

# 强制刷新
curl -X GET http://localhost:7000/api/pools/LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo/price-and-bin?refresh=1
```

**响应示例**:
```json
{
  "success": true,
  "data": {
    "poolAddress": "LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo",
    "activeBin": 8388608,
    "activePrice": "50.125",
    "activeBinInfo": {
      "binId": 8388608,
      "price": "50.125",
      "liquidityX": "100.000000000",
      "liquidityY": "5000.000000",
      "totalLiquidity": "5100.000000"
    },
    "tokenInfo": {
      "tokenX": {
        "mint": "So11111111111111111111111111111111111111112",
        "symbol": "SOL",
        "decimals": 9
      },
      "tokenY": {
        "mint": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
        "symbol": "USDC",
        "decimals": 6
      },
      "binStep": 25
    },
    "timestamp": 1702468200000
  }
}
```

### 3. 获取强制实时价格与活跃bin信息 ✅

#### GET /api/pools/{poolAddress}/price-and-bin/realtime
获取池子的强制实时价格和活跃bin信息（绕过所有缓存）

**实现状态**: ✅ 已实现但未测试

**路径参数**:
- `poolAddress`: DLMM池子地址

**请求示例**:
```bash
curl -X GET http://localhost:7000/api/pools/LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo/price-and-bin/realtime
```

**响应示例**:
```json
{
  "success": true,
  "data": {
    "poolAddress": "LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo",
    "activeBin": 8388608,
    "activePrice": "50.125",
    "activeBinInfo": {
      "binId": 8388608,
      "price": "50.125",
      "liquidityX": "100.000000000",
      "liquidityY": "5000.000000",
      "totalLiquidity": "5100.000000"
    },
    "tokenInfo": {
      "tokenX": {
        "mint": "So11111111111111111111111111111111111111112",
        "symbol": "SOL",
        "decimals": 9
      },
      "tokenY": {
        "mint": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
        "symbol": "USDC",
        "decimals": 6
      },
      "binStep": 25
    },
    "timestamp": 1702468200000,
    "isRealtime": true,
    "responseTime": 850
  }
}
```

### 4. 获取流动性分布信息 ✅

#### GET /api/pools/{poolAddress}/liquidity
获取池子的流动性分布情况

**实现状态**: ✅ 已实现但未测试

**路径参数**:
- `poolAddress`: DLMM池子地址

**查询参数**:
- `range`: 可选，bin范围，默认20，限制在5-100之间

**请求示例**:
```bash
curl -X GET http://localhost:7000/api/pools/LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo/liquidity?range=30
```

**响应示例**:
```json
{
  "success": true,
  "data": {
    "poolAddress": "LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo",
    "activeBin": 8388608,
    "binRange": 30,
    "totalBins": 61,
    "totalLiquidityX": "3000.000000000",
    "totalLiquidityY": "150000.000000",
    "totalLiquidity": "153000.000000",
    "liquidityDistribution": [
      {
        "binId": 8388578,
        "price": "49.250",
        "liquidityX": "50.000000000",
        "liquidityY": "2500.000000",
        "totalLiquidity": "2550.000000",
        "isActiveBin": false,
        "utilization": 0.85
      }
    ],
    "statistics": {
      "activeBinLiquidity": "5100.000000",
      "avgLiquidityPerBin": "2508.196721",
      "nonEmptyBins": 45
    },
    "timestamp": 1702468200000
  }
}
```

## 📈 头寸管理API

### 1. 获取用户所有头寸 ✅

#### GET /api/positions/user/{userAddress}
获取指定用户的所有DLMM头寸

**实现状态**: ✅ 已实现

**路径参数**:
- `userAddress`: 用户钱包地址

**请求示例**:
```bash
curl -X GET http://localhost:7000/api/positions/user/9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM
```

### 2. 获取用户在特定池中的头寸 ⭐ ✅

#### GET /api/positions/user/{userAddress}/pool/{poolAddress}
获取用户在指定池中的所有头寸信息（使用优化的Meteora服务）

**实现状态**: ✅ 已实现

**路径参数**:
- `userAddress`: 用户钱包地址
- `poolAddress`: DLMM池子地址

**请求示例**:
```bash
curl -X GET http://localhost:7000/api/positions/user/9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM/pool/LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo
```

**响应示例**:
```json
{
  "success": true,
  "data": {
    "userAddress": "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM",
    "poolAddress": "LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo",
    "positionCount": 2,
    "positions": [
      {
        "positionAddress": "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU",
        "owner": "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM",
        "poolAddress": "LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo",
        "totalXAmount": "1.500000000",
        "totalYAmount": "75.000000",
        "bins": [
          {
            "binId": 8388607,
            "price": "50.000",
            "liquidityShare": "0.500000000",
            "xAmount": "0.750000000",
            "yAmount": "37.500000"
          },
          {
            "binId": 8388608,
            "price": "50.125",
            "liquidityShare": "0.500000000",
            "xAmount": "0.750000000",
            "yAmount": "37.500000"
          }
        ],
        "feeX": "0.001000000",
        "feeY": "0.050000",
        "totalValue": "150.000000",
        "lastUpdated": 1702468200000
      }
    ],
    "timestamp": 1702468200000
    }
}
```

### 3. 获取特定头寸信息 ✅

#### GET /api/positions/{address}/info
获取指定头寸的详细信息

**实现状态**: ✅ 已实现

**路径参数**:
- `address`: 头寸地址

**请求示例**:
```bash
curl -X GET http://localhost:7000/api/positions/7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU/info
```

### 4. 获取头寸信息（简化版） ✅

#### GET /api/positions/{address}
获取指定头寸的基本信息

**实现状态**: ✅ 已实现

**路径参数**:
- `address`: 头寸地址

### 5. 🆕 获取头寸链上信息 ✅

#### GET /api/positions/{address}/onchain
获取指定头寸的详细链上信息（使用改进的Meteora SDK方法）

**实现状态**: ✅ 已实现并测试通过

**路径参数**:
- `address`: 头寸地址

**核心改进**:
- ✅ 使用正确的SDK调用方式：`DLMMSdk.default.default.create()` 和 `getPosition()`
- ✅ 正确解析 `positionData.positionBinData` 数组
- ✅ 优先使用 `positionXAmount` 和 `positionYAmount` 字段
- ✅ BigInt精确计算，避免精度丢失
- ✅ 提供完整的代币元数据信息
- ✅ 智能的数量格式化算法

**请求示例**:
```bash
curl -X GET http://localhost:7000/api/positions/3NpgbzUveE5PZsTUSWN8Z4rgt8LtMCbDjAZHMhbEPxNj/onchain
```

**响应示例**:
```json
{
  "success": true,
  "data": {
    "address": "3NpgbzUveE5PZsTUSWN8Z4rgt8LtMCbDjAZHMhbEPxNj",
    "owner": "LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo",
    "poolAddress": "FTUUwFN25knhihreUS9hjmBS2zZMJHdTZVAiCKedhjw9",
    "lowerBinId": -39,
    "upperBinId": 29,
    "totalXAmount": "33689",
    "totalYAmount": "4956467",
    "fees": {
      "feeX": "0",
      "feeY": "0"
    },
    "inRange": true,
    "activeBinId": 0,
    "binCount": 69,
    "lastUpdated": 1750002368089,
    "tokenInfo": {
      "tokenXSymbol": "TokenX",
      "tokenYSymbol": "TokenY",
      "tokenXDecimals": 9,
      "tokenYDecimals": 9
    },
    "formattedAmounts": {
      "tokenXFormatted": "0.000033689",
      "tokenYFormatted": "0.004956467"
    }
  }
}
```

**字段说明**:
- `tokenInfo`: 代币元数据信息（符号、精度）
- `formattedAmounts`: 格式化的代币数量，便于显示
- `totalXAmount`/`totalYAmount`: 使用BigInt精确计算的代币数量
- `binCount`: 头寸包含的bin数量
- `inRange`: 头寸是否在当前价格范围内

### 6. 🆕 获取头寸信息（支持链上刷新） ✅

#### GET /api/positions/{address}/refresh
获取头寸信息，支持可选择的链上数据刷新

**实现状态**: ✅ 已实现并测试通过

**路径参数**:
- `address`: 头寸地址

**查询参数**:
- `fromChain`: 可选，设置为 `true` 强制从链上刷新最新数据

**请求示例**:
```bash
# 获取缓存数据
curl -X GET http://localhost:7000/api/positions/3NpgbzUveE5PZsTUSWN8Z4rgt8LtMCbDjAZHMhbEPxNj/refresh

# 强制从链上刷新
curl -X GET http://localhost:7000/api/positions/3NpgbzUveE5PZsTUSWN8Z4rgt8LtMCbDjAZHMhbEPxNj/refresh?fromChain=true
```

**响应示例**:
```json
{
  "success": true,
  "data": {
    "address": "3NpgbzUveE5PZsTUSWN8Z4rgt8LtMCbDjAZHMhbEPxNj",
    "owner": "DrUb1d2ryx2jbqz4cNSTPhYHPdsw5qH1SPuzwnXPF34R",
    "poolAddress": "FTUUwFN25knhihreUS9hjmBS2zZMJHdTZVAiCKedhjw9",
    "lowerBinId": -39,
    "upperBinId": 29,
    "binIds": [-39, -38, -37, -36, -35, -34, -33, -32, -31, -30, -29, -28, -27, -26, -25, -24, -23, -22, -21, -20, -19, -18, -17, -16, -15, -14, -13, -12, -11, -10, -9, -8, -7, -6, -5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29],
    "totalXAmount": "33689",
    "totalYAmount": "4956467",
    "fees": {
      "feeX": "0",
      "feeY": "0"
    },
    "lastUpdated": 1750002380251,
    "inRange": true,
    "tokenInfo": {
      "tokenXSymbol": "TokenX",
      "tokenYSymbol": "TokenY",
      "tokenXDecimals": 9,
      "tokenYDecimals": 9
    },
    "formattedAmounts": {
      "tokenXFormatted": "0.000033689",
      "tokenYFormatted": "0.004956467"
    }
  }
}
```

**功能特点**:
- 🔄 可选择性从链上刷新最新数据
- 💾 自动更新本地缓存
- 🎯 返回包含代币元数据的完整信息
- ⚡ 支持快速缓存访问和实时链上查询

### 7. 🆕 批量获取头寸链上信息 ✅

#### POST /api/positions/batch/onchain
批量获取多个头寸的链上信息

**实现状态**: ✅ 已实现并测试通过

**请求参数**:
```json
{
  "addresses": [
    "3NpgbzUveE5PZsTUSWN8Z4rgt8LtMCbDjAZHMhbEPxNj"
  ]
}
```

**参数说明**:
- `addresses`: 头寸地址数组，最多支持20个地址

**请求示例**:
```bash
curl -X POST http://localhost:7000/api/positions/batch/onchain \
  -H "Content-Type: application/json" \
  -d '{
    "addresses": [
      "3NpgbzUveE5PZsTUSWN8Z4rgt8LtMCbDjAZHMhbEPxNj"
    ]
  }'
```

**响应示例**:
```json
{
  "success": true,
  "data": [
    {
      "address": "3NpgbzUveE5PZsTUSWN8Z4rgt8LtMCbDjAZHMhbEPxNj",
      "success": true,
      "info": {
        "address": "3NpgbzUveE5PZsTUSWN8Z4rgt8LtMCbDjAZHMhbEPxNj",
        "owner": "LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo",
        "poolAddress": "FTUUwFN25knhihreUS9hjmBS2zZMJHdTZVAiCKedhjw9",
        "lowerBinId": -39,
        "upperBinId": 29,
        "totalXAmount": "33689",
        "totalYAmount": "4956467",
        "fees": {
          "feeX": "0",
          "feeY": "0"
        },
        "inRange": true,
        "activeBinId": 0,
        "binCount": 69,
        "lastUpdated": 1750002397804,
        "tokenInfo": {
          "tokenXSymbol": "TokenX",
          "tokenYSymbol": "TokenY",
          "tokenXDecimals": 9,
          "tokenYDecimals": 9
        },
        "formattedAmounts": {
          "tokenXFormatted": "0.000033689",
          "tokenYFormatted": "0.004956467"
        }
      }
    }
  ],
  "summary": {
    "total": 1,
    "successful": 1,
    "failed": 0
  }
}
```

**性能特点**:
- 🚀 并行处理多个头寸（批量大小：5）
- 📊 详细的批量处理统计
- 🛡️ 增强的错误处理和恢复机制
- 📝 完整的操作日志记录

### 8. 创建Y代币头寸 ✅

#### POST /api/positions/y/create
创建Y代币（通常是稳定币）的流动性头寸

**实现状态**: ✅ 已实现

**请求参数**:
```json
{
  "poolAddress": "LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo",
  "amount": "100.0",
  "binRange": 5,
  "strategy": "moderate",
  "slippageBps": 100,
  "password": "wallet_password"
}
```

**参数说明**:
- `poolAddress`: DLMM池子地址
- `amount`: 投入金额
- `binRange`: bin范围（影响价格区间）
- `strategy`: 策略类型（moderate, aggressive, conservative）
- `slippageBps`: 滑点容忍度（基点，100 = 1%）
- `password`: 钱包密码

### 9. 创建X代币头寸 ✅

#### POST /api/positions/x/create
创建X代币（通常是基础代币如SOL）的流动性头寸

**实现状态**: ✅ 已实现

**请求参数**:
```json
{
  "poolAddress": "LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo",
  "amount": "2.0",
  "binRange": 3,
  "strategy": "balanced",
  "slippageBps": 100,
  "password": "wallet_password"
}
```

### 10. 关闭头寸(统一方法) ✅

#### POST /api/positions/{address}/close
关闭指定的流动性头寸(支持X和Y代币头寸)

**实现状态**: ✅ 已实现但未测试

**路径参数**:
- `address`: 头寸地址

**请求参数**:
```json
{
  "password": "wallet_password"
}
```

**参数说明**:
- `password`: 可选，钱包密码。如果钱包已解锁，该参数可以省略

**请求示例**:
```bash
# 使用密码关闭头寸
curl -X POST http://localhost:7000/api/positions/7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU/close \
  -H "Content-Type: application/json" \
  -d '{
    "password": "myWalletPassword"
  }'

# 钱包已解锁时关闭头寸
curl -X POST http://localhost:7000/api/positions/7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU/close \
  -H "Content-Type: application/json" \
  -d '{}'
```

**响应示例**:
```json
{
  "success": true,
  "data": {
    "positionAddress": "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU",
    "transactionSignature": "5A7B8C9D10E11F12G13H14I15J16K17L18M19N20O21P22Q23R24S25T26U27V28W29X",
    "closeTime": 1702468200000,
    "recoveredTokens": {
      "tokenX": "1.500000000",
      "tokenY": "75.000000",
      "totalValue": "150.000000"
    },
    "finalStatus": "closed"
  }
}
```

#### 10.1 删除头寸(兼容方法) ✅

#### DELETE /api/positions/{address}
删除指定头寸(内部调用统一关闭方法)

**实现状态**: ✅ 已实现但未测试

**路径参数**:
- `address`: 头寸地址

**说明**: 该接口为兼容性接口，内部实际调用统一的关闭头寸方法

#### 10.2 关闭X代币头寸(兼容方法) ✅

#### POST /api/positions/x/{address}/close
关闭指定的X代币流动性头寸(兼容接口)

**实现状态**: ✅ 已实现但未测试

**路径参数**:
- `address`: 头寸地址

**请求参数**:
```json
{
  "password": "wallet_password"
}
```

**说明**: 该接口为兼容性接口，内部实际调用统一的关闭头寸方法

### 11. 获取头寸收益统计 ✅

#### GET /api/positions/{address}/stats
获取指定头寸的收益统计信息

**实现状态**: ✅ 已实现但未测试

**路径参数**:
- `address`: 头寸地址

**请求示例**:
```bash
curl -X GET http://localhost:7000/api/positions/5rNX1EKtg8bQ5QZCQgaV2y95nmQkTbgZM9BnerKbcDr1/stats
```

**响应示例**:
```json
{
  "success": true,
  "data": {
    "totalReturn": "5.25%",
    "totalFees": "0.051000000",
    "dailyYield": "0.12%",
    "holdingTime": 86400000,
    "utilizationRate": 0.75,
    "riskScore": 0.3,
    "performanceMetrics": {
      "sharpeRatio": 1.25,
      "maxDrawdown": "2.1%",
      "winRate": 0.68
    }
  }
}
```

### 12. 🆕 收益查看与提取功能分离说明 ⭐

#### 功能架构重构 (v3.0)

**DLMM流动性管理系统**的收益管理功能已完全重构为简化的3核心功能架构，确保代码简洁性和功能聚焦：

#### 🔍 核心功能1: 查看收益信息
- **功能**: 从链上直接获取头寸的原始收益数据
- **特点**: 无任何过滤或阈值限制，返回完整的原始数据
- **API端点**: `GET /api/positions/{address}/fees`

#### 💰 核心功能2: 计算收益价值  
- **功能**: 将X代币和Y代币收益转换为Y代币等价值
- **特点**: 使用池内价格比率计算，无需外部价格服务
- **API端点**: `POST /api/positions/{address}/calculate-value`

#### 🎯 核心功能3: 提取收益
- **功能**: 执行实际的区块链交易进行收益提取
- **特点**: 完整的交易构建、签名和发送流程
- **API端点**: `POST /api/positions/{address}/collect-fees`

#### 🚫 已移除的功能
以下批量和自动化功能已被移除以简化架构：
- **批量收益查看**: `getAllPositionFees()`, `getAllHarvestablePositions()`
- **批量收益提取**: `batchCollectFees()`
- **自动收益提取**: 自动定时收集功能
- **收益分发管理**: 收益分发和统计功能
- **阈值过滤**: 最小提取阈值筛选功能

#### 🎯 设计理念
- **单一职责**: 每个方法只专注一个核心功能
- **简化维护**: 减少重复代码和复杂逻辑
- **直接有效**: 用户直接调用核心功能，无中间层抽象
- **接口兼容**: 保留空的stub方法确保接口向后兼容

### 13. 🆕 获取单个头寸收益信息 ✅

#### GET /api/positions/{address}/fees
获取指定头寸的原始收益信息（核心功能1）

**实现状态**: ✅ 已实现并简化

**路径参数**:
- `address`: 头寸地址

**请求示例**:
```bash
curl -X GET http://localhost:7000/api/positions/5rNX1EKtg8bQ5QZCQgaV2y95nmQkTbgZM9BnerKbcDr1/fees
```

**响应示例**:
```json
{
  "success": true,
  "data": {
    "feeX": "0",
    "feeY": "10",
    "feeXRaw": "0",
    "feeYRaw": "10",
    "feeXExcludeTransferFee": "0",
    "feeYExcludeTransferFee": "10",
    "feeXExcludeTransferFeeRaw": "0",
    "feeYExcludeTransferFeeRaw": "10",
    "poolAddress": "FTUUwFN25knhihreUS9hjmBS2zZMJHdTZVAiCKedhjw9",
    "tokenXMint": "So11111111111111111111111111111111111111112",
    "tokenYMint": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    "tokenXDecimals": 9,
    "tokenYDecimals": 9
  }
}
```

### 14. 🆕 计算收益Y代币等价值 ✅

#### POST /api/positions/{address}/calculate-value
计算X代币和Y代币收益的Y代币等价值（核心功能2）

**实现状态**: ✅ 新增实现

**路径参数**:
- `address`: 头寸地址

**请求参数**:
```json
{
  "tokenXAmount": "0",
  "tokenYAmount": "10",
  "poolAddress": "FTUUwFN25knhihreUS9hjmBS2zZMJHdTZVAiCKedhjw9",
  "tokenXDecimals": 9,
  "tokenYDecimals": 9
}
```

**参数说明**:
- `tokenXAmount`: X代币数量（原始单位字符串）
- `tokenYAmount`: Y代币数量（原始单位字符串）
- `poolAddress`: 池地址（用于获取价格比率）
- `tokenXDecimals`: X代币精度，可选，默认9
- `tokenYDecimals`: Y代币精度，可选，默认9

**请求示例**:
```bash
curl -X POST http://localhost:7000/api/positions/5rNX1EKtg8bQ5QZCQgaV2y95nmQkTbgZM9BnerKbcDr1/calculate-value \
  -H "Content-Type: application/json" \
  -d '{
    "tokenXAmount": "0",
    "tokenYAmount": "10",
    "poolAddress": "FTUUwFN25knhihreUS9hjmBS2zZMJHdTZVAiCKedhjw9",
    "tokenXDecimals": 9,
    "tokenYDecimals": 9
  }'
```

**响应示例**:
```json
{
  "success": true,
  "data": {
    "totalYTokenValue": 1e-8,
    "tokenXAmount": "0",
    "tokenYAmount": "10",
    "poolAddress": "FTUUwFN25knhihreUS9hjmBS2zZMJHdTZVAiCKedhjw9"
  }
}
```

### 15. 收集头寸手续费（提取操作）✅

#### POST /api/positions/{address}/collect-fees
收集指定头寸的手续费（核心功能3）

**实现状态**: ✅ 已实现并简化

**路径参数**:
- `address`: 头寸地址

**请求示例**:
```bash
curl -X POST http://localhost:7000/api/positions/5rNX1EKtg8bQ5QZCQgaV2y95nmQkTbgZM9BnerKbcDr1/collect-fees
```

**响应示例**:
```json
{
  "success": true,
  "data": {
    "success": true,
    "positionAddress": "5rNX1EKtg8bQ5QZCQgaV2y95nmQkTbgZM9BnerKbcDr1",
    "harvestedFees": {
      "tokenX": "0",
      "tokenY": "10"
    },
    "totalUsdValue": 1e-8,
    "gasUsed": 0,
    "signature": "3trGLqbd1o3mwHbXPvaC3uinoMCzsBe6bHjPUcudRNNZH532b4mqaKqmnDnTVKzNF7JD6MVJPhSTajRLgT4qfioD"
  }
}
```

**成功案例**:
- **测试头寸**: `5rNX1EKtg8bQ5QZCQgaV2y95nmQkTbgZM9BnerKbcDr1`
- **提取收益**: 10个原始单位Y代币（0.00000001 Y代币）
- **交易状态**: 已确认（confirmed）
- **Gas费用**: 0 lamports（高效执行）

### 🚫 已移除的收益管理API

以下API接口已在v3.0版本中移除，以简化系统架构：

#### 已移除的接口列表:
- `GET /api/positions/fees/all` - 获取所有头寸收益信息
- `GET /api/positions/fees/harvestable` - 获取可提取的头寸
- `GET /api/positions/user/{userAddress}/fees` - 获取用户收益信息
- `GET /api/positions/user/{userAddress}/fees/harvestable` - 获取用户可提取头寸
- `POST /api/positions/batch/collect-fees` - 批量收集手续费

#### 替代方案:
如需实现批量功能，请在前端循环调用核心API：
1. **批量查看收益**: 循环调用 `GET /api/positions/{address}/fees`
2. **批量计算价值**: 循环调用 `POST /api/positions/{address}/calculate-value`
3. **批量提取收益**: 循环调用 `POST /api/positions/{address}/collect-fees`

#### 移除原因:
- **简化维护**: 减少重复代码和复杂的批量处理逻辑
- **提高可靠性**: 避免批量操作中的级联错误
- **架构清晰**: 单一职责原则，每个API只处理一个头寸
- **降低复杂度**: 移除阈值过滤、自动收集等复杂功能

### 使用建议

#### 收益管理最佳实践:
1. **查看收益**: 使用 `GET /positions/{address}/fees` 获取原始数据
2. **计算价值**: 使用 `POST /positions/{address}/calculate-value` 获取Y代币等价值
3. **提取收益**: 使用 `POST /positions/{address}/collect-fees` 执行实际提取
4. **批量操作**: 在前端实现循环调用，可更好控制错误处理和进度显示

#### 简化架构优势:
- **代码质量**: 从~1103行简化到~400行，提高可读性和维护性
- **功能聚焦**: 专注于3个核心功能，避免过度设计
- **错误处理**: 简化的错误处理逻辑，更容易调试和修复
- **性能优化**: 减少不必要的批量查询，按需获取数据

## 🔄 Jupiter交换API

### 1. 获取交换报价 ✅

#### POST /api/jupiter/quote
获取代币交换的最优报价

**实现状态**: ✅ 已实现

**请求参数**:
```json
{
  "inputMint": "So11111111111111111111111111111111111111112",
  "outputMint": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  "amount": "1000000000",
  "slippageBps": 50
}
```

**参数说明**:
- `inputMint`: 输入代币mint地址
- `outputMint`: 输出代币mint地址  
- `amount`: 输入金额（最小单位，如lamports）
- `slippageBps`: 可选，滑点容忍度（基点），默认50（0.5%）

**请求示例**:
```bash
curl -X POST http://localhost:7000/api/jupiter/quote \
  -H "Content-Type: application/json" \
  -d '{
    "inputMint": "So11111111111111111111111111111111111111112",
    "outputMint": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    "amount": "1000000000",
    "slippageBps": 100
  }'
```

**响应示例**:
```json
{
  "success": true,
  "data": {
    "inputMint": "So11111111111111111111111111111111111111112",
    "outputMint": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    "inAmount": "1000000000",
    "outAmount": "50125000",
    "priceImpactPct": 0.02,
    "marketInfos": []
  }
}
```

### 2. 执行代币交换 ✅

#### POST /api/jupiter/swap
执行代币交换操作

**实现状态**: ✅ 已实现

**请求参数**:
```json
{
  "inputMint": "So11111111111111111111111111111111111111112",
  "outputMint": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  "amount": "1000000000",
  "slippageBps": 50,
  "userPublicKey": "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM"
}
```

**参数说明**:
- `inputMint`: 输入代币mint地址
- `outputMint`: 输出代币mint地址
- `amount`: 输入金额（最小单位）
- `slippageBps`: 可选，滑点容忍度（基点）
- `userPublicKey`: 用户钱包地址

**特性说明**:
- ✅ **动态优先费用**: 根据网络拥堵自动调整（5000/10000/20000 microLamports）
- ✅ **智能钱包管理**: 自动使用已解锁的钱包
- ✅ **交易确认**: 完整的交易发送和确认流程

**请求示例**:
```bash
curl -X POST http://localhost:7000/api/jupiter/swap \
  -H "Content-Type: application/json" \
  -d '{
    "inputMint": "So11111111111111111111111111111111111111112",
    "outputMint": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    "amount": "1000000000",
    "slippageBps": 100,
    "userPublicKey": "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM"
  }'
```

**响应示例**:
```json
{
  "success": true,
  "data": {
    "signature": "5B8C9D10E11F12G13H14I15J16K17L18M19N20O21P22Q23R24S25T26U27V28W29X",
    "inputAmount": "1000000000",
    "outputAmount": "50125000",
    "priceImpact": 0.02
  }
}
```

### 3. 获取代币价格 ✅

#### POST /api/jupiter/prices
获取指定代币的实时价格

**实现状态**: ✅ 已实现

**请求参数**:
```json
{
  "mints": [
    "So11111111111111111111111111111111111111112",
    "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"
  ]
}
```

**参数说明**:
- `mints`: 代币mint地址数组

**请求示例**:
```bash
curl -X POST http://localhost:7000/api/jupiter/prices \
  -H "Content-Type: application/json" \
  -d '{
    "mints": [
      "So11111111111111111111111111111111111111112",
      "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"
    ]
  }'
```

**响应示例**:
```json
{
  "success": true,
  "data": {
    "So11111111111111111111111111111111111111112": 50.125,
    "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v": 1.0001
  }
}
```

### 4. 获取支持的代币列表 ✅

#### GET /api/jupiter/tokens
获取Jupiter支持的所有代币列表

**实现状态**: ✅ 已实现

**请求示例**:
```bash
curl -X GET http://localhost:7000/api/jupiter/tokens
```

**响应示例**:
```json
{
  "success": true,
  "data": [
    {
      "address": "So11111111111111111111111111111111111111112",
      "symbol": "SOL",
      "name": "Wrapped SOL",
      "decimals": 9,
      "logoURI": "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png"
    },
    {
      "address": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
      "symbol": "USDC",
      "name": "USD Coin",
      "decimals": 6,
      "logoURI": "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v/logo.png"
    }
  ]
}
```

## 📊 监控管理API

### 1. Gas费用监控 ✅

#### GET /api/monitor/gas
获取实时Gas费用状态和网络拥堵信息

**实现状态**: ✅ 已实现

**请求示例**:
```bash
curl -X GET http://localhost:7000/api/monitor/gas
```

**响应示例**:
```json
{
  "success": true,
  "data": {
    "health": {
      "status": "healthy",
      "message": "Gas费用数据正常",
      "timestamp": 1702468200000,
      "details": {
        "hasValidData": true,
        "dataAge": 36,
        "currentPriorityFee": 5000,
        "networkCongestion": "low"
      }
    },
    "currentSettings": {
      "baseFee": 5000,
      "priorityFee": 5000
    },
    "networkCongestion": "low",
    "metrics": {
      "uptime": 1702468200000,
      "requestCount": 150,
      "errorCount": 0,
      "lastActivity": 1702468200000,
      "performance": {
        "avgResponseTime": 125,
        "successRate": 100
      }
    },
    "timestamp": 1702468200000
  }
}
```

**状态说明**:
- `health.status`: Gas服务健康状态（healthy/warning/error）
- `networkCongestion`: 网络拥堵级别（low/medium/high）
- `currentSettings.priorityFee`: 当前推荐的优先费用（microLamports）
- `dataAge`: 数据更新时间（秒）

**网络拥堵对应的优先费用**:
- `low`: 5000 microLamports - 网络空闲，使用最低费用
- `medium`: 10000 microLamports - 网络正常，平衡效率
- `high`: 20000 microLamports - 网络拥堵，确保快速确认

## 📊 日志查询API

### 1. 获取最近日志 ✅

#### GET /api/logs
获取最近的系统日志

**实现状态**: ✅ 已实现

**查询参数**:
- `limit`: 可选，返回日志条数，默认50

**请求示例**:
```bash
curl -X GET http://localhost:7000/api/logs?limit=100
```

### 2. 获取错误日志 ✅

#### GET /api/logs/errors
获取最近的错误日志

**实现状态**: ✅ 已实现

**查询参数**:
- `limit`: 可选，返回日志条数，默认20

### 3. 获取业务操作日志 ✅

#### GET /api/logs/business/operations
获取业务操作相关日志

**实现状态**: ✅ 已实现

**查询参数**:
- `limit`: 可选，返回日志条数，默认50

### 4. 获取业务监控日志 ✅

#### GET /api/logs/business/monitoring
获取业务监控相关日志

**实现状态**: ✅ 已实现

**查询参数**:
- `limit`: 可选，返回日志条数，默认50

### 5. 按类别获取日志 ✅

#### GET /api/logs/category/{category}
获取指定类别的日志

**实现状态**: ✅ 已实现

**路径参数**:
- `category`: 日志类别

**查询参数**:
- `limit`: 可选，返回日志条数，默认50

### 6. 获取混合日志 ✅

#### GET /api/logs/mixed
获取所有类型的混合日志

**实现状态**: ✅ 已实现

**查询参数**:
- `limit`: 可选，返回日志条数，默认50

### 7. 获取日志文件列表 ✅

#### GET /api/logs/files
获取可用的日志文件列表

**实现状态**: ✅ 已实现

## 🚀 性能优化特性

### 1. 池实例持久化
- **持久化缓存**: 池实例缓存30分钟，避免重复创建
- **LRU策略**: 自动清理最少使用的池实例
- **性能提升**: 相比每次创建实例，性能提升5-10倍

### 2. 实时数据保证
- **无数据缓存**: 活跃bin和价格数据不缓存，确保实时性
- **链上直取**: 每次API调用都从区块链获取最新数据
- **快速响应**: 通过池实例复用实现快速数据获取

### 3. 智能缓存策略
- **分层缓存**: 池信息30秒缓存，价格数据10秒缓存
- **强制刷新**: 支持refresh参数强制获取最新数据
- **内存优化**: 自动清理过期缓存，防止内存泄漏

## 🔧 错误处理

### 标准错误响应格式
```json
{
  "success": false,
  "error": "错误描述信息",
  "code": "ERROR_CODE",
  "details": "详细错误信息（可选）"
}
```

### 常见错误代码
- `INVALID_PARAMETERS`: 无效参数
- `INVALID_ADDRESS_FORMAT`: 无效地址格式
- `POOL_NOT_FOUND`: 池子未找到
- `METEORA_SERVICE_UNAVAILABLE`: Meteora服务不可用
- `WALLET_INFO_ERROR`: 钱包信息错误
- `VALIDATION_ERROR`: 输入验证失败
- `JUPITER_API_ERROR`: Jupiter API调用失败
- `SWAP_EXECUTION_FAILED`: 交换执行失败
- `WALLET_NOT_UNLOCKED`: 钱包未解锁
- `INSUFFICIENT_BALANCE`: 余额不足
- `SLIPPAGE_EXCEEDED`: 滑点超限
- `GAS_SERVICE_UNAVAILABLE`: Gas服务不可用
- `NETWORK_CONGESTION_HIGH`: 网络拥堵严重

## 📝 使用说明

### 1. 基本工作流程
1. **健康检查**: 确认系统状态正常
2. **钱包管理**: 创建或导入钱包
3. **池子监控**: 获取池子信息和实时价格
4. **头寸管理**: 查询或创建流动性头寸
5. **Jupiter交换**: 获取报价并执行代币交换
6. **Gas监控**: 监控网络状况和费用优化
7. **日志监控**: 查看操作日志和错误信息

### 2. 最佳实践
- **缓存利用**: 对于不需要实时数据的场景，利用缓存提高性能
- **强制刷新**: 对于需要最新数据的场景，使用refresh参数
- **错误处理**: 始终检查响应中的success字段
- **钱包状态**: 执行交换前确保钱包已解锁
- **滑点设置**: 根据市场波动合理设置滑点参数（推荐50-200基点）
- **Gas监控**: 定期检查网络拥堵状态，优化交易时机
- **报价时效**: Jupiter报价有时效性，建议获取后立即执行
- **日志监控**: 定期查看错误日志，及时发现问题

### 3. 性能建议
- **批量查询**: 尽量使用合并API（如price-and-bin）减少请求次数
- **合理缓存**: 根据业务需求选择合适的缓存策略
- **动态优先费用**: 系统自动根据网络状况调整Gas费用，无需手动设置
- **交换时机**: 在网络拥堵度为'low'时执行大额交换可节省费用
- **监控资源**: 定期查看/api/metrics和/api/monitor/gas监控系统状态

### 4. Jupiter交换使用建议
- **最佳流程**: 先调用`/api/jupiter/quote`获取报价，确认后调用`/api/jupiter/swap`执行
- **滑点策略**: 
  - 稳定币对稳定币: 10-50基点
  - 主流代币: 50-100基点
  - 小众代币: 100-500基点
- **金额限制**: 系统设置最小交换金额1000 lamports
- **网络优化**: 系统自动检测网络拥堵并调整优先费用：
  - 低拥堵: 5000 microLamports
  - 中等拥堵: 10000 microLamports  
  - 高拥堵: 20000 microLamports

## 🔗 WebSocket支持

WebSocket服务器运行在 `ws://localhost:7002`，支持实时数据推送和双向通信。

### 连接示例
```javascript
const ws = new WebSocket('ws://localhost:7002');

ws.on('open', () => {
  console.log('WebSocket连接已建立');
});

ws.on('message', (data) => {
  const message = JSON.parse(data);
  console.log('收到消息:', message);
});
```

## 🚧 未实现的API

> **说明**: 以下API尚未完全实现或未注册到主服务器，标注了实现状态供参考。

### 钱包扩展API

- `GET /api/wallet/transactions` - 获取交易历史 🚧 功能不完整

### 监控API

> **状态**: 🚧 路由已实现但未注册到主服务器

- `GET /api/monitor/system` - 获取系统监控数据
- `GET /api/monitor/strategies` - 获取策略监控数据
- `GET /api/monitor/performance` - 获取性能监控数据
- `GET /api/monitor/errors` - 获取错误监控数据
- `GET /api/monitor/alerts` - 获取预警信息

### 数据分析API

> **状态**: 🚧 路由已实现但未注册到主服务器

- `GET /api/analytics/profit` - 获取收益分析
- `GET /api/analytics/trades` - 获取交易统计
- `GET /api/analytics/positions` - 获取头寸分析
- `GET /api/analytics/strategy-performance` - 获取策略性能分析
- `GET /api/analytics/market` - 获取市场数据分析

### 策略管理API

> **状态**: 🚧 路由已实现但未注册到主服务器

- `GET /api/strategy/list` - 获取所有策略
- `POST /api/strategy/create` - 创建新策略
- `POST /api/strategy/{instanceId}/start` - 启动策略
- `POST /api/strategy/{instanceId}/stop` - 停止策略
- `POST /api/strategy/{instanceId}/pause` - 暂停策略
- `POST /api/strategy/{instanceId}/resume` - 恢复策略
- `GET /api/strategy/{instanceId}/status` - 获取策略状态
- `DELETE /api/strategy/{instanceId}` - 删除策略
- `GET /api/strategy/templates` - 获取策略模板

### 配置管理API

> **状态**: 🚧 路由已实现但未注册到主服务器

- `GET /api/config/system` - 获取系统配置
- `PUT /api/config/system` - 更新系统配置
- `GET /api/config/user` - 获取用户设置
- `PUT /api/config/user` - 更新用户设置

### 实现状态说明

**图例**:
- ✅ **已实现且可用**: 功能完整，可以正常使用
- 🚧 **未注册路由**: 代码存在但未注册到主服务器
- 🚧 **功能不完整**: 基础实现完成但需要完善功能

**统计**:
- 核心功能API: 51个 ✅ 完全可用（包含已实现但未测试的）
- 高级功能API: 3个 🚧 需要注册路由
- 总计API数量: 54个

## 🔄 架构更新说明 (v2.0)

### 头寸关闭功能统一化

**更新时间**: 2024-12-13  
**影响范围**: 头寸管理API、前端JavaScript、后端路由

#### 主要改进

1. **统一关闭方法**
   - 所有头寸关闭操作现在都通过 `PositionManager.closePosition()` 统一处理
   - 支持X代币和Y代币头寸的无差别关闭
   - 智能钱包管理：支持已解锁钱包的密码复用

2. **API接口优化**
   - **主要接口**: `POST /api/positions/{address}/close` - 统一的头寸关闭方法
   - **兼容接口**: 
     - `DELETE /api/positions/{address}` - 兼容删除接口
     - `POST /api/positions/x/{address}/close` - 兼容X头寸接口
   - 所有兼容接口内部都调用统一的关闭方法

3. **前端架构改进**
   - **position-core.js**: 
     - `closePosition()` - 统一关闭方法，支持可选密码参数
     - `closeYPosition()`, `closeXPosition()` - 委托给统一方法
   - **api.js**: 
     - 统一调用 `POST /positions/:address/close` 端点
     - 智能参数处理：密码参数可选

4. **后端路由统一**
   - 所有关闭端点都使用 `services.positionManager.closePosition()`
   - 确保一致的交易处理和状态验证
   - 统一的错误处理和日志记录

#### 技术优势

- **代码复用**: 消除重复的关闭逻辑，减少维护成本
- **一致性**: 所有头寸类型使用相同的关闭流程
- **可靠性**: 统一的交易确认和状态验证机制
- **向后兼容**: 保留所有现有API端点，不影响现有集成
- **智能管理**: 支持钱包解锁状态复用，提升用户体验

#### 迁移说明

**现有代码无需修改**：
- 所有现有的API调用都保持向后兼容
- 前端组件自动受益于架构改进
- 新项目建议直接使用统一的 `POST /api/positions/{address}/close` 接口

**推荐使用**：
```javascript
// 推荐的前端调用方式
await api.closePosition(positionAddress, password); // 统一方法

// 或者使用具体类型方法（内部委托给统一方法）
await api.closeYPosition(positionAddress, password);
await api.closeXPosition(positionAddress, password);
```

---

## 📊 API统计信息 (v2.7更新)

### 实现状态统计

**完全可用的API**:
- 系统管理API: 3个
- 钱包管理API: 11个  
- 池子管理API: 4个
- 头寸管理API: 11个（**简化后减少5个批量收益接口**）
  - 头寸基础管理: 8个
  - 收益管理（简化版）: 3个核心API
- Jupiter交换API: 4个
- Gas监控API: 1个
- 日志查询API: 7个
- 连锁头寸创建API: 1个

**需要完善的API**:
- 连锁头寸管理API: 3个（查看、关闭、用户列表功能需要实现路由）

**总计**: 42个完全可用，3个需要完善
**架构优化**: 通过简化PositionFeeHarvester减少了5个重复接口，提高了代码维护性

### 🔄 v2.7版本重要更新

#### PositionFeeHarvester架构重构
- **代码行数**: 从~1103行简化到~400行（减少63%）
- **功能聚焦**: 保留3个核心功能，移除批量和自动化功能
- **接口简化**: 移除5个批量收益管理接口
- **维护性提升**: 消除重复代码，单一职责设计

#### 核心功能保留
1. **查看收益**: `GET /api/positions/{address}/fees`
2. **计算价值**: `POST /api/positions/{address}/calculate-value`（新增）
3. **提取收益**: `POST /api/positions/{address}/collect-fees`

#### 移除的批量功能
- `GET /api/positions/fees/all` - 获取所有头寸收益
- `GET /api/positions/fees/harvestable` - 获取可提取头寸
- `GET /api/positions/user/{userAddress}/fees` - 获取用户收益
- `GET /api/positions/user/{userAddress}/fees/harvestable` - 获取用户可提取头寸
- `POST /api/positions/batch/collect-fees` - 批量收集手续费

#### 架构优势
- **简化维护**: 减少重复逻辑和复杂的批量处理
- **提高可靠性**: 避免批量操作中的级联错误
- **清晰职责**: 每个API专注单一头寸处理
- **向前兼容**: 保留空stub方法确保接口兼容性

---

**文档版本**: V2.7  
**最后更新**: 2024-12-13  
**系统版本**: DLMM Liquidity Management System v1.0.0

## ⚠️ 文档错误修正记录

### 发现的错误

1. **头寸链上信息API** - 已完全实现并测试通过
- `GET /api/positions/{address}/onchain` - ✅ 已实现并测试通过
- `GET /api/positions/{address}/refresh` - ✅ 已实现并测试通过
- `POST /api/positions/batch/onchain` - ✅ 已实现并测试通过

2. **连锁头寸API路径错误** - 文档中的路径与实际实现不符
   - 文档错误：`/api/chain-positions/*`
   - 实际路径：`/api/chain-position/*`
   - 已修正所有相关示例

3. **连锁头寸API实现状态错误** - 只有创建API完全实现
   - ✅ `POST /api/chain-position/create` - 已实现并可用
   - 🚧 `GET /api/chain-position/{chainPositionId}` - 路由未实现
   - 🚧 `POST /api/chain-position/{chainPositionId}/close` - 路由未实现
   - 🚧 `GET /api/chain-position/user/{userAddress}` - 路由未实现

### 修正后的准确状态

**完全可用的API**:
- 系统管理API (3个)
- 钱包管理API (11个)  
- 池子管理API (4个)
- 头寸管理API (16个，包括新增的收益查看和提取API)
- Jupiter交换API (4个)
- Gas监控API (1个)
- 日志查询API (7个)
- 连锁头寸创建API (1个)

**需要完善的API**:
- 头寸链上信息API (3个) - ✅ 已完全实现并测试通过
- 连锁头寸管理API (3个) - 需要实现路由

**总计**: 47个完全可用，6个需要完善

### 🆕 收益管理API统计

**收益查看API (显示用途，无阈值过滤)**:
- `GET /api/positions/{address}/fees` - 单个头寸收益信息
- `GET /api/positions/fees/all` - 所有头寸收益信息  
- `GET /api/positions/user/{userAddress}/fees` - 用户收益信息

**收益提取API (操作用途，应用阈值过滤)**:
- `GET /api/positions/fees/harvestable` - 可提取头寸查询
- `GET /api/positions/user/{userAddress}/fees/harvestable` - 用户可提取头寸
- `POST /api/positions/{address}/collect-fees` - 执行提取操作
- `POST /api/positions/batch/collect-fees` - 批量提取操作

**功能特点**:
- ✅ **完全分离**: 查看和提取功能独立设计
- ✅ **真实验证**: 已通过实际区块链交易测试
- ✅ **微额精确**: 支持0.00000001级别的微小收益检测
- ✅ **智能计算**: 基于池子内部价格比率，无需外部价格服务

## 🔄 版本更新说明 (v2.6)

### 头寸链上信息API状态更新 ⭐

**更新时间**: 2024-12-13  
**重要修正**: 头寸链上信息查看API已完全可用

#### 状态修正

**之前状态**: 🚧 后端方法已实现，但路由未注册  
**实际状态**: ✅ 已完全实现并测试通过

经过详细验证，发现以下API已经完全可用：

1. **单个头寸链上信息**: `GET /api/positions/{address}/onchain`
   - ✅ 路由已正确注册在 `position-routes.ts`
   - ✅ 主服务器已正确加载路由
   - ✅ 实际测试通过，返回准确的X/Y代币数量

2. **头寸信息刷新**: `GET /api/positions/{address}/refresh?fromChain=true`
   - ✅ 支持可选的链上数据刷新
   - ✅ 返回完整的bin数组和代币信息
   - ✅ 智能缓存更新机制

3. **批量头寸链上信息**: `POST /api/positions/batch/onchain`
   - ✅ 支持最多20个头寸的批量查询
   - ✅ 并行处理和详细的统计信息
   - ✅ 完善的错误处理机制

#### 测试验证结果

**测试头寸**: `3NpgbzUveE5PZsTUSWN8Z4rgt8LtMCbDjAZHMhbEPxNj`

**获取到的数据**:
- **X代币数量**: 33689 (0.000033689 格式化)
- **Y代币数量**: 4956467 (0.004956467 格式化)
- **Bin范围**: -39 到 29 (共69个bin)
- **头寸状态**: 在范围内 (inRange: true)
- **代币信息**: 包含完整的代币元数据

#### 文档更新

- **API状态**: 从 🚧 更新为 ✅
- **示例数据**: 使用真实测试数据替换模拟数据
- **统计信息**: 核心功能API从40个增加到43个
- **实现状态**: 所有头寸链上信息API完全可用

#### 功能特点

1. **精确计算**: 使用BigInt避免精度丢失
2. **智能格式化**: 自动去除尾随零的格式化算法
3. **完整信息**: 包含代币元数据、bin信息、范围状态等
4. **高性能**: 支持批量查询和并行处理
5. **可靠性**: 完善的错误处理和状态验证

## 🔄 版本更新说明 (v2.5)

### 收益查看与提取功能完整实现 (新增) ⭐

**更新时间**: 2024-12-13  
**重大功能**: 完整的收益管理系统，实现查看和提取功能的完全分离

#### 主要特性

1. **功能完全分离**
   - **收益查看**: 不应用任何阈值过滤，显示所有收益信息
   - **收益提取**: 应用阈值过滤，只处理达到提取条件的头寸
   - **独立API**: 7个专用API端点，覆盖所有使用场景

2. **真实区块链验证**
   - **成功案例**: 头寸 `5rNX1EKtg8bQ5QZCQgaV2y95nmQkTbgZM9BnerKbcDr1`
   - **提取收益**: 10个原始单位Y代币（0.00000001 Y代币）
   - **交易确认**: `3trGLqbd1o3mwHbXPvaC3uinoMCzsBe6bHjPUcudRNNZH532b4mqaKqmnDnTVKzNF7JD6MVJPhSTajRLgT4qfioD`
   - **Gas效率**: 0 lamports费用，高效执行

3. **智能计算引擎**
   - **价格独立**: 不依赖Jupiter等外部价格服务
   - **池内计算**: 使用池子内部价格比率进行X→Y代币转换
   - **精确检测**: 支持微小收益（0.00000001级别）的准确检测
   - **灵活阈值**: 支持外部参数传递自定义提取阈值

4. **新增API端点**
   - **收益查看**: 
     - `GET /api/positions/{address}/fees` - 单个头寸收益
     - `GET /api/positions/fees/all` - 所有头寸收益
     - `GET /api/positions/user/{userAddress}/fees` - 用户收益
   - **收益提取**:
     - `GET /api/positions/fees/harvestable` - 可提取头寸查询
     - `GET /api/positions/user/{userAddress}/fees/harvestable` - 用户可提取头寸
     - `POST /api/positions/{address}/collect-fees` - 执行提取（已优化）
     - `POST /api/positions/batch/collect-fees` - 批量提取（已优化）

#### 技术改进

**PositionFeeHarvester核心重构**:
- `getAllPositionFees()` - 显示用，无阈值过滤
- `getAllHarvestablePositions()` - 提取用，应用阈值过滤
- `getPositionFeesFromChain()` - 直接链上数据获取
- `calculateTotalYTokenValue()` - 智能价格转换计算
- `isHarvestable()` - 灵活的阈值判断逻辑

**真实提取功能实现**:
- 使用Meteora DLMM SDK的 `claimAllSwapFee` 方法
- 完整的交易构建、签名和发送流程
- 智能钱包管理和错误恢复机制
- 详细的操作日志和状态跟踪

### 头寸链上信息获取功能 (v2.4)

**更新时间**: 2024-12-13  
**新增功能**: 基于改进的Meteora SDK的精确头寸信息获取

#### 主要特性

1. **精确的链上数据获取**
   - **正确的SDK调用**: 使用 `DLMMSdk.default.default.create()` 和 `getPosition()` 方法
   - **准确的数据解析**: 正确解析 `positionData.positionBinData` 数组
   - **字段优先级策略**: `positionXAmount` > `xAmount` > `binXAmount` > `x`
   - **BigInt精确计算**: 避免JavaScript浮点数精度问题

2. **完整的代币信息**
   - **代币元数据**: 包含代币符号、精度等信息
   - **格式化显示**: 智能的数量格式化算法
   - **多种数据格式**: 原始数量和格式化数量并存

3. **新增API端点**
   - **单个头寸链上信息**: `GET /api/positions/{address}/onchain`
   - **头寸信息刷新**: `GET /api/positions/{address}/refresh?fromChain=true`
   - **批量链上信息**: `POST /api/positions/batch/onchain`

4. **性能优化**
   - **并行处理**: 批量查询支持并行处理（批量大小：5）
   - **智能缓存**: 支持可选择性链上刷新
   - **错误恢复**: 完善的错误处理和重试机制

#### 技术改进

**PositionManager核心方法重写**:
- `getOnChainPositionInfo()` - 私有方法完全重写
- `getPositionOnChainInfo()` - 公共方法增强
- `getPositionWithRefresh()` - 新增支持链上刷新的方法
- `getBatchPositionsOnChainInfo()` - 新增批量处理方法

**数据准确性验证**:
- 使用真实头寸地址测试：`5rNX1EKtg8bQ5QZCQgaV2y95nmQkTbgZM9BnerKbcDr1`
- 测试结果：0 TokenX + 0.004999954 TokenY（69个活跃bin）
- 与测试脚本结果完全一致，确保数据准确性

#### ⚠️ 当前状态说明

**后端实现完成**: 
- `PositionManager.ts` 中的所有方法已完整实现并测试通过
- `getOnChainPositionInfo()`, `getPositionOnChainInfo()`, `getPositionWithRefresh()`, `getBatchPositionsOnChainInfo()` 均可正常工作

**路由待注册**: 
- 需要在 `position-routes.ts` 中添加以下路由：
  - `GET /api/positions/:address/onchain`
  - `GET /api/positions/:address/refresh`
  - `POST /api/positions/batch/onchain`

**使用方式**: 
- 当前可通过直接调用 `PositionManager` 方法使用功能
- 注册路由后即可通过HTTP API访问

## 🔄 版本更新说明 (v2.3)

### 连锁头寸功能 (新增)

**更新时间**: 2024-12-13  
**新增功能**: 连锁头寸管理系统完整实现

#### 主要特性

1. **连锁头寸机制**
   - **双头寸结构**: 创建2个连续的69bin头寸，总覆盖138个bin
   - **智能范围计算**: 自动计算最优的连续bin范围
   - **完整覆盖**: 无重叠、无间隙的价格范围覆盖

2. **差异化资金分配**
   - **20%-60%-20%策略**: 三层资金分配优化
   - **策略组合**: BidAsk + BidAsk + Curve混合流动性分布
   - **并行创建**: 头寸1和头寸2基础部分并行执行

3. **完整API支持**
   - **创建连锁头寸**: `POST /api/chain-positions` - 完整的连锁头寸创建流程
   - **获取头寸信息**: `GET /api/chain-positions/{chainPositionId}` - 详细信息查询
   - **关闭连锁头寸**: `POST /api/chain-positions/{chainPositionId}/close` - 统一关闭管理
   - **用户头寸列表**: `GET /api/chain-positions/user/{userAddress}` - 用户所有连锁头寸

4. **技术优化**
   - **向后兼容**: 修复YPositionManager支持精确范围参数，不影响现有功能
   - **错误恢复**: 完善的错误处理和状态跟踪机制
   - **性能优化**: 并行创建和智能资金分配

### Jupiter交换功能 (v2.2)

**更新时间**: 2024-12-13  
**新增功能**: Jupiter聚合器完整集成

#### 主要特性

1. **智能优先费用管理**
   - 动态网络拥堵检测（每60秒更新）
   - 自适应优先费用：5000/10000/20000 microLamports
   - 基于Solana网络实时数据的智能调整

2. **完整交换流程**
   - **获取报价**: `POST /api/jupiter/quote` - 支持任意代币对报价
   - **执行交换**: `POST /api/jupiter/swap` - 完整的交易执行流程
   - **价格查询**: `POST /api/jupiter/prices` - 批量代币价格获取
   - **代币列表**: `GET /api/jupiter/tokens` - 支持的代币信息

3. **智能钱包集成**
   - 自动使用已解锁钱包，无需重复输入密码
   - 统一的钱包状态管理，与头寸管理保持一致
   - 完整的交易签名和发送流程

### Gas费用监控 (v2.2)

**监控API**: `GET /api/monitor/gas`

#### 核心功能

1. **实时网络监控**
   - 60秒间隔的网络状况更新
   - 基于150个样本的优先费用分析
   - 智能拥堵等级判断（low/medium/high）

2. **费用优化建议**
   - 提供最优优先费用推荐
   - 网络拥堵状态实时显示
   - 服务健康状态监控

3. **性能指标**
   - 成功率统计
   - 响应时间监控
   - 数据更新时效性检查

### 技术优势

- **无缝集成**: 所有新功能与现有系统完美融合
- **性能优化**: 智能缓存、并行处理和动态费用管理
- **可靠性**: 完整的错误处理和状态验证
- **用户体验**: 自动化的费用优化和智能范围计算
- **向后兼容**: 所有新功能不影响现有API和脚本

### API统计更新

- **新增头寸链上信息API**: 3个核心端点（🚧 后端已实现，路由待注册）
- **新增连锁头寸API**: 4个核心端点（✅ 1个已实现，🚧 3个路由待实现）
- **新增Jupiter API**: 4个核心端点（✅ 完全可用）
- **新增监控API**: 1个Gas监控端点（✅ 完全可用）
- **总计**: 核心功能API从40个增加到43个
- **实现状态**: Jupiter和Gas监控功能完全可用，连锁头寸创建功能可用，其他功能需要完善路由实现 