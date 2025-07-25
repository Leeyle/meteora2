/**
 * 🪐 Jupiter交换UI界面
 * 提供Jupiter交换的用户界面组件
 */

class JupiterUI {
    constructor() {
        this.container = null;
        this.initialized = false;
    }

    /**
     * 初始化UI界面
     * @param {HTMLElement} container 容器元素
     */
    init(container) {
        this.container = container;
        this.render();
        this.bindEvents();
        this.initialized = true;
        console.log('Jupiter UI初始化完成');
    }

    /**
     * 渲染主界面
     */
    render() {
        if (!this.container) return;

        this.container.innerHTML = `
            <div class="jupiter-container">
                <!-- 交换表单卡片 -->
                <div class="jupiter-card swap-card">
                    <div class="card-header">
                        <h3>🪐 代币交换</h3>
                        <div class="swap-settings">
                            <div class="status-indicator" id="connectionStatus">
                                <span class="status-dot"></span>
                                <span class="status-text">准备就绪</span>
                            </div>
                        </div>
                    </div>
                    
                    <div class="card-content">
                        <div class="swap-form">
                            <!-- 输入代币 -->
                            <div class="token-input-group">
                                <div class="input-header">
                                    <label>发送</label>
                                    <div class="balance-info" id="inputBalance">
                                        <span class="balance-text">余额: --</span>
                                        <button class="max-btn" id="maxBtn">MAX</button>
                                    </div>
                                </div>
                                <div class="token-input-container">
                                    <div class="amount-input-wrapper">
                                        <input 
                                            type="text" 
                                            id="inputAmount" 
                                            class="token-amount-input" 
                                            placeholder="0.00"
                                            autocomplete="off"
                                        >
                                        <div class="input-suffix">
                                            <span class="token-symbol" id="inputTokenSymbol">选择代币</span>
                                        </div>
                                    </div>
                                    <div class="token-select-wrapper">
                                        <input 
                                            type="text" 
                                            id="inputTokenAddress" 
                                            class="token-address-input" 
                                            placeholder="输入代币地址或搜索"
                                            autocomplete="off"
                                        >
                                        <div class="token-shortcuts">
                                            <button class="token-btn" data-token="SOL" data-target="input" title="Solana">
                                                <span class="token-icon">◉</span>
                                                <span>SOL</span>
                                            </button>
                                            <button class="token-btn" data-token="USDC" data-target="input" title="USD Coin">
                                                <span class="token-icon">💵</span>
                                                <span>USDC</span>
                                            </button>
                                            <button class="token-btn" data-token="USDT" data-target="input" title="Tether">
                                                <span class="token-icon">💴</span>
                                                <span>USDT</span>
                                            </button>
                                        </div>
                                    </div>
                                </div>
                                <div class="token-value" id="inputTokenValue">
                                    <span class="usd-value">≈ $0.00</span>
                                </div>
                            </div>

                            <!-- 交换方向按钮 -->
                            <div class="swap-direction">
                                <button class="swap-direction-btn" id="swapDirectionBtn" title="交换方向">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                                        <path d="M7 10l5 5 5-5z"/>
                                        <path d="M7 14l5-5 5 5z"/>
                                    </svg>
                                </button>
                            </div>

                            <!-- 输出代币 -->
                            <div class="token-input-group">
                                <div class="input-header">
                                    <label>接收</label>
                                    <div class="balance-info" id="outputBalance">
                                        <span class="balance-text">余额: --</span>
                                    </div>
                                </div>
                                <div class="token-input-container">
                                    <div class="amount-input-wrapper">
                                        <input 
                                            type="text" 
                                            id="outputAmount" 
                                            class="token-amount-input output-readonly" 
                                            placeholder="0.00"
                                            readonly
                                        >
                                        <div class="input-suffix">
                                            <span class="token-symbol" id="outputTokenSymbol">选择代币</span>
                                        </div>
                                    </div>
                                    <div class="token-select-wrapper">
                                        <input 
                                            type="text" 
                                            id="outputTokenAddress" 
                                            class="token-address-input" 
                                            placeholder="输入代币地址或搜索"
                                            autocomplete="off"
                                        >
                                        <div class="token-shortcuts">
                                            <button class="token-btn" data-token="USDC" data-target="output" title="USD Coin">
                                                <span class="token-icon">💵</span>
                                                <span>USDC</span>
                                            </button>
                                            <button class="token-btn" data-token="USDT" data-target="output" title="Tether">
                                                <span class="token-icon">💴</span>
                                                <span>USDT</span>
                                            </button>
                                            <button class="token-btn" data-token="SOL" data-target="output" title="Solana">
                                                <span class="token-icon">◉</span>
                                                <span>SOL</span>
                                            </button>
                                        </div>
                                    </div>
                                </div>
                                <div class="token-value" id="outputTokenValue">
                                    <span class="usd-value">≈ $0.00</span>
                                </div>
                            </div>

                            <!-- 高级设置 -->
                            <div class="advanced-settings">
                                <div class="settings-toggle" id="advancedToggle">
                                    <span>高级设置</span>
                                    <svg class="toggle-icon" width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                                        <path d="M7 10l5 5 5-5z"/>
                                    </svg>
                                </div>
                                <div class="settings-content" id="advancedContent" style="display: none;">
                                    <div class="setting-row">
                                        <label>滑点容忍度 (%)</label>
                                        <div class="slippage-controls">
                                            <button class="slippage-preset" data-slippage="0.1">0.1%</button>
                                            <button class="slippage-preset" data-slippage="0.5">0.5%</button>
                                            <button class="slippage-preset active" data-slippage="1">1%</button>
                                            <input 
                                                type="number" 
                                                id="slippageInput" 
                                                value="1" 
                                                min="0.01" 
                                                max="50" 
                                                step="0.01"
                                                class="slippage-custom"
                                                placeholder="自定义"
                                            >
                                        </div>
                                    </div>
                                    <div class="setting-row">
                                        <label>交易优先级</label>
                                        <select id="prioritySelect" class="priority-select">
                                            <option value="low">低 (节省费用)</option>
                                            <option value="medium" selected>中 (推荐)</option>
                                            <option value="high">高 (快速确认)</option>
                                        </select>
                                    </div>
                                </div>
                            </div>

                            <!-- 路由信息 -->
                            <div class="route-info" id="routeInfo" style="display: none;">
                                <div class="route-header">
                                    <span class="route-title">🛣️ 交换路由</span>
                                    <span class="route-badge" id="routeBadge">最佳</span>
                                </div>
                                <div class="route-details" id="routeDetails">
                                    <!-- 路由详情将动态填充 -->
                                </div>
                                <div class="route-metrics">
                                    <div class="metric">
                                        <span class="metric-label">预计输出</span>
                                        <span class="metric-value" id="estimatedOutput">--</span>
                                    </div>
                                    <div class="metric">
                                        <span class="metric-label">价格影响</span>
                                        <span class="metric-value price-impact" id="priceImpact">--</span>
                                    </div>
                                    <div class="metric">
                                        <span class="metric-label">最小接收</span>
                                        <span class="metric-value" id="minimumReceived">--</span>
                                    </div>
                                    <div class="metric">
                                        <span class="metric-label">网络费用</span>
                                        <span class="metric-value" id="networkFee">~0.000005 SOL</span>
                                    </div>
                                </div>
                            </div>

                            <!-- 交换按钮 -->
                            <div class="swap-actions">
                                <button class="btn btn-primary btn-large" id="getQuoteBtn">
                                    <span class="btn-text">获取最佳报价</span>
                                    <div class="btn-spinner" style="display: none;">
                                        <div class="spinner"></div>
                                    </div>
                                </button>
                                <button class="btn btn-success btn-large" id="swapBtn" style="display: none;">
                                    <span class="btn-text">确认交换</span>
                                    <div class="btn-spinner" style="display: none;">
                                        <div class="spinner"></div>
                                    </div>
                                </button>
                            </div>

                            <!-- 警告提示 -->
                            <div class="warning-message" id="warningMessage" style="display: none;">
                                <div class="warning-icon">⚠️</div>
                                <div class="warning-text"></div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- 市场信息卡片 -->
                <div class="jupiter-card market-card">
                    <div class="card-header">
                        <h3>📊 市场信息</h3>
                        <div class="refresh-indicator" id="marketRefresh">
                            <span class="refresh-time">--</span>
                        </div>
                    </div>
                    <div class="card-content">
                        <div class="market-grid">
                            <div class="market-item">
                                <div class="market-label">Jupiter状态</div>
                                <div class="market-value" id="jupiterStatus">
                                    <span class="status-indicator">
                                        <span class="status-dot"></span>
                                        <span class="status-text">正常</span>
                                    </span>
                                </div>
                            </div>
                            <div class="market-item">
                                <div class="market-label">支持代币</div>
                                <div class="market-value" id="supportedTokensCount">--</div>
                            </div>
                            <div class="market-item">
                                <div class="market-label">24h交易量</div>
                                <div class="market-value" id="dailyVolume">--</div>
                            </div>
                            <div class="market-item">
                                <div class="market-label">网络拥堵</div>
                                <div class="market-value" id="networkCongestion">
                                    <span class="congestion-indicator">正常</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- 交换历史 -->
                <div class="jupiter-card history-card">
                    <div class="card-header">
                        <h3>📋 交换历史</h3>
                        <button class="btn btn-sm" id="clearHistoryBtn">清空</button>
                    </div>
                    <div class="card-content">
                        <div class="swap-history" id="swapHistory">
                            <div class="empty-state">
                                <div class="empty-icon">📝</div>
                                <div class="empty-text">暂无交换记录</div>
                                <div class="empty-subtext">完成交换后将显示历史记录</div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;

        console.log('Jupiter UI渲染完成');

        // 🔧 修复：设置初始状态指示器颜色
        this.setInitialStatus();
    }

    /**
     * 设置初始状态
     */
    setInitialStatus() {
        // 设置连接状态指示器为绿色（准备就绪）
        const connectionStatusDot = this.container.querySelector('#connectionStatus .status-dot');
        if (connectionStatusDot) {
            connectionStatusDot.style.background = '#10b981';
        }

        // 设置Jupiter状态指示器为绿色（正常）
        const jupiterStatusDot = this.container.querySelector('#jupiterStatus .status-dot');
        if (jupiterStatusDot) {
            jupiterStatusDot.style.background = '#10b981';
        }

        // 设置支持代币数量
        const supportedTokensCount = this.container.querySelector('#supportedTokensCount');
        if (supportedTokensCount) {
            supportedTokensCount.textContent = '1000+';
        }
    }

    /**
     * 绑定事件
     */
    bindEvents() {
        if (!this.container) return;

        // 交换方向按钮
        const swapDirectionBtn = this.container.querySelector('#swapDirectionBtn');
        swapDirectionBtn?.addEventListener('click', () => this.swapDirection());

        // 获取报价按钮
        const getQuoteBtn = this.container.querySelector('#getQuoteBtn');
        getQuoteBtn?.addEventListener('click', () => this.getQuote());

        // 交换按钮
        const swapBtn = this.container.querySelector('#swapBtn');
        swapBtn?.addEventListener('click', () => this.executeSwap());

        // 清空历史按钮
        const clearHistoryBtn = this.container.querySelector('#clearHistoryBtn');
        clearHistoryBtn?.addEventListener('click', () => this.clearHistory());

        // MAX按钮
        const maxBtn = this.container.querySelector('#maxBtn');
        maxBtn?.addEventListener('click', () => this.setMaxAmount());

        // 高级设置切换
        const advancedToggle = this.container.querySelector('#advancedToggle');
        advancedToggle?.addEventListener('click', () => this.toggleAdvancedSettings());

        // 滑点预设按钮
        const slippagePresets = this.container.querySelectorAll('.slippage-preset');
        slippagePresets.forEach(btn => {
            btn.addEventListener('click', (e) => {
                const slippage = e.target.dataset.slippage;
                this.setSlippage(slippage);
            });
        });

        // 代币快捷按钮
        const tokenShortcuts = this.container.querySelectorAll('.token-btn');
        tokenShortcuts.forEach(btn => {
            btn.addEventListener('click', (e) => {
                const token = e.currentTarget.dataset.token;
                const target = e.currentTarget.dataset.target;
                if (token && target) {
                    this.fillTokenAddress(token, target);
                }
            });
        });

        // 输入金额变化事件
        const inputAmount = this.container.querySelector('#inputAmount');
        inputAmount?.addEventListener('input', () => this.onAmountChange());

        // 代币地址变化事件
        const inputTokenAddress = this.container.querySelector('#inputTokenAddress');
        const outputTokenAddress = this.container.querySelector('#outputTokenAddress');

        inputTokenAddress?.addEventListener('change', () => this.onTokenChange('input'));
        outputTokenAddress?.addEventListener('change', () => this.onTokenChange('output'));

        // 自动获取报价（输入金额或代币变化时）
        let quoteTimeout;
        const autoQuote = () => {
            clearTimeout(quoteTimeout);
            quoteTimeout = setTimeout(() => {
                if (this.shouldAutoQuote()) {
                    this.getQuote();
                }
            }, 1000); // 1秒延迟，避免频繁请求
        };

        inputAmount?.addEventListener('input', autoQuote);
        inputTokenAddress?.addEventListener('change', autoQuote);
        outputTokenAddress?.addEventListener('change', autoQuote);

        console.log('Jupiter UI事件绑定完成');
    }

    /**
     * 设置最大金额
     */
    setMaxAmount() {
        // 这里需要从钱包获取余额，暂时设置为示例值
        const inputAmount = this.container.querySelector('#inputAmount');
        if (inputAmount) {
            inputAmount.value = '100'; // 示例值，实际应从钱包获取
            this.onAmountChange();
        }
    }

    /**
     * 切换高级设置
     */
    toggleAdvancedSettings() {
        const content = this.container.querySelector('#advancedContent');
        const toggle = this.container.querySelector('#advancedToggle');
        const icon = toggle?.querySelector('.toggle-icon');

        if (content && toggle) {
            const isVisible = content.style.display !== 'none';
            content.style.display = isVisible ? 'none' : 'block';

            if (icon) {
                icon.style.transform = isVisible ? 'rotate(0deg)' : 'rotate(180deg)';
            }
        }
    }

    /**
     * 设置滑点
     */
    setSlippage(slippage) {
        const slippageInput = this.container.querySelector('#slippageInput');
        const presets = this.container.querySelectorAll('.slippage-preset');

        if (slippageInput) {
            slippageInput.value = slippage;
        }

        // 更新预设按钮状态
        presets.forEach(btn => {
            btn.classList.toggle('active', btn.dataset.slippage === slippage);
        });
    }

    /**
     * 金额变化处理
     */
    onAmountChange() {
        const inputAmount = this.container.querySelector('#inputAmount');
        const inputValue = this.container.querySelector('#inputTokenValue .usd-value');

        if (inputAmount && inputValue) {
            const amount = parseFloat(inputAmount.value) || 0;
            // 这里应该根据实际代币价格计算USD价值
            inputValue.textContent = `≈ $${(amount * 100).toFixed(2)}`; // 示例计算
        }
    }

    /**
     * 代币变化处理
     */
    onTokenChange(type) {
        const addressInput = this.container.querySelector(`#${type}TokenAddress`);
        const symbolSpan = this.container.querySelector(`#${type}TokenSymbol`);

        if (addressInput && symbolSpan) {
            const address = addressInput.value;
            if (address) {
                // 根据地址获取代币符号
                const symbol = this.getTokenSymbolByAddress(address);
                symbolSpan.textContent = symbol || '未知代币';
            } else {
                symbolSpan.textContent = '选择代币';
            }
        }
    }

