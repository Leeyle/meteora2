/**
 * 🔐 认证中间件
 * 处理API访问认证和授权
 */

import { Request, Response, NextFunction } from 'express';

export function authMiddleware(req: Request, res: Response, next: NextFunction) {
    // 对于健康检查等公开接口，跳过认证
    const publicPaths = ['/api/health', '/api/info'];

    if (publicPaths.includes(req.path)) {
        return next();
    }

    // 这里可以添加JWT token验证逻辑
    // 目前暂时跳过认证，因为是本地开发环境

    // const authHeader = req.headers.authorization;
    // if (!authHeader || !authHeader.startsWith('Bearer ')) {
    //     return res.status(401).json({
    //         success: false,
    //         error: '缺少认证token',
    //         code: 'MISSING_AUTH_TOKEN'
    //     });
    // }

    // const token = authHeader.substring(7);
    // 验证token逻辑...

    next();
} 