/**
 * API服务器启动脚本
 */

const { spawn } = require('child_process');
const path = require('path');

console.log('🚀 启动DLMM API服务器...');

// 启动TypeScript服务器
const serverProcess = spawn('node', [
    '-r', 'ts-node/register',
    path.join(__dirname, 'src/server/api-server.ts')
], {
    stdio: 'inherit',
    env: { ...process.env, NODE_ENV: 'development' }
});

serverProcess.on('error', (error) => {
    console.error('❌ 服务器启动失败:', error);
    process.exit(1);
});

serverProcess.on('exit', (code) => {
    console.log(`🛑 服务器进程退出，代码: ${code}`);
    process.exit(code);
});

// 优雅关闭处理
process.on('SIGINT', () => {
    console.log('\n📨 收到SIGINT信号，正在关闭服务器...');
    serverProcess.kill('SIGINT');
});

process.on('SIGTERM', () => {
    console.log('\n📨 收到SIGTERM信号，正在关闭服务器...');
    serverProcess.kill('SIGTERM');
}); 