    /**
     * 根据地址获取代币符号
     */
    getTokenSymbolByAddress(address) {
        const tokenMap = {
            'So11111111111111111111111111111111111111112': 'SOL',
            'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v': 'USDC',
            'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB': 'USDT',
            '4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R': 'RAY'
        };
        return tokenMap[address];
    }

    /**
     * 检查是否应该自动获取报价
     */
    shouldAutoQuote() {
        const inputAmount = this.container.querySelector('#inputAmount');
        const inputAddress = this.container.querySelector('#inputTokenAddress');
        const outputAddress = this.container.querySelector('#outputTokenAddress');

        return inputAmount?.value &&
            inputAddress?.value &&
            outputAddress?.value &&
            parseFloat(inputAmount.value) > 0;
    }

    /**
     * 交换输入输出代币
     */
    swapDirection() {
        const inputAddress = this.container.querySelector('#inputTokenAddress');
        const outputAddress = this.container.querySelector('#outputTokenAddress');
        const inputAmount = this.container.querySelector('#inputAmount');
        const outputAmount = this.container.querySelector('#outputAmount');

        if (inputAddress && outputAddress && inputAmount && outputAmount) {
            // 交换地址
            const tempAddress = inputAddress.value;
            inputAddress.value = outputAddress.value;
            outputAddress.value = tempAddress;

            // 清空金额
            inputAmount.value = '';
            outputAmount.value = '';

            // 隐藏交换信息
            this.hideSwapInfo();
        }
    }

