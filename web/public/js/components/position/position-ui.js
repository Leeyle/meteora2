/**
 * 🎨 头寸UI渲染组件
 * 负责头寸列表和详情的界面渲染和显示更新，不包含业务逻辑
 */

class PositionUI {
    constructor(positionCore) {
        this.positionCore = positionCore;
        this.container = null;
        this.eventListeners = [];
        this.sortBy = 'created';
        this.sortOrder = 'desc';
        this.filterStatus = 'all';

        // 绑定核心事件
        this.bindCoreEvents();
    }

    /**
     * 绑定核心事件
     */
    bindCoreEvents() {
        this.positionCore.on('positionsLoaded', () => this.updatePositionList());
        this.positionCore.on('positionCreated', () => this.updatePositionList());
        this.positionCore.on('positionClosed', () => this.updatePositionList());
        this.positionCore.on('positionDeleted', () => this.updatePositionList());
        this.positionCore.on('feesCollected', () => this.updatePositionList());
        this.positionCore.on('batchFeesCollected', () => this.updatePositionList());
        this.positionCore.on('batchOperationCompleted', () => this.updatePositionList());
    }

    /**
     * 渲染头寸管理界面
     */
    render(containerId) {
        this.container = document.getElementById(containerId);
        if (!this.container) {
            console.error('未找到容器:', containerId);
            return;
        }

        this.container.innerHTML = this.generateHTML();
        this.bindUIEvents();
        this.updatePositionList();
        this.updateSummaryStats();
    }

