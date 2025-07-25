/**
 * 📝 钱包表单组件
 * 负责钱包相关表单的渲染和处理，包括创建、导入、解锁等表单
 */

class WalletForms {
    constructor(walletCore) {
        this.walletCore = walletCore;
        this.modals = {};
        this.validators = new WalletValidators();
    }

    /**
     * 初始化表单组件
     */
    init() {
        this.createModals();
        this.bindEvents();
    }

    /**
     * 创建所有模态框
     */
    createModals() {
        // 创建钱包模态框
        this.modals.create = this.createModal('createWalletModal', '创建新钱包', this.generateCreateWalletForm());

        // 导入钱包模态框
        this.modals.import = this.createModal('importWalletModal', '导入钱包', this.generateImportWalletForm());

        // 解锁钱包模态框
        this.modals.unlock = this.createModal('unlockWalletModal', '解锁钱包', this.generateUnlockWalletForm());

        // 添加到页面
        Object.values(this.modals).forEach(modal => {
            document.body.appendChild(modal);
        });
    }

    /**
     * 创建模态框基础结构
     */
    createModal(id, title, content) {
        const modal = document.createElement('div');
        modal.id = id;
        modal.className = 'modal';
        modal.innerHTML = `
            <div class="modal-backdrop" data-dismiss="modal"></div>
            <div class="modal-container">
                <div class="modal-header">
                    <h3>${title}</h3>
                    <button class="modal-close" data-dismiss="modal">&times;</button>
                </div>
                <div class="modal-body">
                    ${content}
                </div>
            </div>
        `;
        return modal;
    }

    /**
     * 生成创建钱包表单
     */
    generateCreateWalletForm() {
        return `
            <form id="createWalletForm">
                <div class="form-group">
                    <label for="newWalletPassword">钱包密码 <span class="required">*</span></label>
                    <input type="password" id="newWalletPassword" class="form-control" 
                           placeholder="请输入安全密码（至少8位）" required>
                    <div class="form-help">密码用于加密钱包文件，请务必记住</div>
                </div>
                <div class="form-group">
                    <label for="confirmPassword">确认密码 <span class="required">*</span></label>
                    <input type="password" id="confirmPassword" class="form-control" 
                           placeholder="请再次输入密码" required>
                    <div class="error-message" id="passwordError"></div>
                </div>
                <div class="form-group">
                    <label for="customMnemonic">自定义助记词（可选）</label>
                    <textarea id="customMnemonic" class="form-control" rows="3"
                             placeholder="留空将自动生成12个单词的助记词"></textarea>
                    <div class="form-help">如果提供助记词，请确保是12个有效的英文单词</div>
                </div>
                <div class="form-actions">
                    <button type="submit" class="btn btn-primary">
                        <span class="btn-icon">✨</span>
                        创建钱包
                    </button>
                    <button type="button" class="btn btn-secondary" data-dismiss="modal">取消</button>
                </div>
            </form>
        `;
    }

    /**
     * 生成导入钱包表单
     */
    generateImportWalletForm() {
        return `
            <div class="import-tabs">
                <button class="tab-btn active" data-tab="mnemonic">助记词导入</button>
                <button class="tab-btn" data-tab="privatekey">私钥导入</button>
            </div>
            
            <div id="mnemonicTab" class="tab-content active">
                <form id="importMnemonicForm">
                    <div class="form-group">
                        <label for="importMnemonic">助记词 <span class="required">*</span></label>
                        <textarea id="importMnemonic" class="form-control" rows="3"
                                 placeholder="请输入12个单词的助记词，用空格分隔" required></textarea>
                        <div class="form-help">请确保助记词正确，顺序不能错</div>
                        <div class="error-message" id="mnemonicError"></div>
                    </div>
                    <div class="form-group">
                        <label for="importMnemonicPassword">钱包密码 <span class="required">*</span></label>
                        <input type="password" id="importMnemonicPassword" class="form-control" 
                               placeholder="请输入新的钱包密码" required>
                        <div class="form-help">设置用于本地加密的密码</div>
                    </div>
                    <div class="form-actions">
                        <button type="submit" class="btn btn-primary">
                            <span class="btn-icon">📥</span>
                            导入钱包
                        </button>
                        <button type="button" class="btn btn-secondary" data-dismiss="modal">取消</button>
                    </div>
                </form>
            </div>

            <div id="privatekeyTab" class="tab-content">
                <form id="importPrivateKeyForm">
                    <div class="form-group">
                        <label for="importPrivateKey">私钥 <span class="required">*</span></label>
                        <textarea id="importPrivateKey" class="form-control" rows="2"
                                 placeholder="请输入Base58编码的私钥" required></textarea>
                        <div class="form-help">私钥是一串长字符串，请确保完整输入</div>
                        <div class="error-message" id="privateKeyError"></div>
                    </div>
                    <div class="form-group">
                        <label for="importPrivateKeyPassword">钱包密码 <span class="required">*</span></label>
                        <input type="password" id="importPrivateKeyPassword" class="form-control" 
                               placeholder="请输入新的钱包密码" required>
                        <div class="form-help">设置用于本地加密的密码</div>
                    </div>
                    <div class="form-actions">
                        <button type="submit" class="btn btn-primary">
                            <span class="btn-icon">🔑</span>
                            导入钱包
                        </button>
                        <button type="button" class="btn btn-secondary" data-dismiss="modal">取消</button>
                    </div>
                </form>
            </div>
        `;
    }