    /**
     * 获取报价
     */
    getQuote() {
        this.container.dispatchEvent(new CustomEvent('jupiterGetQuote'));
    }

    /**
     * 执行交换
     */
    executeSwap() {
        this.container.dispatchEvent(new CustomEvent('jupiterExecuteSwap'));
    }

    /**
     * 刷新状态
     */
    refreshStatus() {
        this.container.dispatchEvent(new CustomEvent('jupiterRefreshStatus'));
    }

    /**
     * 清空历史
     */
    clearHistory() {
        const historyContainer = this.container.querySelector('#swapHistory');
        if (historyContainer) {
            historyContainer.innerHTML = `
                <div class="empty-state">
                    <div class="empty-text">暂无交换记录</div>
                </div>
            `;
        }
    }

    /**
     * 显示交换信息
     * @param {Object} quote 报价信息
     * @param {number} outputDecimals 输出代币精度
     */
    showSwapInfo(quote, outputDecimals = 9) {
        try {
            console.log('显示交换信息:', quote);

            const routeInfo = this.container.querySelector('#routeInfo');
            const estimatedOutput = this.container.querySelector('#estimatedOutput');
            const priceImpact = this.container.querySelector('#priceImpact');
            const minimumReceived = this.container.querySelector('#minimumReceived');
            const routeDetails = this.container.querySelector('#routeDetails');
            const swapBtn = this.container.querySelector('#swapBtn');

            if (!routeInfo || !estimatedOutput || !priceImpact) {
                console.error('交换信息DOM元素未找到');
                return;
            }

            if (!quote || !quote.outAmount) {
                console.error('报价数据无效:', quote);
                return;
            }

            // 🔧 修复：使用动态获取的输出代币精度格式化输出数量
            try {
                // 使用传入的精度参数，而不是硬编码的9
                const outputAmount = parseFloat(quote.outAmount) / Math.pow(10, outputDecimals);
                if (!isNaN(outputAmount) && isFinite(outputAmount)) {
                    // 根据数值大小选择合适的显示精度
                    let displayAmount;
                    if (outputAmount >= 1) {
                        displayAmount = outputAmount.toFixed(6);
                    } else if (outputAmount >= 0.001) {
                        displayAmount = outputAmount.toFixed(8);
                    } else if (outputAmount > 0) {
                        displayAmount = outputAmount.toExponential(3);
                    } else {
                        displayAmount = '0';
                    }
                    estimatedOutput.textContent = displayAmount;

                    // 计算最小接收金额（考虑滑点）
                    const slippageInput = this.container.querySelector('#slippageInput');
                    const slippage = parseFloat(slippageInput?.value || 1) / 100;
                    const minReceived = outputAmount * (1 - slippage);
                    if (minimumReceived) {
                        minimumReceived.textContent = minReceived.toFixed(6);
                    }

                    console.log(`💰 显示输出金额: ${displayAmount} (精度: ${outputDecimals})`);
                } else {
                    estimatedOutput.textContent = '0.000000';
                    if (minimumReceived) minimumReceived.textContent = '0.000000';
                    console.warn('输出金额计算异常:', quote.outAmount);
                }
            } catch (outputError) {
                console.error('设置预估输出失败:', outputError);
                estimatedOutput.textContent = '0.000000';
                if (minimumReceived) minimumReceived.textContent = '0.000000';
            }

            // 格式化价格影响 - 安全处理
            try {
                const impact = Math.abs(quote.priceImpactPct || 0) * 100;
                if (!isNaN(impact) && isFinite(impact)) {
                    priceImpact.textContent = `${impact.toFixed(2)}%`;

                    // 设置价格影响颜色
                    priceImpact.className = 'metric-value price-impact';
                    if (impact < 0.1) {
                        priceImpact.classList.add('low');
                    } else if (impact < 1) {
                        priceImpact.classList.add('medium');
                    } else {
                        priceImpact.classList.add('high');
                    }
                } else {
                    priceImpact.textContent = '0.00%';
                    priceImpact.className = 'metric-value price-impact low';
                }
            } catch (impactError) {
                console.error('设置价格影响失败:', impactError);
                priceImpact.textContent = '0.00%';
                priceImpact.className = 'metric-value price-impact low';
            }

            // 显示路由信息
            if (routeDetails && quote.routePlan) {
                this.displayRouteDetails(quote.routePlan, routeDetails);
            }

            // 显示警告信息
            this.showWarnings(quote);

            // 显示UI元素
            routeInfo.style.display = 'block';
            if (swapBtn) swapBtn.style.display = 'block';

            console.log('交换信息显示完成');
        } catch (error) {
            console.error('显示交换信息失败:', error);
        }
    }

