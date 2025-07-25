
// 连锁头寸界面调试工具
// 在浏览器控制台中运行以下代码进行调试

// 1. 检查组件状态
function checkChainPositionStatus() {
    if (window.dlmmApp && window.dlmmApp.appManager) {
        return window.dlmmApp.appManager.logComponentStatus();
    } else {
        console.error('应用管理器未初始化');
        return null;
    }
}

// 2. 手动恢复界面
function recoverChainPositionPage() {
    if (window.dlmmApp && window.dlmmApp.appManager) {
        return window.dlmmApp.appManager.checkAndRecoverChainPositionPage();
    } else {
        console.error('应用管理器未初始化');
        return false;
    }
}

// 3. 重新加载连锁头寸页面
function reloadChainPositionPage() {
    if (window.dlmmApp && window.dlmmApp.appManager) {
        window.dlmmApp.appManager.loadedComponents.delete('chain-position');
        return window.dlmmApp.appManager.loadChainPositionPage();
    } else {
        console.error('应用管理器未初始化');
        return false;
    }
}

// 4. 监控页面状态
function monitorChainPositionPage() {
    const interval = setInterval(() => {
        const status = checkChainPositionStatus();
        if (status && status.currentPage === 'chain-position') {
            const creator = document.querySelector('.chain-position-creator');
            if (!creator) {
                console.warn('⚠️ 创建器界面丢失，尝试恢复...');
                recoverChainPositionPage();
            }
        }
    }, 5000);
    
    console.log('🔍 页面状态监控已启动，每5秒检查一次');
    return interval;
}

// 使用说明
console.log('🛠️ 连锁头寸界面调试工具已加载');
console.log('可用函数:');
console.log('- checkChainPositionStatus(): 检查组件状态');
console.log('- recoverChainPositionPage(): 手动恢复界面');
console.log('- reloadChainPositionPage(): 重新加载页面');
console.log('- monitorChainPositionPage(): 启动状态监控');
