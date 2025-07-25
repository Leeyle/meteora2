/**
 * 🎨 本地私钥钱包UI组件
 * 专门为本地私钥钱包管理系统设计的界面
 */

// 简化的格式化工具，内联实现
const Formatter = {
    address: {
        shortenAddress: (address) => {
            if (!address) return '';
            return `${address.slice(0, 6)}...${address.slice(-6)}`;
        }
    },
    number: {
        formatBalance: (balance, decimals = 6) => {
            if (!balance) return '0';
            return parseFloat(balance).toFixed(decimals);
        },
        formatTokenAmount: (amount, symbol = '', decimals = 6) => {
            if (!amount) return `0${symbol ? ' ' + symbol : ''}`;
            const formatted = parseFloat(amount).toFixed(decimals);
            return `${formatted}${symbol ? ' ' + symbol : ''}`;
        },
        formatUsdValue: (value) => {
            if (!value) return '$0.00';
            return `$${parseFloat(value).toFixed(2)}`;
        }
    },
    date: {
        formatRelativeTime: (timestamp) => {
            if (!timestamp) return '未知时间';
            const date = new Date(timestamp);

            // 格式化为 YYYY-MM-DD HH:mm:ss
            const year = date.getFullYear();
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const day = String(date.getDate()).padStart(2, '0');
            const hours = String(date.getHours()).padStart(2, '0');
            const minutes = String(date.getMinutes()).padStart(2, '0');
            const seconds = String(date.getSeconds()).padStart(2, '0');

            return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
        },
        formatDate: (timestamp) => {
            if (!timestamp) return '未知时间';
            const date = new Date(timestamp);

            // 格式化为 YYYY-MM-DD HH:mm:ss
            const year = date.getFullYear();
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const day = String(date.getDate()).padStart(2, '0');
            const hours = String(date.getHours()).padStart(2, '0');
            const minutes = String(date.getMinutes()).padStart(2, '0');
            const seconds = String(date.getSeconds()).padStart(2, '0');

            return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
        }
    }
};

// 简化的通知函数，内联实现
function showSuccess(title, message, options = {}) {
    if (window.dlmmApp && window.dlmmApp.notification) {
        window.dlmmApp.notification.showSuccess(title, message);
    } else {
        console.log(`[SUCCESS] ${title}: ${message}`);
    }
}

function showError(title, message, options = {}) {
    if (window.dlmmApp && window.dlmmApp.notification) {
        window.dlmmApp.notification.showError(title, message);
    } else {
        console.error(`[ERROR] ${title}: ${message}`);
    }
}

function showWarning(title, message, options = {}) {
    if (window.dlmmApp && window.dlmmApp.notification) {
        window.dlmmApp.notification.showWarning(title, message);
    } else {
        console.warn(`[WARNING] ${title}: ${message}`);
    }
}

function showInfo(title, message, options = {}) {
    if (window.dlmmApp && window.dlmmApp.notification) {
        window.dlmmApp.notification.showInfo(title, message);
    } else {
        console.info(`[INFO] ${title}: ${message}`);
    }
}

class WalletUI {
    constructor(walletCore) {
        this.walletCore = walletCore;
        this.container = null;
        this.isRendered = false;
        this.eventListeners = [];
        this.currentState = {
            hasWallet: false,
            isUnlocked: false,
            walletInfo: null,
            balances: { sol: 0, tokens: [] },
            isLoading: false
        };

        // 绑定核心事件
        this.bindCoreEvents();
    }