    /**
     * 显示路由详情
     */
    displayRouteDetails(routePlan, container) {
        if (!routePlan || !container) return;

        try {
            let routeHTML = '<div class="route-path">';

            // 简化的路由显示
            if (routePlan.length === 1) {
                routeHTML += `
                    <div class="route-step">
                        <span class="route-dex">${routePlan[0].swapInfo?.label || 'DEX'}</span>
                        <span class="route-arrow">→</span>
                    </div>
                `;
            } else {
                routeHTML += `
                    <div class="route-step">
                        <span class="route-text">${routePlan.length} 步交换</span>
                    </div>
                `;
            }

            routeHTML += '</div>';
            container.innerHTML = routeHTML;
        } catch (error) {
            console.error('显示路由详情失败:', error);
            container.innerHTML = '<div class="route-error">路由信息加载失败</div>';
        }
    }

    /**
     * 显示警告信息
     */
    showWarnings(quote) {
        const warningMessage = this.container.querySelector('#warningMessage');
        if (!warningMessage) return;

        const warnings = [];

        // 检查价格影响
        const impact = Math.abs(quote.priceImpactPct || 0) * 100;
        if (impact > 5) {
            warnings.push(`高价格影响 (${impact.toFixed(2)}%)`);
        }

        // 检查滑点设置
        const slippageInput = this.container.querySelector('#slippageInput');
        const slippage = parseFloat(slippageInput?.value || 1);
        if (slippage > 5) {
            warnings.push(`高滑点设置 (${slippage}%)`);
        }

        if (warnings.length > 0) {
            const warningText = warningMessage.querySelector('.warning-text');
            if (warningText) {
                warningText.textContent = warnings.join(', ');
            }
            warningMessage.style.display = 'flex';
        } else {
            warningMessage.style.display = 'none';
        }
    }