    /**
     * 生成解锁钱包表单
     */
    generateUnlockWalletForm() {
        return `
            <form id="unlockWalletForm">
                <div class="form-group">
                    <label for="unlockPassword">钱包密码 <span class="required">*</span></label>
                    <input type="password" id="unlockPassword" class="form-control" 
                           placeholder="请输入钱包密码" required autofocus>
                    <div class="form-help">输入创建钱包时设置的密码</div>
                    <div class="error-message" id="unlockError"></div>
                </div>
                <div class="form-actions">
                    <button type="submit" class="btn btn-primary">
                        <span class="btn-icon">🔓</span>
                        解锁钱包
                    </button>
                    <button type="button" class="btn btn-secondary" data-dismiss="modal">取消</button>
                </div>
            </form>
        `;
    }

    /**
     * 绑定事件处理器
     */
    bindEvents() {
        // 绑定钱包操作按钮
        this.bindActionButtons();

        // 绑定表单提交事件
        this.bindFormSubmits();

        // 绑定标签页切换
        this.bindTabSwitching();

        // 绑定模态框关闭
        this.bindModalClose();

        // 绑定实时验证
        this.bindRealTimeValidation();
    }

    /**
     * 绑定操作按钮事件
     */
    bindActionButtons() {
        document.addEventListener('click', (e) => {
            if (e.target.id === 'createWalletBtn') {
                this.showModal('createWalletModal');
            } else if (e.target.id === 'importWalletBtn') {
                this.showModal('importWalletModal');
            } else if (e.target.id === 'unlockWalletBtn') {
                this.showModal('unlockWalletModal');
            } else if (e.target.id === 'lockWalletBtn') {
                this.handleLockWallet();
            }
        });
    }

    /**
     * 绑定表单提交事件
     */
    bindFormSubmits() {
        document.addEventListener('submit', async (e) => {
            if (e.target.id === 'createWalletForm') {
                e.preventDefault();
                await this.handleCreateWallet(e.target);
            } else if (e.target.id === 'importMnemonicForm') {
                e.preventDefault();
                await this.handleImportMnemonic(e.target);
            } else if (e.target.id === 'importPrivateKeyForm') {
                e.preventDefault();
                await this.handleImportPrivateKey(e.target);
            } else if (e.target.id === 'unlockWalletForm') {
                e.preventDefault();
                await this.handleUnlockWallet(e.target);
            }
        });
    }