    /**
     * 生成HTML结构
     */
    generateHTML() {
        return `
            <div class="position-ui">
                <!-- 头寸摘要统计 -->
                <div class="position-summary">
                    <div class="summary-cards">
                        <div class="summary-card">
                            <div class="card-icon">📈</div>
                            <div class="card-content">
                                <h3 id="totalPositions">0</h3>
                                <p>总头寸数</p>
                            </div>
                        </div>
                        <div class="summary-card">
                            <div class="card-icon">💰</div>
                            <div class="card-content">
                                <h3 id="totalValue">$0.00</h3>
                                <p>总价值</p>
                            </div>
                        </div>
                        <div class="summary-card">
                            <div class="card-icon">📊</div>
                            <div class="card-content">
                                <h3 id="totalPnL">$0.00</h3>
                                <p>总盈亏</p>
                            </div>
                        </div>
                        <div class="summary-card">
                            <div class="card-icon">🌾</div>
                            <div class="card-content">
                                <h3 id="pendingFees">$0.00</h3>
                                <p>待收手续费</p>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- 操作工具栏 -->
                <div class="position-toolbar">
                    <div class="toolbar-left">
                        <button class="btn btn-primary" id="createPositionBtn">
                            <span class="btn-icon">➕</span>
                            创建头寸
                        </button>
                        <button class="btn btn-outline" id="batchCollectBtn">
                            <span class="btn-icon">🌾</span>
                            批量收集
                        </button>
                        <button class="btn btn-outline" id="refreshPositionsBtn">
                            <span class="btn-icon">🔄</span>
                            强制刷新
                        </button>
                    </div>
                    <div class="toolbar-right">
                        <div class="filter-group">
                            <label for="statusFilter">状态:</label>
                            <select id="statusFilter" class="form-select">
                                <option value="all">全部</option>
                                <option value="active">活跃</option>
                                <option value="closed">已关闭</option>
                                <option value="empty">空头寸</option>
                            </select>
                        </div>
                        <div class="sort-group">
                            <label for="sortBy">排序:</label>
                            <select id="sortBy" class="form-select">
                                <option value="created">创建时间</option>
                                <option value="value">价值</option>
                                <option value="pnl">盈亏</option>
                                <option value="fees">手续费</option>
                            </select>
                            <button class="btn btn-sm" id="sortOrderBtn" data-order="desc">↓</button>
                        </div>
                    </div>
                </div>

                <!-- 头寸列表 -->
                <div class="position-list-container">
                    <div class="position-list" id="positionList">
                        <div class="loading-placeholder">正在加载头寸数据...</div>
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * 绑定UI事件
     */
    bindUIEvents() {
        this.container?.addEventListener('click', async (e) => {
            const button = e.target.closest('button');
            if (!button) return;

            const action = button.dataset.action || button.id;

            switch (action) {
                case 'createPositionBtn':
                case 'create-position':
                    await this.showCreatePositionModal();
                    break;
                case 'batchCollectBtn':
                    this.handleBatchCollect();
                    break;
                case 'refreshPositionsBtn':
                    this.showLoading();
                    await this.positionCore.forceRefreshPositions();
                    this.updatePositionList();
                    this.updateSummaryStats();
                    break;
            }
        });

        const statusFilter = this.container?.querySelector('#statusFilter');
        if (statusFilter) {
            statusFilter.addEventListener('change', (e) => {
                this.filterStatus = e.target.value;
                this.updatePositionList();
            });
        }

        const sortBy = this.container?.querySelector('#sortBy');
        if (sortBy) {
            sortBy.addEventListener('change', (e) => {
                this.sortBy = e.target.value;
                this.updatePositionList();
            });
        }

        const sortOrderBtn = this.container?.querySelector('#sortOrderBtn');
        if (sortOrderBtn) {
            sortOrderBtn.addEventListener('click', (e) => {
                const btn = e.currentTarget;
                this.sortOrder = this.sortOrder === 'desc' ? 'asc' : 'desc';
                btn.textContent = this.sortOrder === 'desc' ? '↓' : '↑';
                this.updatePositionList();
            });
        }
    }

    /**
     * 更新头寸列表
     */
    updatePositionList() {
        const listContainer = this.container?.querySelector('#positionList');
        if (!listContainer) return;

        const state = this.positionCore.getState();
        let positions = [...state.positions];

        // 应用过滤
        if (this.filterStatus !== 'all') {
            positions = positions.filter(pos => pos.status === this.filterStatus);
        }

        // 应用排序
        positions = this.sortPositions(positions);

        if (positions.length === 0) {
            listContainer.innerHTML = this.generateEmptyState();
            return;
        }

        const positionItems = positions.map(position => this.generatePositionItem(position)).join('');
        listContainer.innerHTML = positionItems;

        // 绑定头寸项事件
        this.bindPositionItemEvents();

        // 更新摘要统计
        this.updateSummaryStats();
    }

    /**
     * 排序头寸
     */
    sortPositions(positions) {
        return positions.sort((a, b) => {
            let aValue, bValue;

            switch (this.sortBy) {
                case 'created':
                    aValue = new Date(a.createdAt);
                    bValue = new Date(b.createdAt);
                    break;
                case 'value':
                    aValue = parseFloat(a.totalValue) || 0;
                    bValue = parseFloat(b.totalValue) || 0;
                    break;
                case 'pnl':
                    aValue = parseFloat(a.unrealizedPnL) || 0;
                    bValue = parseFloat(b.unrealizedPnL) || 0;
                    break;
                case 'fees':
                    aValue = parseFloat(a.pendingFees) || 0;
                    bValue = parseFloat(b.pendingFees) || 0;
                    break;
                default:
                    return 0;
            }

            if (this.sortOrder === 'desc') {
                return bValue > aValue ? 1 : -1;
            } else {
                return aValue > bValue ? 1 : -1;
            }
        });
    }

    /**
     * 生成头寸项
     */
    generatePositionItem(position) {
        const pnlClass = parseFloat(position.unrealizedPnL) >= 0 ? 'positive' : 'negative';
        const statusClass = position.status === 'active' ? 'active' : 'inactive';

        // 从前端获取头寸类型和创建时间
        const frontendInfo = this.positionCore.getFrontendPositionInfo(position.address);
        const positionType = frontendInfo?.type || position.type || 'undefined';
        const createdAt = frontendInfo?.createdAt || position.createdAt;

        return `
            <div class="position-item-horizontal" data-position="${position.address}">
                <div class="position-basic-info">
                    <div class="position-type-badge ${positionType.toLowerCase()}">${positionType}</div>
                    <div class="pool-pair">${position.tokenX?.symbol || 'X'} / ${position.tokenY?.symbol || 'Y'}</div>
                    <div class="position-address">${this.formatAddress(position.address)}</div>
                </div>
                
                <div class="position-metrics-horizontal">
                    <div class="metric-cell">
                        <span class="metric-label">总价值</span>
                        <span class="metric-value">${this.formatCurrency(position.totalValue)}</span>
                    </div>
                    <div class="metric-cell">
                        <span class="metric-label">盈亏</span>
                        <span class="metric-value ${pnlClass}">${this.formatCurrency(position.unrealizedPnL)}</span>
                    </div>
                    <div class="metric-cell">
                        <span class="metric-label">待收手续费</span>
                        <span class="metric-value">${this.formatCurrency(position.pendingFees)}</span>
                    </div>
                    <div class="metric-cell">
                        <span class="metric-label">创建时间</span>
                        <span class="metric-value">${this.formatDate(createdAt)}</span>
                    </div>
                </div>

                <div class="position-status-section">
                    <span class="position-status ${statusClass}">${this.getStatusText(position.status)}</span>
                </div>
                
                <div class="position-actions-horizontal">
                    <button class="btn btn-sm btn-outline" data-action="collect" data-position="${position.address}">
                        🌾 收集
                    </button>
                    <button class="btn btn-sm btn-outline" data-action="close" data-position="${position.address}">
                        ⏹️ 关闭
                    </button>
                    <button class="btn btn-sm btn-danger" data-action="delete" data-position="${position.address}">
                        🗑️ 删除
                    </button>
                </div>
                
                <div class="position-details" style="display: none;">
                    <!-- 详细信息在点击展开时加载 -->
                </div>
            </div>
        `;
    }

    /**
     * 生成空状态
     */
    generateEmptyState() {
        return `
            <div class="empty-state">
                <div class="empty-icon">📈</div>
                <h3>暂无头寸</h3>
                <p>您还没有创建任何流动性头寸</p>
                <button class="btn btn-primary" data-action="create-position">
                    创建第一个头寸
                </button>
            </div>
        `;
    }

    /**
     * 绑定头寸项事件
     */
    bindPositionItemEvents() {
        document.querySelectorAll('[data-action]').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const action = btn.dataset.action;
                const positionAddress = btn.dataset.position;

                await this.handlePositionAction(action, positionAddress);
            });
        });

        // 头寸项点击展开/收起
        document.querySelectorAll('.position-item-horizontal').forEach(item => {
            item.addEventListener('click', (e) => {
                if (e.target.closest('[data-action]')) return; // 忽略按钮点击
                this.togglePositionDetails(item);
            });
        });
    }

    /**
     * 处理头寸操作
     */
    async handlePositionAction(action, positionAddress) {
        try {
            switch (action) {
                case 'collect':
                    await this.positionCore.collectFees(positionAddress);
                    this.showNotification('手续费收集成功', 'success');
                    break;
                case 'close':
                    if (confirm('确定要关闭这个头寸吗？')) {
                        console.log('🔴 准备关闭头寸（统一流程）:', positionAddress);

                        // 直接调用统一的关闭头寸方法
                        const result = await this.positionCore.closePosition(positionAddress);

                        console.log('✅ 头寸关闭结果:', result);

                        if (result) {
                            this.showNotification('头寸关闭成功', 'success');
                            // 关闭成功后，直接从前端删除该头寸
                            this.positionCore.removePositionFromFrontend(positionAddress);
                            this.updatePositionList();
                            this.updateSummaryStats();
                        } else {
                            throw new Error('头寸关闭返回结果为空');
                        }
                    }
                    break;
                case 'delete':
                    if (confirm('确定要删除这个头寸的前端显示吗？\n注意：这只会删除前端显示，不会调用后端API。')) {
                        console.log('🗑️ 仅删除前端头寸显示:', positionAddress);
                        // 仅删除前端显示，不调用后端API
                        this.positionCore.removePositionFromFrontend(positionAddress);
                        this.updatePositionList();
                        this.updateSummaryStats();
                        this.showNotification('前端头寸显示已删除', 'success');
                    }
                    break;
            }
        } catch (error) {
            this.showNotification(`操作失败: ${error.message}`, 'error');
        }
    }

    /**
     * 批量收集手续费
     */
    async handleBatchCollect() {
        const activePositions = this.positionCore.getPositionsByStatus('active');
        const positionsWithFees = activePositions.filter(pos =>
            parseFloat(pos.pendingFees) > 0
        );

        if (positionsWithFees.length === 0) {
            this.showNotification('没有可收集的手续费', 'warning');
            return;
        }

        if (confirm(`确定要收集 ${positionsWithFees.length} 个头寸的手续费吗？`)) {
            try {
                const addresses = positionsWithFees.map(pos => pos.address);
                await this.positionCore.batchCollectFees(addresses);
                this.showNotification(`成功收集 ${addresses.length} 个头寸的手续费`, 'success');
            } catch (error) {
                this.showNotification(`批量收集失败: ${error.message}`, 'error');
            }
        }
    }

    /**
     * 更新摘要统计
     */
    updateSummaryStats() {
        const state = this.positionCore.getState();

        document.getElementById('totalPositions').textContent = state.positionsCount;
        document.getElementById('totalValue').textContent = this.formatCurrency(state.totalValue);
        document.getElementById('totalPnL').textContent = this.formatCurrency(state.totalPnL);

        // 计算总待收手续费
        const totalPendingFees = state.positions.reduce((total, pos) =>
            total + (parseFloat(pos.pendingFees) || 0), 0
        );
        document.getElementById('pendingFees').textContent = this.formatCurrency(totalPendingFees);
    }

    /**
     * 显示创建头寸模态框
     */
    async showCreatePositionModal() {
        // 检查钱包状态
        const coreUnlocked = this.positionCore.isWalletUnlocked();
        const apiUnlocked = await this.positionCore.checkWalletUnlockedAsync();

        if (!coreUnlocked && !apiUnlocked) {
            this.showNotification('请先解锁钱包才能创建头寸', 'warning');
            return;
        }

        // 创建模态框内容
        const modalContent = `
            <div class="create-position-form">
                <h4>创建DLMM头寸</h4>
                <form id="createPositionForm">
                    <div class="form-group" id="singlePoolGroup">
                        <label for="poolAddress">池地址:</label>
                        <input type="text" id="poolAddress" name="poolAddress" 
                               placeholder="请输入DLMM池地址">
                        <small class="form-help">输入要创建头寸的DLMM池地址</small>
                    </div>
                    
                    <div class="form-group" id="chainPoolGroup" style="display: none;">
                        <label for="chainPoolAddress">连锁头寸池地址:</label>
                        <input type="text" id="chainPoolAddress" name="chainPoolAddress" 
                               placeholder="请输入DLMM池地址">
                        <small class="form-help">连锁头寸将在此池中创建两个连续的69个bin头寸，总覆盖138个bin范围</small>
                    </div>
                    
                    <div class="form-group">
                        <label for="positionType">头寸类型:</label>
                        <select id="positionType" name="positionType" required>
                            <option value="Y">Y代币头寸 (适合看涨)</option>
                            <option value="X">X代币头寸 (适合看跌)</option>
                            <option value="CHAIN">创建连锁头寸 (多池组合)</option>
                        </select>
                    </div>
                    
                    <div class="form-group">
                        <label for="amount">投入数量:</label>
                        <input type="number" id="amount" name="amount" 
                               placeholder="0.1" step="0.001" min="0.001" required>
                        <small class="form-help">投入的代币数量</small>
                    </div>
                    
                    <div class="form-group" id="binRangeGroup">
                        <label for="binRange">价格区间 (bin数量):</label>
                        <input type="number" id="binRange" name="binRange" 
                               placeholder="10" min="1" value="10" required>
                        <small class="form-help" id="binRangeHelp">流动性分布的价格区间，建议1-50，数值越大覆盖价格范围越广</small>
                    </div>
                    
                    <div class="form-group">
                        <label for="strategy">策略:</label>
                        <select id="strategy" name="strategy">
                            <option value="moderate">稳健策略</option>
                            <option value="aggressive">激进策略</option>
                            <option value="conservative">保守策略</option>
                        </select>
                    </div>
                    
                    <div class="form-group">
                        <label for="slippage">滑点容忍度 (bps):</label>
                        <input type="number" id="slippage" name="slippage" 
                               placeholder="100" min="10" max="1000" value="100">
                        <small class="form-help">100 = 1%滑点</small>
                    </div>
                    
                    <div class="form-actions">
                        <button type="button" class="btn btn-outline" data-action="cancel-modal">
                            取消
                        </button>
                        <button type="submit" class="btn btn-primary">
                            创建头寸
                        </button>
                    </div>
                </form>
            </div>
        `;

        // 显示模态框
        this.showModal('创建头寸', modalContent);

        // 绑定表单提交事件
        document.getElementById('createPositionForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleCreatePosition(e.target);
        });

        // 绑定头寸类型选择器变化事件
        const positionTypeSelect = document.getElementById('positionType');
        if (positionTypeSelect) {
            positionTypeSelect.addEventListener('change', (e) => {
                this.handlePositionTypeChange(e.target.value);
            });
        }

        // 绑定取消按钮事件
        const cancelBtn = document.querySelector('[data-action="cancel-modal"]');
        if (cancelBtn) {
            cancelBtn.addEventListener('click', () => {
                document.querySelector('.modal').style.display = 'none';
            });
        }
    }

    /**
     * 处理头寸类型选择变化
     */
    handlePositionTypeChange(positionType) {
        const singlePoolGroup = document.getElementById('singlePoolGroup');
        const chainPoolGroup = document.getElementById('chainPoolGroup');
        const poolAddressInput = document.getElementById('poolAddress');
        const chainPoolAddressInput = document.getElementById('chainPoolAddress');
        const binRangeGroup = document.getElementById('binRangeGroup');
        const binRangeHelp = document.getElementById('binRangeHelp');

        if (positionType === 'CHAIN') {
            // 显示连锁头寸输入字段
            singlePoolGroup.style.display = 'none';
            chainPoolGroup.style.display = 'block';

            // 清除并设置必填属性
            poolAddressInput.required = false;
            chainPoolAddressInput.required = true;
            poolAddressInput.value = '';

            // 更新价格区间说明文本
            if (binRangeHelp) {
                binRangeHelp.textContent = '连锁头寸将创建两个连续的69个bin头寸，总共覆盖138个bin的价格范围';
            }

            // 隐藏价格区间输入（连锁头寸使用固定的bin范围）
            if (binRangeGroup) {
                binRangeGroup.style.display = 'none';
            }
        } else {
            // 显示单池输入字段
            singlePoolGroup.style.display = 'block';
            chainPoolGroup.style.display = 'none';

            // 清除并设置必填属性
            poolAddressInput.required = true;
            chainPoolAddressInput.required = false;
            chainPoolAddressInput.value = '';

            // 恢复原始价格区间说明文本
            if (binRangeHelp) {
                binRangeHelp.textContent = '流动性分布的价格区间，建议1-50，数值越大覆盖价格范围越广';
            }

            // 显示价格区间输入
            if (binRangeGroup) {
                binRangeGroup.style.display = 'block';
            }
        }
    }

    /**
     * 处理创建头寸表单提交
     */
    async handleCreatePosition(form) {
        const formData = new FormData(form);
        const data = Object.fromEntries(formData);

        try {
            // 显示加载状态
            const submitBtn = form.querySelector('button[type="submit"]');
            const originalText = submitBtn.textContent;
            submitBtn.textContent = '创建中...';
            submitBtn.disabled = true;

            // 构建配置
            const config = {
                strategy: data.strategy,
                slippageBps: parseInt(data.slippage)
            };

            // 根据类型处理不同的创建逻辑
            let result;

            if (data.positionType === 'CHAIN') {
                // 处理连锁头寸创建
                const poolAddress = data.chainPoolAddress;

                if (!poolAddress || poolAddress.trim().length === 0) {
                    throw new Error('请输入连锁头寸的池地址');
                }

                console.log('准备创建连锁头寸:', {
                    type: data.positionType,
                    poolAddress: poolAddress,
                    amount: data.amount,
                    config
                });

                // 调用连锁头寸创建方法（连锁头寸使用固定的138个bin范围）
                result = await this.positionCore.createChainPosition(
                    poolAddress,
                    parseFloat(data.amount),
                    138, // 连锁头寸固定使用138个bin
                    config
                );
            } else {
                // 处理单池头寸创建
                console.log('准备创建头寸:', {
                    type: data.positionType,
                    poolAddress: data.poolAddress,
                    amount: data.amount,
                    binRange: data.binRange,
                    config
                });

                if (data.positionType === 'Y') {
                    result = await this.positionCore.createYPosition(
                        data.poolAddress,
                        parseFloat(data.amount),
                        parseInt(data.binRange),
                        config
                    );
                } else {
                    result = await this.positionCore.createXPosition(
                        data.poolAddress,
                        parseFloat(data.amount),
                        parseInt(data.binRange),
                        config
                    );
                }
            }

            console.log('头寸创建结果:', result);

            // 创建头寸成功
            this.showNotification('头寸创建成功！', 'success');
            // 关闭模态框
            const modal = document.querySelector('.modal');
            if (modal) modal.style.display = 'none';

            // 刷新头寸列表 - 直接触发核心的刷新
            try {
                await this.positionCore.refreshUserPositions();
                this.updatePositionList();
                this.updateSummaryStats();
                console.log('头寸列表已刷新');
            } catch (refreshError) {
                console.warn('刷新头寸列表失败:', refreshError);
                // 延迟1秒后再次尝试刷新
                setTimeout(() => {
                    this.updatePositionList();
                    this.updateSummaryStats();
                }, 1000);
            }

        } catch (error) {
            console.error('创建头寸失败:', error);
            this.showNotification(`创建头寸失败: ${error.message}`, 'error');
        } finally {
            // 恢复按钮状态
            const submitBtn = form.querySelector('button[type="submit"]');
            if (submitBtn) {
                submitBtn.textContent = '创建头寸';
                submitBtn.disabled = false;
            }
        }
    }

    /**
     * 显示通用模态框
     */
    showModal(title, content) {
        const modal = document.getElementById('modal');
        const modalTitle = document.getElementById('modalTitle');
        const modalBody = document.getElementById('modalBody');

        if (modal && modalTitle && modalBody) {
            modalTitle.textContent = title;
            modalBody.innerHTML = content;
            modal.style.display = 'flex';
        } else {
            // 备用方案：使用alert
            alert(`${title}\n\n抱歉，模态框功能暂时不可用。请使用浏览器控制台查看详细信息。`);
        }
    }

    /**
     * 切换头寸详情显示
     */
    togglePositionDetails(positionItem) {
        const details = positionItem.querySelector('.position-details');
        const isVisible = details.style.display !== 'none';

        if (isVisible) {
            details.style.display = 'none';
        } else {
            // 加载详细信息
            const positionAddress = positionItem.dataset.position;
            this.loadPositionDetails(positionAddress, details);
            details.style.display = 'block';
        }
    }

    /**
     * 加载头寸详情
     */
    async loadPositionDetails(positionAddress, detailsContainer) {
        detailsContainer.innerHTML = '<div class="loading">加载详情中...</div>';

        try {
            const stats = await this.positionCore.getPositionStats(positionAddress);
            if (stats) {
                detailsContainer.innerHTML = this.generatePositionDetails(stats);
            } else {
                detailsContainer.innerHTML = '<div class="error">无法加载详情</div>';
            }
        } catch (error) {
            detailsContainer.innerHTML = `<div class="error">加载失败: ${error.message}</div>`;
        }
    }

    /**
     * 生成头寸详情
     */
    generatePositionDetails(stats) {
        return `
            <div class="position-details-content">
                <div class="detail-section">
                    <h4>流动性分布</h4>
                    <div class="liquidity-chart">
                        <!-- 这里可以添加流动性分布图表 -->
                        <p>活跃价格区间: ${stats.activeRange || 'N/A'}</p>
                    </div>
                </div>
                <div class="detail-section">
                    <h4>收益详情</h4>
                    <div class="earning-details">
                        <div class="earning-item">
                            <span>累计手续费: ${this.formatCurrency(stats.totalFeesEarned)}</span>
                        </div>
                        <div class="earning-item">
                            <span>价格变动收益: ${this.formatCurrency(stats.priceChangeProfit)}</span>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * 工具方法
     */
    formatAddress(address) {
        if (!address) return '';
        return `${address.slice(0, 6)}...${address.slice(-4)}`;
    }

    formatCurrency(value) {
        if (value === null || value === undefined || isNaN(value)) return '$0.00000000';
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD',
            minimumFractionDigits: 8,
            maximumFractionDigits: 8
        }).format(value);
    }

    formatDate(dateString) {
        if (!dateString) return '';
        return new Date(dateString).toLocaleDateString();
    }

    getStatusText(status) {
        const statusMap = {
            'active': '活跃',
            'closed': '已关闭',
            'pending': '待处理'
        };
        return statusMap[status] || status;
    }

    showLoading() {
        const listContainer = this.container?.querySelector('#positionList');
        if (listContainer) {
            listContainer.innerHTML = '<div class="loading-placeholder">正在刷新头寸数据...</div>';
        }
    }

    showNotification(message, type = 'info') {
        if (window.showNotification) {
            window.showNotification(message, type);
        } else {
            console.log(`[${type.toUpperCase()}] ${message}`);
        }
    }

    /**
     * 销毁UI组件
     */
    destroy() {
        this.eventListeners.forEach(cleanup => cleanup());
        this.eventListeners = [];

        if (this.container) {
            this.container.innerHTML = '';
            this.container = null;
        }
    }
}

// 导出头寸UI类
window.PositionUI = PositionUI;
window.PositionUI = PositionUI; 