    /**
     * 隐藏交换信息
     */
    hideSwapInfo() {
        const routeInfo = this.container.querySelector('#routeInfo');
        const swapBtn = this.container.querySelector('#swapBtn');
        const warningMessage = this.container.querySelector('#warningMessage');

        if (routeInfo) routeInfo.style.display = 'none';
        if (swapBtn) swapBtn.style.display = 'none';
        if (warningMessage) warningMessage.style.display = 'none';
    }

    /**
     * 设置按钮加载状态
     * @param {string} buttonId 按钮ID
     * @param {boolean} loading 是否加载中
     */
    setButtonLoading(buttonId, loading) {
        const button = this.container.querySelector(`#${buttonId}`);
        const btnText = button?.querySelector('.btn-text');
        const btnSpinner = button?.querySelector('.btn-spinner');

        if (loading) {
            button?.setAttribute('disabled', 'true');
            if (btnText) btnText.style.display = 'none';
            if (btnSpinner) btnSpinner.style.display = 'flex';
        } else {
            button?.removeAttribute('disabled');
            if (btnText) btnText.style.display = 'inline';
            if (btnSpinner) btnSpinner.style.display = 'none';
        }
    }

    /**
     * 更新状态信息
     * @param {Object} status 状态信息
     */
    updateStatus(status) {
        const jupiterStatus = this.container.querySelector('#jupiterStatus .status-text');
        const jupiterStatusDot = this.container.querySelector('#jupiterStatus .status-dot');
        const supportedTokensCount = this.container.querySelector('#supportedTokensCount');

        if (jupiterStatus) {
            jupiterStatus.textContent = status.status === 'healthy' ? '正常' : '异常';
        }

        // 🔧 修复：更新状态指示器颜色
        if (jupiterStatusDot) {
            jupiterStatusDot.style.background = status.status === 'healthy' ? '#10b981' : '#ef4444';
        }

        if (supportedTokensCount) {
            supportedTokensCount.textContent = status.tokensCount || '1000+';
        }
    }

