/**
 * ✅ 输入验证中间件
 * 验证API请求参数和数据
 */

import { Request, Response, NextFunction } from 'express';

export function validationMiddleware(req: Request, res: Response, next: NextFunction): void | Response {
    // 基础验证逻辑

    // 验证JSON格式
    if (req.method === 'POST' || req.method === 'PUT') {
        if (req.headers['content-type']?.includes('application/json')) {
            try {
                // body已经被express.json()解析
                if (req.body === undefined || req.body === null) {
                    return res.status(400).json({
                        success: false,
                        error: '请求体不能为空',
                        code: 'EMPTY_BODY'
                    });
                }
            } catch (error) {
                return res.status(400).json({
                    success: false,
                    error: '无效的JSON格式',
                    code: 'INVALID_JSON'
                });
            }
        }
    }

    // 验证必需的请求头
    if (!req.headers['user-agent']) {
        console.warn('请求缺少User-Agent头');
    }

    next();
} 