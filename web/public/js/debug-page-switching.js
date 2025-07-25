
/**
 * 页面切换问题调试工具
 * 在浏览器控制台中运行
 */

// 调试工具对象
window.pageDebugTools = {
    // 检查当前页面状态
    checkPageState: function() {
        const appManager = window.dlmmApp?.appManager;
        if (!appManager) {
            console.error('❌ AppManager未初始化');
            return;
        }
        
        console.log('📊 当前页面状态:');
        console.log('  - 当前页面:', appManager.currentPage);
        console.log('  - 已加载组件:', Array.from(appManager.loadedComponents));
        console.log('  - 全局组件:', {
            walletManager: !!window.walletManager,
            chainPositionCreator: !!window.chainPositionCreator,
            poolCrawlerMonitor: !!window.poolCrawlerMonitor,
            strategyMonitor: !!window.strategyMonitor
        });
    },
    
    // 强制重新加载连锁头寸页面
    forceReloadChainPosition: function() {
        const appManager = window.dlmmApp?.appManager;
        if (!appManager) {
            console.error('❌ AppManager未初始化');
            return;
        }
        
        console.log('🔄 强制重新加载连锁头寸页面...');
        appManager.loadedComponents.delete('chain-position');
        appManager.loadPageContent('chain-position', true);
    },
    
    // 检查页面组件完整性
    checkComponentIntegrity: function(page = 'chain-position') {
        const appManager = window.dlmmApp?.appManager;
        if (!appManager) {
            console.error('❌ AppManager未初始化');
            return;
        }
        
        console.log(`🔍 检查页面组件完整性: ${page}`);
        const needsReload = appManager.verifyPageComponentIntegrity(page);
        console.log(`结果: ${needsReload ? '需要重新加载' : '组件完整'}`);
        
        if (needsReload) {
            console.log('🔄 自动重新加载...');
            appManager.loadPageContent(page, true);
        }
    },
    
    // 清理页面状态
    cleanupPage: function(page) {
        const appManager = window.dlmmApp?.appManager;
        if (!appManager) {
            console.error('❌ AppManager未初始化');
            return;
        }
        
        console.log(`🧹 清理页面状态: ${page || appManager.currentPage}`);
        const oldPage = appManager.currentPage;
        appManager.currentPage = page || oldPage;
        appManager.cleanupCurrentPage();
        appManager.currentPage = oldPage;
    },
    
    // 模拟页面切换
    simulatePageSwitch: function(fromPage, toPage) {
        const appManager = window.dlmmApp?.appManager;
        if (!appManager) {
            console.error('❌ AppManager未初始化');
            return;
        }
        
        console.log(`🎭 模拟页面切换: ${fromPage} → ${toPage}`);
        appManager.currentPage = fromPage;
        appManager.navigateToPage(toPage);
    }
};

console.log('🛠️  页面切换调试工具已加载');
console.log('使用方法:');
console.log('  - window.pageDebugTools.checkPageState()');
console.log('  - window.pageDebugTools.forceReloadChainPosition()');
console.log('  - window.pageDebugTools.checkComponentIntegrity()');
console.log('  - window.pageDebugTools.cleanupPage()');
console.log('  - window.pageDebugTools.simulatePageSwitch("monitor", "chain-position")');