    /**
     * 添加交换历史记录
     * @param {Object} record 交换记录
     */
    addSwapHistory(record) {
        const historyContainer = this.container.querySelector('#swapHistory');
        if (!historyContainer) return;

        // 移除空状态
        const emptyState = historyContainer.querySelector('.empty-state');
        if (emptyState) {
            emptyState.remove();
        }

        const historyItem = document.createElement('div');
        historyItem.className = 'history-item';
        historyItem.innerHTML = `
            <div class="history-info">
                <div class="history-tokens">
                    ${record.inputAmount || '0'} → ${record.outputAmount || '0'}
                </div>
                <div class="history-time">${new Date().toLocaleString()}</div>
            </div>
            <div class="history-status ${record.success ? 'success' : 'failed'}">
                ${record.success ? '✅' : '❌'}
            </div>
        `;

        historyContainer.insertBefore(historyItem, historyContainer.firstChild);

        // 限制历史记录数量
        const items = historyContainer.querySelectorAll('.history-item');
        if (items.length > 10) {
            items[items.length - 1].remove();
        }
    }

    /**
     * 获取当前输入值
     */
    getCurrentInputs() {
        return {
            inputTokenAddress: this.container.querySelector('#inputTokenAddress')?.value || '',
            outputTokenAddress: this.container.querySelector('#outputTokenAddress')?.value || '',
            inputAmount: this.container.querySelector('#inputAmount')?.value || '',
            slippage: parseFloat(this.container.querySelector('#slippageInput')?.value || '0.5')
        };
    }

