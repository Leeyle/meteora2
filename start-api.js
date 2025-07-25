/**
 * DLMM API服务器启动脚本
 * 使用编译后的JavaScript文件启动
 */

const path = require('path');

async function startServer() {
    try {
        console.log('🚀 正在启动DLMM API服务器...');
        console.log('📂 工作目录:', process.cwd());

        // 动态导入编译后的JavaScript模块
        const { DLMMAPIServer } = await import('./dist/server/api-server.js');

        console.log('✅ API服务器类加载成功');

        const server = new DLMMAPIServer(7000, 7002);
        await server.start();

        console.log('🎉 DLMM API服务器启动成功!');
        console.log('🌐 API地址: http://localhost:7000');
        console.log('🔌 WebSocket: ws://localhost:7002');
        console.log('❤️ 健康检查: http://localhost:7000/api/health');

    } catch (error) {
        console.error('❌ 服务器启动失败:', error);
        console.error('💡 请确保已运行 npm run build 编译TypeScript代码');
        process.exit(1);
    }
}

// 启动服务器
startServer(); 