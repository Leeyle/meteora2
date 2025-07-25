/**
 * ❌ 错误处理中间件
 * 统一处理API错误和异常
 */

import { Request, Response, NextFunction } from 'express';

export function errorMiddleware(err: any, req: Request, res: Response, next: NextFunction) {
    console.error('❌ API错误:', {
        method: req.method,
        url: req.originalUrl,
        error: err.message,
        stack: err.stack,
        timestamp: new Date().toISOString()
    });

    // 默认错误响应
    let statusCode = 500;
    let errorMessage = '内部服务器错误';
    let errorCode = 'INTERNAL_SERVER_ERROR';

    // 根据错误类型设置响应
    if (err.name === 'ValidationError') {
        statusCode = 400;
        errorMessage = '输入验证失败';
        errorCode = 'VALIDATION_ERROR';
    } else if (err.name === 'UnauthorizedError') {
        statusCode = 401;
        errorMessage = '未授权访问';
        errorCode = 'UNAUTHORIZED';
    } else if (err.name === 'ForbiddenError') {
        statusCode = 403;
        errorMessage = '禁止访问';
        errorCode = 'FORBIDDEN';
    } else if (err.name === 'NotFoundError') {
        statusCode = 404;
        errorMessage = '资源未找到';
        errorCode = 'NOT_FOUND';
    } else if (err.message) {
        errorMessage = err.message;
    }

    // 发送错误响应
    res.status(statusCode).json({
        success: false,
        error: errorMessage,
        code: errorCode,
        timestamp: new Date().toISOString(),
        path: req.originalUrl,
        method: req.method
    });
} 