    /**
     * 设置输出金额
     * @param {string} amount 输出金额
     */
    setOutputAmount(amount) {
        const outputAmount = this.container.querySelector('#outputAmount');
        if (outputAmount) {
            outputAmount.value = amount;
        }
    }

    /**
     * 填充代币地址
     * @param {string} tokenSymbol 代币符号
     * @param {string} target 目标 ('input' 或 'output')
     */
    fillTokenAddress(tokenSymbol, target) {
        const tokenAddresses = {
            'SOL': 'So11111111111111111111111111111111111111112',
            'USDC': 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
            'USDT': 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
            'RAY': '4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R'
        };

        const address = tokenAddresses[tokenSymbol];
        if (!address) return;

        const targetInput = this.container.querySelector(
            target === 'input' ? '#inputTokenAddress' : '#outputTokenAddress'
        );

        if (targetInput) {
            targetInput.value = address;

            // 触发change事件
            targetInput.dispatchEvent(new Event('change', { bubbles: true }));
        }
    }

    /**
     * 销毁UI
     */
    destroy() {
        if (this.container) {
            this.container.innerHTML = '';
        }
        this.initialized = false;
        console.log('Jupiter UI已销毁');
    }
}

// 暴露到全局作用域
window.JupiterUI = JupiterUI; 