    /**
     * 绑定标签页切换
     */
    bindTabSwitching() {
        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('tab-btn')) {
                this.switchTab(e.target.dataset.tab);
            }
        });
    }

    /**
     * 绑定模态框关闭
     */
    bindModalClose() {
        document.addEventListener('click', (e) => {
            if (e.target.hasAttribute('data-dismiss') && e.target.dataset.dismiss === 'modal') {
                const modal = e.target.closest('.modal');
                if (modal) this.hideModal(modal.id);
            }
        });
    }

    /**
     * 绑定实时验证
     */
    bindRealTimeValidation() {
        document.addEventListener('input', (e) => {
            if (e.target.id === 'confirmPassword') {
                this.validatePasswordMatch();
            } else if (e.target.id === 'importMnemonic') {
                this.validateMnemonic();
            } else if (e.target.id === 'importPrivateKey') {
                this.validatePrivateKey();
            }
        });
    }

    /**
     * 处理创建钱包
     */
    async handleCreateWallet(form) {
        const password = form.newWalletPassword.value;
        const confirmPassword = form.confirmPassword.value;
        const mnemonic = form.customMnemonic.value.trim();

        // 验证输入
        if (!this.validators.validatePassword(password)) {
            this.showFieldError('passwordError', '密码长度至少8位');
            return;
        }

        if (password !== confirmPassword) {
            this.showFieldError('passwordError', '密码确认不匹配');
            return;
        }

        if (mnemonic && !this.validators.validateMnemonic(mnemonic)) {
            this.showFieldError('passwordError', '助记词格式不正确');
            return;
        }

        try {
            this.setFormLoading(form, true);
            await this.walletCore.createWallet(password, mnemonic || null);
            this.hideModal('createWalletModal');
            this.showNotification('钱包创建成功！', 'success');
            form.reset();
        } catch (error) {
            this.showFieldError('passwordError', error.message);
        } finally {
            this.setFormLoading(form, false);
        }
    }

    /**
     * 处理助记词导入
     */
    async handleImportMnemonic(form) {
        const mnemonic = form.importMnemonic.value.trim();
        const password = form.importMnemonicPassword.value;

        if (!this.validators.validateMnemonic(mnemonic)) {
            this.showFieldError('mnemonicError', '请输入正确的12个单词助记词');
            return;
        }

        if (!this.validators.validatePassword(password)) {
            this.showFieldError('mnemonicError', '密码长度至少8位');
            return;
        }

        try {
            this.setFormLoading(form, true);
            await this.walletCore.importWallet(mnemonic, password);
            this.hideModal('importWalletModal');
            this.showNotification('钱包导入成功！', 'success');
            form.reset();
        } catch (error) {
            this.showFieldError('mnemonicError', error.message);
        } finally {
            this.setFormLoading(form, false);
        }
    }

    /**
     * 处理私钥导入
     */
    async handleImportPrivateKey(form) {
        const privateKey = form.importPrivateKey.value.trim();
        const password = form.importPrivateKeyPassword.value;

        if (!this.validators.validatePrivateKey(privateKey)) {
            this.showFieldError('privateKeyError', '私钥格式不正确');
            return;
        }

        if (!this.validators.validatePassword(password)) {
            this.showFieldError('privateKeyError', '密码长度至少8位');
            return;
        }

        try {
            this.setFormLoading(form, true);
            await this.walletCore.importWalletByKey(privateKey, password);
            this.hideModal('importWalletModal');
            this.showNotification('钱包导入成功！', 'success');
            form.reset();
        } catch (error) {
            this.showFieldError('privateKeyError', error.message);
        } finally {
            this.setFormLoading(form, false);
        }
    }

    /**
     * 处理解锁钱包
     */
    async handleUnlockWallet(form) {
        const password = form.unlockPassword.value;

        if (!password) {
            this.showFieldError('unlockError', '请输入密码');
            return;
        }

        try {
            this.setFormLoading(form, true);
            await this.walletCore.unlockWallet(password);
            this.hideModal('unlockWalletModal');
            this.showNotification('钱包解锁成功！', 'success');
            form.reset();
        } catch (error) {
            this.showFieldError('unlockError', error.message);
        } finally {
            this.setFormLoading(form, false);
        }
    }

    /**
     * 处理锁定钱包
     */
    async handleLockWallet() {
        if (!confirm('确定要锁定钱包吗？锁定后需要重新输入密码才能使用。')) {
            return;
        }

        try {
            await this.walletCore.lockWallet();
            this.showNotification('钱包已锁定', 'success');
        } catch (error) {
            this.showNotification('锁定钱包失败: ' + error.message, 'error');
        }
    }

    /**
     * 验证密码匹配
     */
    validatePasswordMatch() {
        const password = document.getElementById('newWalletPassword')?.value;
        const confirmPassword = document.getElementById('confirmPassword')?.value;

        if (confirmPassword && password !== confirmPassword) {
            this.showFieldError('passwordError', '密码确认不匹配');
            return false;
        } else {
            this.clearFieldError('passwordError');
            return true;
        }
    }

    /**
     * 验证助记词
     */
    validateMnemonic() {
        const mnemonic = document.getElementById('importMnemonic')?.value.trim();

        if (mnemonic && !this.validators.validateMnemonic(mnemonic)) {
            this.showFieldError('mnemonicError', '请输入12个有效的英文单词');
            return false;
        } else {
            this.clearFieldError('mnemonicError');
            return true;
        }
    }

    /**
     * 验证私钥
     */
    validatePrivateKey() {
        const privateKey = document.getElementById('importPrivateKey')?.value.trim();

        if (privateKey && !this.validators.validatePrivateKey(privateKey)) {
            this.showFieldError('privateKeyError', '私钥格式不正确');
            return false;
        } else {
            this.clearFieldError('privateKeyError');
            return true;
        }
    }

    /**
     * 切换标签页
     */
    switchTab(tabName) {
        // 切换按钮状态
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tab === tabName);
        });

        // 切换内容
        document.querySelectorAll('.tab-content').forEach(content => {
            content.classList.toggle('active', content.id === tabName + 'Tab');
        });
    }

    /**
     * 显示模态框
     */
    showModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.style.display = 'flex';
            setTimeout(() => modal.classList.add('show'), 10);

            // 自动聚焦到第一个输入框
            const firstInput = modal.querySelector('input, textarea');
            if (firstInput) firstInput.focus();
        }
    }

    /**
     * 隐藏模态框
     */
    hideModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.classList.remove('show');
            setTimeout(() => modal.style.display = 'none', 300);

            // 清除错误消息
            modal.querySelectorAll('.error-message').forEach(el => el.textContent = '');

            // 重置表单
            const forms = modal.querySelectorAll('form');
            forms.forEach(form => form.reset());
        }
    }

    /**
     * 设置表单加载状态
     */
    setFormLoading(form, loading) {
        const submitBtn = form.querySelector('button[type="submit"]');
        if (submitBtn) {
            submitBtn.disabled = loading;
            submitBtn.innerHTML = loading
                ? '<span class="spinner"></span> 处理中...'
                : submitBtn.innerHTML.replace(/<span class="spinner"><\/span> 处理中\.\.\./, submitBtn.querySelector('.btn-icon').outerHTML + ' ' + submitBtn.textContent.split(' ').slice(-1)[0]);
        }
    }

    /**
     * 显示字段错误
     */
    showFieldError(elementId, message) {
        const element = document.getElementById(elementId);
        if (element) {
            element.textContent = message;
            element.style.display = 'block';
        }
    }

    /**
     * 清除字段错误
     */
    clearFieldError(elementId) {
        const element = document.getElementById(elementId);
        if (element) {
            element.textContent = '';
            element.style.display = 'none';
        }
    }

    /**
     * 显示通知
     */
    showNotification(message, type = 'info') {
        if (window.showNotification) {
            window.showNotification(message, type);
        } else {
            console.log(`[${type.toUpperCase()}] ${message}`);
        }
    }

    /**
     * 销毁表单组件
     */
    destroy() {
        // 移除模态框
        Object.values(this.modals).forEach(modal => {
            if (modal.parentNode) {
                modal.parentNode.removeChild(modal);
            }
        });
        this.modals = {};
    }
}

/**
 * 钱包验证器类
 */
class WalletValidators {
    /**
     * 验证密码
     */
    validatePassword(password) {
        return password && password.length >= 8;
    }

    /**
     * 验证助记词
     */
    validateMnemonic(mnemonic) {
        if (!mnemonic) return false;
        const words = mnemonic.trim().split(/\s+/);
        return words.length === 12 && words.every(word => /^[a-zA-Z]+$/.test(word));
    }

    /**
     * 验证私钥
     */
    validatePrivateKey(privateKey) {
        if (!privateKey) return false;
        // 简单验证Base58格式（实际实现可能需要更严格的验证）
        return /^[1-9A-HJ-NP-Za-km-z]+$/.test(privateKey) && privateKey.length >= 32;
    }
}

// 导出钱包表单类
window.WalletForms = WalletForms; 