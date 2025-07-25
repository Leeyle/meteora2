#!/usr/bin/env node

/**
 * Jupiter V7 切换脚本
 * 用于在V6和V7之间切换Jupiter API版本
 */

const fs = require('fs');
const path = require('path');

const configPath = path.join(__dirname, '../config/default.json');

function toggleJupiterV7() {
    try {
        // 读取当前配置
        const configContent = fs.readFileSync(configPath, 'utf8');
        const config = JSON.parse(configContent);

        // 获取当前状态
        const currentState = config.jupiter?.useV7 || false;
        const newState = !currentState;

        // 更新配置
        if (!config.jupiter) {
            config.jupiter = {};
        }
        config.jupiter.useV7 = newState;

        // 写入配置文件
        fs.writeFileSync(configPath, JSON.stringify(config, null, 4), 'utf8');

        // 输出结果
        console.log('🔄 Jupiter API 版本切换成功！');
        console.log('='.repeat(50));
        console.log(`📊 当前状态: ${currentState ? 'V7' : 'V6'} → ${newState ? 'V7' : 'V6'}`);
        console.log(`🔗 API端点: ${newState ? 'lite-api.jup.ag/swap/v1' : 'quote-api.jup.ag/v6'}`);
        console.log(`📈 滑点默认: ${newState ? '20%' : '10%'}`);
        console.log('='.repeat(50));

        if (newState) {
            console.log('✅ 已切换到 Jupiter V7:');
            console.log('   - 使用新的 lite-api.jup.ag/swap/v1 端点');
            console.log('   - 默认滑点提升至 20%');
            console.log('   - 简化的API调用流程');
            console.log('   - 提高交换成功率');
        } else {
            console.log('⚡ 已切换到 Jupiter V6:');
            console.log('   - 使用原有的 quote-api.jup.ag/v6 端点');
            console.log('   - 默认滑点 10%');
            console.log('   - 兼容现有流程');
        }

        console.log('');
        console.log('🔄 请重启服务器以应用更改:');
        console.log('   npm run dev');
        console.log('   或');
        console.log('   node dist/app.js');

    } catch (error) {
        console.error('❌ 切换失败:', error.message);
        console.error('请检查配置文件是否存在:', configPath);
        process.exit(1);
    }
}

function showCurrentStatus() {
    try {
        const configContent = fs.readFileSync(configPath, 'utf8');
        const config = JSON.parse(configContent);
        const currentState = config.jupiter?.useV7 || false;

        console.log('📊 Jupiter API 当前状态');
        console.log('='.repeat(30));
        console.log(`版本: ${currentState ? 'V7' : 'V6'}`);
        console.log(`端点: ${currentState ? 'lite-api.jup.ag/swap/v1' : 'quote-api.jup.ag/v6'}`);
        console.log(`滑点: ${currentState ? '20%' : '10%'}`);
        console.log('='.repeat(30));
    } catch (error) {
        console.error('❌ 读取状态失败:', error.message);
        process.exit(1);
    }
}

// 命令行参数处理
const args = process.argv.slice(2);
const command = args[0];

if (command === 'status' || command === 's') {
    showCurrentStatus();
} else if (command === 'toggle' || command === 't' || !command) {
    toggleJupiterV7();
} else if (command === 'help' || command === 'h') {
    console.log('🛠️ Jupiter V7 切换脚本');
    console.log('');
    console.log('用法:');
    console.log('  node scripts/toggle-jupiter-v7.js [command]');
    console.log('');
    console.log('命令:');
    console.log('  toggle, t    切换V6/V7版本 (默认)');
    console.log('  status, s    显示当前版本状态');
    console.log('  help, h      显示此帮助信息');
    console.log('');
    console.log('示例:');
    console.log('  node scripts/toggle-jupiter-v7.js        # 切换版本');
    console.log('  node scripts/toggle-jupiter-v7.js status # 查看状态');
} else {
    console.error('❌ 未知命令:', command);
    console.log('使用 "help" 查看可用命令');
    process.exit(1);
} 