    /**
     * 绑定核心事件
     */
    bindCoreEvents() {
        this.walletCore.on('statusUpdated', (data) => {
            console.log('[WalletUI] 收到状态更新事件:', data);
            this.currentState = { ...this.currentState, ...data };
            console.log('[WalletUI] 更新后的状态:', this.currentState);
            this.updateDisplay();
        });

        this.walletCore.on('walletCreated', () => {
            showSuccess('钱包创建成功', '新钱包已成功创建并自动解锁');
            this.updateDisplay();
        });

        this.walletCore.on('walletImported', (data) => {
            const typeText = data.type === 'mnemonic' ? '助记词' : '私钥';
            showSuccess('钱包导入成功', `已通过${typeText}成功导入钱包`);
            this.updateDisplay();
        });

        this.walletCore.on('walletUnlocked', () => {
            showSuccess('钱包解锁成功', '钱包已解锁，可以开始使用');
            this.updateDisplay();
        });

        this.walletCore.on('walletLocked', () => {
            showInfo('钱包已锁定', '钱包已安全锁定');
            this.updateDisplay();
        });

        this.walletCore.on('walletDeleted', () => {
            showWarning('钱包已删除', '钱包数据已从系统中删除');
            this.updateDisplay();
        });

        this.walletCore.on('balancesUpdated', (balances) => {
            this.currentState.balances = balances;
            this.updateBalanceDisplay();
        });

        this.walletCore.on('loading', (data) => {
            this.currentState.isLoading = true;
            this.updateLoadingDisplay(data);
        });

        this.walletCore.on('loadingEnd', () => {
            this.currentState.isLoading = false;
            this.updateLoadingDisplay();
        });

        this.walletCore.on('error', (error) => {
            this.currentState.isLoading = false;
            this.updateLoadingDisplay();
            const errorMessages = {
                'create': '创建钱包失败',
                'import': '导入钱包失败',
                'unlock': '解锁钱包失败',
                'lock': '锁定钱包失败',
                'delete': '删除钱包失败',
                'refresh': '刷新数据失败'
            };
            const title = errorMessages[error.type] || '钱包操作失败';
            showError(title, error.error);
        });
    }

    /**
     * 渲染钱包UI
     */
    render(containerId) {
        const container = typeof containerId === 'string'
            ? document.getElementById(containerId)
            : containerId;

        if (!container) {
            console.error(`[WalletUI] 渲染失败: 容器元素 '#${containerId}' 未在DOM中找到。`);
            throw new Error(`容器元素未找到: ${containerId}`);
        }

        this.container = container;
        this.renderMainInterface();
        this.bindEvents();
        this.isRendered = true;

        // 首次渲染后立即更新显示
        this.updateDisplay();
    }

    /**
     * 渲染主界面
     */
    renderMainInterface() {
        const html = `
            <div class="local-wallet-container">
                <!-- 钱包状态区域 -->
                <div class="wallet-status-section" id="walletStatusSection">
                    ${this.renderWalletStatus()}
                </div>

                <!-- 钱包操作区域 -->
                <div class="wallet-actions-section" id="walletActionsSection">
                    ${this.renderWalletActions()}
                </div>

                <!-- 钱包信息区域 -->
                <div class="wallet-info-section" id="walletInfoSection" style="display: none;">
                    ${this.renderWalletInfo()}
                </div>

                <!-- 余额区域 -->
                <div class="wallet-balance-section" id="walletBalanceSection" style="display: none;">
                    ${this.renderBalanceSection()}
                </div>
            </div>

            <!-- 创建钱包模态框 -->
            ${this.renderCreateWalletModal()}

            <!-- 导入钱包模态框 -->
            ${this.renderImportWalletModal()}

            <!-- 解锁钱包模态框 -->
            ${this.renderUnlockWalletModal()}

            <!-- 删除钱包确认模态框 -->
            ${this.renderDeleteWalletModal()}

            <!-- 加载指示器 -->
            <div class="wallet-loading-overlay" id="walletLoadingOverlay" style="display: none;">
                <div class="loading-content">
                    <div class="loading-spinner"></div>
                    <div class="loading-text" id="loadingText">处理中...</div>
                </div>
            </div>
        `;

        this.container.innerHTML = html;
    }

    /**
     * 渲染钱包状态
     */
    renderWalletStatus() {
        return `
            <div class="wallet-status-card">
                <div class="status-header">
                    <h3>钱包状态</h3>
                </div>
                <div class="status-content">
                    <div class="status-indicator" id="walletStatusIndicator">
                        <span class="status-dot disconnected"></span>
                        <span class="status-text">未初始化</span>
                    </div>
                    <div class="wallet-address-display" id="walletAddressDisplay" style="display: none;">
                        <span class="address-label">地址:</span>
                        <span class="address-text" id="walletAddressText"></span>
                        <button class="btn-copy-address" id="copyAddressBtn" title="复制地址">
                            📋
                        </button>
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * 渲染钱包操作按钮
     */
    renderWalletActions() {
        return `
            <div class="wallet-actions-card">
                <div class="actions-header">
                    <h3>钱包操作</h3>
                </div>
                <div class="actions-content">
                    <!-- 未创建钱包时的操作 -->
                    <div class="no-wallet-actions" id="noWalletActions">
                        <button class="btn btn-primary" id="createWalletBtn">
                            <span class="btn-icon">➕</span>
                            创建新钱包
                        </button>
                        <button class="btn btn-secondary" id="importWalletBtn">
                            <span class="btn-icon">📥</span>
                            导入钱包
                        </button>
                    </div>

                    <!-- 钱包已创建时的操作 -->
                    <div class="wallet-exists-actions" id="walletExistsActions" style="display: none;">
                        <!-- 钱包已锁定 -->
                        <div class="locked-actions" id="lockedActions">
                            <button class="btn btn-primary" id="unlockWalletBtn">
                                <span class="btn-icon">🔓</span>
                                解锁钱包
                            </button>
                            <button class="btn btn-danger" id="deleteWalletBtn">
                                <span class="btn-icon">🗑️</span>
                                删除钱包
                            </button>
                        </div>

                        <!-- 钱包已解锁 -->
                        <div class="unlocked-actions" id="unlockedActions" style="display: none;">
                            <button class="btn btn-secondary" id="lockWalletBtn">
                                <span class="btn-icon">🔒</span>
                                锁定钱包
                            </button>
                            <button class="btn btn-info" id="refreshBalanceBtn">
                                <span class="btn-icon">🔄</span>
                                刷新余额
                            </button>
                            <button class="btn btn-danger" id="deleteUnlockedWalletBtn">
                                <span class="btn-icon">🗑️</span>
                                删除钱包
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * 渲染钱包信息
     */
    renderWalletInfo() {
        return `
            <div class="wallet-info-card">
                <div class="info-header">
                    <h3>钱包信息</h3>
                </div>
                <div class="info-content">
                    <div class="info-row">
                        <span class="info-label">地址:</span>
                        <span class="info-value" id="infoWalletAddress">--</span>
                    </div>
                    <div class="info-row">
                        <span class="info-label">加密状态:</span>
                        <span class="info-value" id="infoEncryptionStatus">--</span>
                    </div>
                    <div class="info-row">
                        <span class="info-label">创建时间:</span>
                        <span class="info-value" id="infoCreatedTime">--</span>
                    </div>
                    <div class="info-row">
                        <span class="info-label">最后使用:</span>
                        <span class="info-value" id="infoLastUsed">--</span>
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * 渲染余额区域
     */
    renderBalanceSection() {
        return `
            <div class="wallet-balance-card">
                <div class="balance-header">
                    <h3>账户余额</h3>
                    <span class="last-update" id="lastUpdateTime">--</span>
                </div>
                <div class="balance-content">
                    <!-- SOL余额 -->
                    <div class="balance-item sol-balance">
                        <div class="balance-info">
                            <span class="token-symbol">SOL</span>
                            <span class="token-name">Solana</span>
                        </div>
                        <div class="balance-amount">
                            <span class="amount" id="solBalanceAmount">0.000000</span>
                            <span class="fiat-value" id="solBalanceFiat">≈ $0.00</span>
                        </div>
                    </div>

                    <!-- 代币列表 -->
                    <div class="token-list" id="tokenBalanceList">
                        <!-- 代币余额项将在这里动态生成 -->
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * 渲染创建钱包模态框
     */
    renderCreateWalletModal() {
        return `
            <div class="wallet-modal" id="createWalletModal" style="display: none;">
                <div class="modal-backdrop"></div>
                <div class="modal-content">
                    <div class="modal-header">
                        <h3>创建新钱包</h3>
                        <button class="modal-close" data-action="closeModal" data-modal="createWalletModal">×</button>
                    </div>
                    <div class="modal-body">
                        <form id="createWalletForm">
                            <div class="form-group">
                                <label for="createPassword">设置钱包密码</label>
                                <input type="password" id="createPassword" class="form-control" 
                                       placeholder="请输入至少8位的密码" minlength="8" required>
                                <div class="form-hint">密码用于加密保护您的钱包，请妥善保管</div>
                            </div>
                            <div class="form-group">
                                <label for="confirmPassword">确认密码</label>
                                <input type="password" id="confirmPassword" class="form-control" 
                                       placeholder="请再次输入密码" minlength="8" required>
                            </div>
                            <div class="form-actions">
                                <button type="button" class="btn btn-secondary" data-action="closeModal" data-modal="createWalletModal">
                                    取消
                                </button>
                                <button type="submit" class="btn btn-primary">
                                    创建钱包
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * 渲染导入钱包模态框
     */
    renderImportWalletModal() {
        return `
            <div class="wallet-modal" id="importWalletModal" style="display: none;">
                <div class="modal-backdrop"></div>
                <div class="modal-content">
                    <div class="modal-header">
                        <h3>导入钱包</h3>
                        <button class="modal-close" data-action="closeModal" data-modal="importWalletModal">×</button>
                    </div>
                    <div class="modal-body">
                        <!-- 导入方式选择 -->
                        <div class="import-type-tabs">
                            <button class="tab-btn active" data-tab="mnemonic">助记词导入</button>
                            <button class="tab-btn" data-tab="privatekey">私钥导入</button>
                        </div>

                        <!-- 助记词导入 -->
                        <div class="tab-content active" id="mnemonicTab">
                            <form id="importMnemonicForm">
                                <div class="form-group">
                                    <label for="importMnemonic">助记词</label>
                                    <textarea id="importMnemonic" class="form-control" rows="3" 
                                              placeholder="请输入12或24个助记词，用空格分隔" required></textarea>
                                </div>
                                <div class="form-group">
                                    <label for="importMnemonicPassword">设置钱包密码</label>
                                    <input type="password" id="importMnemonicPassword" class="form-control" 
                                           placeholder="至少8位密码" minlength="8" required>
                                </div>
                                <div class="form-actions">
                                    <button type="button" class="btn btn-secondary" data-action="closeModal" data-modal="importWalletModal">
                                        取消
                                    </button>
                                    <button type="submit" class="btn btn-primary">
                                        导入钱包
                                    </button>
                                </div>
                            </form>
                        </div>

                        <!-- 私钥导入 -->
                        <div class="tab-content" id="privatekeyTab">
                            <form id="importPrivateKeyForm">
                                <div class="form-group">
                                    <label for="importPrivateKey">私钥</label>
                                    <textarea id="importPrivateKey" class="form-control" rows="2" 
                                              placeholder="请输入Base58编码的私钥" required></textarea>
                                </div>
                                <div class="form-group">
                                    <label for="importPrivateKeyPassword">设置钱包密码</label>
                                    <input type="password" id="importPrivateKeyPassword" class="form-control" 
                                           placeholder="至少8位密码" minlength="8" required>
                                </div>
                                <div class="form-actions">
                                    <button type="button" class="btn btn-secondary" data-action="closeModal" data-modal="importWalletModal">
                                        取消
                                    </button>
                                    <button type="submit" class="btn btn-primary">
                                        导入钱包
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * 渲染解锁钱包模态框
     */
    renderUnlockWalletModal() {
        return `
            <div class="wallet-modal" id="unlockWalletModal" style="display: none;">
                <div class="modal-backdrop"></div>
                <div class="modal-content">
                    <div class="modal-header">
                        <h3>解锁钱包</h3>
                        <button class="modal-close" data-action="closeModal" data-modal="unlockWalletModal">×</button>
                    </div>
                    <div class="modal-body">
                        <form id="unlockWalletForm">
                            <div class="form-group">
                                <label for="unlockPassword">钱包密码</label>
                                <input type="password" id="unlockPassword" class="form-control" 
                                       placeholder="请输入钱包密码" required>
                                <div class="form-hint">输入您设置的钱包密码来解锁钱包</div>
                            </div>
                            <div class="form-actions">
                                <button type="button" class="btn btn-secondary" data-action="closeModal" data-modal="unlockWalletModal">
                                    取消
                                </button>
                                <button type="submit" class="btn btn-primary">
                                    解锁钱包
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * 渲染删除钱包模态框
     */
    renderDeleteWalletModal() {
        return `
            <div class="wallet-modal" id="deleteWalletModal" style="display: none;">
                <div class="modal-backdrop"></div>
                <div class="modal-content">
                    <div class="modal-header">
                        <h3>⚠️ 删除钱包</h3>
                        <button class="modal-close" data-action="closeModal" data-modal="deleteWalletModal">×</button>
                    </div>
                    <div class="modal-body">
                        <div class="warning-message">
                            <p><strong>警告：此操作无法撤销！</strong></p>
                            <p>删除钱包将永久移除本地存储的私钥数据。如果您没有备份助记词或私钥，将无法恢复钱包。</p>
                        </div>
                        <form id="deleteWalletForm">
                            <div class="form-group">
                                <label for="deletePassword">请输入钱包密码确认删除</label>
                                <input type="password" id="deletePassword" class="form-control" 
                                       placeholder="输入密码以确认删除" required>
                            </div>
                            <div class="form-actions">
                                <button type="button" class="btn btn-secondary" data-action="closeModal" data-modal="deleteWalletModal">
                                    取消
                                </button>
                                <button type="submit" class="btn btn-danger">
                                    确认删除
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * 绑定事件
     */
    bindEvents() {
        if (!this.container) return;

        // 主要操作按钮
        this.bindButton('createWalletBtn', () => this.showModal('createWalletModal'));
        this.bindButton('importWalletBtn', () => this.showModal('importWalletModal'));
        this.bindButton('unlockWalletBtn', () => this.showModal('unlockWalletModal'));
        this.bindButton('deleteWalletBtn', () => this.showModal('deleteWalletModal'));
        this.bindButton('deleteUnlockedWalletBtn', () => this.showModal('deleteWalletModal'));
        this.bindButton('lockWalletBtn', () => this.handleLockWallet());
        this.bindButton('refreshBalanceBtn', () => this.handleRefreshBalance());
        this.bindButton('copyAddressBtn', () => this.handleCopyAddress());

        // 模态框事件
        this.bindModalEvents();

        // 表单事件
        this.bindFormEvents();

        // 导入方式切换
        this.bindImportTabs();
    }

    /**
     * 绑定按钮事件
     */
    bindButton(buttonId, handler) {
        const button = this.container.querySelector(`#${buttonId}`);
        if (button) {
            const listener = (e) => {
                e.preventDefault();
                handler();
            };
            button.addEventListener('click', listener);
            this.eventListeners.push({ element: button, event: 'click', listener });
        }
    }

    /**
     * 绑定模态框事件
     */
    bindModalEvents() {
        // 模态框关闭事件
        const closeButtons = this.container.querySelectorAll('[data-action="closeModal"]');
        closeButtons.forEach(button => {
            const listener = (e) => {
                e.preventDefault();
                const modalId = button.getAttribute('data-modal');
                this.hideModal(modalId);
            };
            button.addEventListener('click', listener);
            this.eventListeners.push({ element: button, event: 'click', listener });
        });

        // 背景点击关闭
        const backdrops = this.container.querySelectorAll('.modal-backdrop');
        backdrops.forEach(backdrop => {
            const listener = () => {
                const modal = backdrop.closest('.wallet-modal');
                if (modal) {
                    modal.style.display = 'none';
                }
            };
            backdrop.addEventListener('click', listener);
            this.eventListeners.push({ element: backdrop, event: 'click', listener });
        });
    }

    /**
     * 绑定表单事件
     */
    bindFormEvents() {
        // 创建钱包表单
        const createForm = this.container.querySelector('#createWalletForm');
        if (createForm) {
            const listener = (e) => this.handleCreateWallet(e);
            createForm.addEventListener('submit', listener);
            this.eventListeners.push({ element: createForm, event: 'submit', listener });
        }

        // 助记词导入表单
        const mnemonicForm = this.container.querySelector('#importMnemonicForm');
        if (mnemonicForm) {
            const listener = (e) => this.handleImportMnemonic(e);
            mnemonicForm.addEventListener('submit', listener);
            this.eventListeners.push({ element: mnemonicForm, event: 'submit', listener });
        }

        // 私钥导入表单
        const privateKeyForm = this.container.querySelector('#importPrivateKeyForm');
        if (privateKeyForm) {
            const listener = (e) => this.handleImportPrivateKey(e);
            privateKeyForm.addEventListener('submit', listener);
            this.eventListeners.push({ element: privateKeyForm, event: 'submit', listener });
        }

        // 解锁钱包表单
        const unlockForm = this.container.querySelector('#unlockWalletForm');
        if (unlockForm) {
            const listener = (e) => this.handleUnlockWallet(e);
            unlockForm.addEventListener('submit', listener);
            this.eventListeners.push({ element: unlockForm, event: 'submit', listener });
        }

        // 删除钱包表单
        const deleteForm = this.container.querySelector('#deleteWalletForm');
        if (deleteForm) {
            const listener = (e) => this.handleDeleteWallet(e);
            deleteForm.addEventListener('submit', listener);
            this.eventListeners.push({ element: deleteForm, event: 'submit', listener });
        }
    }

    /**
     * 绑定导入方式切换事件
     */
    bindImportTabs() {
        const tabButtons = this.container.querySelectorAll('.import-type-tabs .tab-btn');
        const tabContents = this.container.querySelectorAll('.tab-content');

        tabButtons.forEach(button => {
            const listener = () => {
                const targetTab = button.getAttribute('data-tab');

                // 更新按钮状态
                tabButtons.forEach(btn => btn.classList.remove('active'));
                button.classList.add('active');

                // 更新内容显示
                tabContents.forEach(content => {
                    content.classList.remove('active');
                    if (content.id === `${targetTab}Tab`) {
                        content.classList.add('active');
                    }
                });
            };
            button.addEventListener('click', listener);
            this.eventListeners.push({ element: button, event: 'click', listener });
        });
    }

    /**
     * 更新显示
     */
    updateDisplay() {
        if (!this.isRendered) {
            console.log('[WalletUI] 跳过显示更新 - UI未渲染');
            return;
        }

        console.log('[WalletUI] 开始更新显示，当前状态:', this.currentState);
        this.updateStatusDisplay();
        this.updateActionsDisplay();
        this.updateInfoDisplay();
        this.updateBalanceDisplay();
        console.log('[WalletUI] 显示更新完成');
    }

    /**
     * 更新状态显示
     */
    updateStatusDisplay() {
        const statusIndicator = this.container.querySelector('#walletStatusIndicator');
        const addressDisplay = this.container.querySelector('#walletAddressDisplay');
        const addressText = this.container.querySelector('#walletAddressText');

        if (!statusIndicator) return;

        if (!this.currentState.hasWallet) {
            statusIndicator.innerHTML = `
                <span class="status-dot no-wallet"></span>
                <span class="status-text">无钱包</span>
            `;
            if (addressDisplay) addressDisplay.style.display = 'none';
        } else if (this.currentState.isUnlocked) {
            statusIndicator.innerHTML = `
                <span class="status-dot unlocked"></span>
                <span class="status-text">已解锁</span>
            `;
            if (addressDisplay && addressText && this.currentState.walletInfo) {
                addressDisplay.style.display = 'flex';
                addressText.textContent = Formatter.address.shortenAddress(this.currentState.walletInfo.address);
            }
        } else {
            statusIndicator.innerHTML = `
                <span class="status-dot locked"></span>
                <span class="status-text">已锁定</span>
            `;
            if (addressDisplay) addressDisplay.style.display = 'none';
        }
    }

    /**
     * 更新操作按钮显示
     */
    updateActionsDisplay() {
        const noWalletActions = this.container.querySelector('#noWalletActions');
        const walletExistsActions = this.container.querySelector('#walletExistsActions');
        const lockedActions = this.container.querySelector('#lockedActions');
        const unlockedActions = this.container.querySelector('#unlockedActions');

        if (!this.currentState.hasWallet) {
            if (noWalletActions) noWalletActions.style.display = 'block';
            if (walletExistsActions) walletExistsActions.style.display = 'none';
        } else {
            if (noWalletActions) noWalletActions.style.display = 'none';
            if (walletExistsActions) walletExistsActions.style.display = 'block';

            if (this.currentState.isUnlocked) {
                if (lockedActions) lockedActions.style.display = 'none';
                if (unlockedActions) unlockedActions.style.display = 'block';
            } else {
                if (lockedActions) lockedActions.style.display = 'block';
                if (unlockedActions) unlockedActions.style.display = 'none';
            }
        }
    }

    /**
     * 更新钱包信息显示
     */
    updateInfoDisplay() {
        const infoSection = this.container.querySelector('#walletInfoSection');

        if (!this.currentState.hasWallet || !this.currentState.walletInfo) {
            if (infoSection) infoSection.style.display = 'none';
            return;
        }

        if (infoSection) infoSection.style.display = 'block';

        const { walletInfo } = this.currentState;

        this.updateElementText('#infoWalletAddress', Formatter.address.shortenAddress(walletInfo.address));
        this.updateElementText('#infoEncryptionStatus', walletInfo.isEncrypted ? '已加密' : '未加密');
        this.updateElementText('#infoCreatedTime', Formatter.date.formatDate(walletInfo.createdAt));
        this.updateElementText('#infoLastUsed', Formatter.date.formatRelativeTime(walletInfo.lastUsed));
    }

    /**
     * 更新余额显示
     */
    updateBalanceDisplay() {
        const balanceSection = this.container.querySelector('#walletBalanceSection');

        if (!this.currentState.isUnlocked) {
            if (balanceSection) balanceSection.style.display = 'none';
            return;
        }

        if (balanceSection) balanceSection.style.display = 'block';

        // 更新SOL余额
        const { balances } = this.currentState;
        if (balances && balances.sol && balances.sol.balance !== undefined) {
            this.updateElementText('#solBalanceAmount', Formatter.number.formatTokenAmount(balances.sol.balance, '', 6));
            // TODO: 添加法币价值计算
            this.updateElementText('#solBalanceFiat', '≈ $0.00');
        }

        // 更新代币列表
        this.updateTokenList(balances.tokens || []);

        // 更新最后更新时间
        this.updateElementText('#lastUpdateTime', `最后更新: ${new Date().toLocaleTimeString()}`);
    }

    /**
     * 更新代币列表
     */
    updateTokenList(tokens) {
        const tokenList = this.container.querySelector('#tokenBalanceList');
        if (!tokenList) return;

        if (!tokens || tokens.length === 0) {
            tokenList.innerHTML = '<div class="no-tokens">暂无其他代币</div>';
            return;
        }

        const tokenHtml = tokens.map(token => `
            <div class="balance-item token-balance">
                <div class="balance-info">
                    <span class="token-symbol">${token.symbol || 'UNKNOWN'}</span>
                    <span class="token-name">${token.name || token.mint.substring(0, 8) + '...'}</span>
                </div>
                <div class="balance-amount">
                    <span class="amount">${Formatter.number.formatTokenAmount(token.balance, '', token.decimals || 6)}</span>
                    <span class="fiat-value">≈ $0.00</span>
                </div>
            </div>
        `).join('');

        tokenList.innerHTML = tokenHtml;
    }

    /**
     * 更新加载显示
     */
    updateLoadingDisplay(loadingData = null) {
        const loadingOverlay = this.container.querySelector('#walletLoadingOverlay');
        const loadingText = this.container.querySelector('#loadingText');

        if (!loadingOverlay) return;

        if (this.currentState.isLoading && loadingData) {
            loadingOverlay.style.display = 'flex';
            if (loadingText) {
                loadingText.textContent = loadingData.message || '处理中...';
            }
        } else {
            loadingOverlay.style.display = 'none';
        }
    }

    /**
     * 更新元素文本
     */
    updateElementText(selector, text) {
        const element = this.container.querySelector(selector);
        if (element) {
            element.textContent = text;
        }
    }

    /**
     * 显示模态框
     */
    showModal(modalId) {
        const modal = this.container.querySelector(`#${modalId}`);
        if (modal) {
            modal.style.display = 'flex';
        }
    }

    /**
     * 隐藏模态框
     */
    hideModal(modalId) {
        const modal = this.container.querySelector(`#${modalId}`);
        if (modal) {
            modal.style.display = 'none';
            // 清理表单
            const forms = modal.querySelectorAll('form');
            forms.forEach(form => form.reset());
        }
    }

    /**
     * 处理创建钱包
     */
    async handleCreateWallet(e) {
        e.preventDefault();
        const form = e.target;
        const password = form.createPassword.value;
        const confirmPassword = form.confirmPassword.value;

        if (password !== confirmPassword) {
            showError('密码确认失败', '两次输入的密码不一致');
            return;
        }

        if (password.length < 8) {
            showError('密码强度不够', '密码长度至少8位');
            return;
        }

        try {
            await this.walletCore.createWallet(password);
            this.hideModal('createWalletModal');
        } catch (error) {
            // 错误已由核心组件处理
        }
    }

    /**
     * 处理导入助记词
     */
    async handleImportMnemonic(e) {
        e.preventDefault();
        const form = e.target;
        const mnemonic = form.importMnemonic.value.trim();
        const password = form.importMnemonicPassword.value;

        if (!mnemonic) {
            showError('助记词不能为空', '请输入有效的助记词');
            return;
        }

        if (password.length < 8) {
            showError('密码强度不够', '密码长度至少8位');
            return;
        }

        try {
            await this.walletCore.importWalletByMnemonic(mnemonic, password);
            this.hideModal('importWalletModal');
        } catch (error) {
            // 错误已由核心组件处理
        }
    }

    /**
     * 处理导入私钥
     */
    async handleImportPrivateKey(e) {
        e.preventDefault();
        const form = e.target;
        const privateKey = form.importPrivateKey.value.trim();
        const password = form.importPrivateKeyPassword.value;

        if (!privateKey) {
            showError('私钥不能为空', '请输入有效的私钥');
            return;
        }

        if (password.length < 8) {
            showError('密码强度不够', '密码长度至少8位');
            return;
        }

        try {
            await this.walletCore.importWalletByPrivateKey(privateKey, password);
            this.hideModal('importWalletModal');
        } catch (error) {
            // 错误已由核心组件处理
        }
    }

    /**
     * 处理解锁钱包
     */
    async handleUnlockWallet(e) {
        e.preventDefault();
        const form = e.target;
        const password = form.unlockPassword.value;

        if (!password) {
            showError('密码不能为空', '请输入钱包密码');
            return;
        }

        try {
            await this.walletCore.unlockWallet(password);
            this.hideModal('unlockWalletModal');
        } catch (error) {
            // 错误已由核心组件处理
        }
    }

    /**
     * 处理删除钱包
     */
    async handleDeleteWallet(e) {
        e.preventDefault();
        const form = e.target;
        const password = form.deletePassword.value;

        if (!password) {
            showError('密码不能为空', '请输入钱包密码确认删除');
            return;
        }

        try {
            await this.walletCore.deleteWallet(password);
            this.hideModal('deleteWalletModal');
        } catch (error) {
            // 错误已由核心组件处理
        }
    }

    /**
     * 处理锁定钱包
     */
    async handleLockWallet() {
        try {
            await this.walletCore.lockWallet();
        } catch (error) {
            // 错误已由核心组件处理
        }
    }

    /**
     * 处理刷新余额
     */
    async handleRefreshBalance() {
        try {
            await this.walletCore.refresh();
            showInfo('刷新完成', '余额数据已更新');
        } catch (error) {
            // 错误已由核心组件处理
        }
    }

    /**
     * 处理复制地址
     */
    async handleCopyAddress() {
        const address = this.walletCore.getWalletAddress();
        if (!address) {
            showError('复制失败', '无法获取钱包地址');
            return;
        }

        try {
            await navigator.clipboard.writeText(address);
            showSuccess('复制成功', '钱包地址已复制到剪贴板');
        } catch (error) {
            // 降级到传统方法
            const textArea = document.createElement('textarea');
            textArea.value = address;
            document.body.appendChild(textArea);
            textArea.select();
            document.execCommand('copy');
            document.body.removeChild(textArea);
            showSuccess('复制成功', '钱包地址已复制到剪贴板');
        }
    }

    /**
     * 销毁UI组件
     */
    destroy() {
        // 清理事件监听器
        this.eventListeners.forEach(({ element, event, listener }) => {
            element.removeEventListener(event, listener);
        });
        this.eventListeners = [];

        // 清理容器
        if (this.container) {
            this.container.innerHTML = '';
        }

        this.isRendered = false;
        console.log('[WalletUI] 钱包UI组件已销毁');
    }
}

// 导出到全局
window.WalletUI = WalletUI;
console.log('[WalletUI] 本地私钥钱包UI组件已加载'); 