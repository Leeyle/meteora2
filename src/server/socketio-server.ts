import { Server as SocketIOServer } from 'socket.io';
import { Server as HttpServer } from 'http';
import { EventBus } from '../infrastructure/EventBus';

export class SocketIOService {
    private io: SocketIOServer;
    private eventBus: EventBus;
    private eventBusSubscriptions: string[] = []; // 🔧 修复：跟踪EventBus订阅ID

    constructor(httpServer: HttpServer, eventBus: EventBus) {
        this.eventBus = eventBus;

        // 初始化Socket.IO服务器
        this.io = new SocketIOServer(httpServer, {
            cors: {
                origin: "*",
                methods: ["GET", "POST"]
            },
            path: '/socket.io/'
        });

        // 🔧 修复：设置最大监听器数量，防止警告
        this.io.setMaxListeners(50);
        // EventBus内部使用EventEmitter，设置最大监听器
        if ((this.eventBus as any).setMaxListeners) {
            (this.eventBus as any).setMaxListeners(50);
        }

        this.setupEventHandlers();
        this.bindEventBusListeners();
    }

    private setupEventHandlers() {
        this.io.on('connection', (socket) => {
            console.log(`🔌 Socket.IO客户端连接: ${socket.id}`);
            
            // 🔧 修复：为每个socket设置最大监听器数量，防止警告
            socket.setMaxListeners(20);

            // 客户端订阅策略监控
            socket.on('subscribe:strategy-monitor', (data) => {
                console.log(`📊 客户端订阅策略监控: ${data?.clientId || socket.id}`);
                socket.join('strategy-monitor');

                // 发送确认消息
                socket.emit('subscribed:strategy-monitor', {
                    success: true,
                    message: '成功订阅策略监控',
                    timestamp: Date.now()
                });
            });

            // 客户端取消订阅策略监控
            socket.on('unsubscribe:strategy-monitor', () => {
                console.log(`📊 客户端取消订阅策略监控: ${socket.id}`);
                socket.leave('strategy-monitor');
            });

            // 🔥 客户端订阅池爬虫监控
            socket.on('subscribe:pool-crawler', (data) => {
                console.log(`🏊 客户端订阅池爬虫监控: ${data?.clientId || socket.id}`);
                socket.join('pool-crawler');

                // 发送确认消息
                socket.emit('subscribed:pool-crawler', {
                    success: true,
                    message: '成功订阅池爬虫监控',
                    timestamp: Date.now()
                });
            });

            // 🔥 客户端取消订阅池爬虫监控
            socket.on('unsubscribe:pool-crawler', () => {
                console.log(`🏊 客户端取消订阅池爬虫监控: ${socket.id}`);
                socket.leave('pool-crawler');
            });

            // 🔥 池爬虫控制命令
            socket.on('pool-crawler:start', async (data) => {
                console.log(`🏊 客户端请求启动池爬虫: ${socket.id}`);
                try {
                    await this.eventBus.emit('pool-crawler.command.start', data);
                    socket.emit('pool-crawler:command-response', {
                        success: true,
                        command: 'start',
                        message: '池爬虫启动请求已发送',
                        timestamp: Date.now()
                    });
                } catch (error) {
                    socket.emit('pool-crawler:command-response', {
                        success: false,
                        command: 'start',
                        message: `启动失败: ${error}`,
                        timestamp: Date.now()
                    });
                }
            });

            socket.on('pool-crawler:stop', async (data) => {
                console.log(`🏊 客户端请求停止池爬虫: ${socket.id}`);
                try {
                    await this.eventBus.emit('pool-crawler.command.stop', data);
                    socket.emit('pool-crawler:command-response', {
                        success: true,
                        command: 'stop',
                        message: '池爬虫停止请求已发送',
                        timestamp: Date.now()
                    });
                } catch (error) {
                    socket.emit('pool-crawler:command-response', {
                        success: false,
                        command: 'stop',
                        message: `停止失败: ${error}`,
                        timestamp: Date.now()
                    });
                }
            });

            socket.on('pool-crawler:pause', async (data) => {
                console.log(`🏊 客户端请求暂停池爬虫: ${socket.id}`);
                try {
                    await this.eventBus.emit('pool-crawler.command.pause', data);
                    socket.emit('pool-crawler:command-response', {
                        success: true,
                        command: 'pause',
                        message: '池爬虫暂停请求已发送',
                        timestamp: Date.now()
                    });
                } catch (error) {
                    socket.emit('pool-crawler:command-response', {
                        success: false,
                        command: 'pause',
                        message: `暂停失败: ${error}`,
                        timestamp: Date.now()
                    });
                }
            });

            socket.on('pool-crawler:resume', async (data) => {
                console.log(`🏊 客户端请求恢复池爬虫: ${socket.id}`);
                try {
                    await this.eventBus.emit('pool-crawler.command.resume', data);
                    socket.emit('pool-crawler:command-response', {
                        success: true,
                        command: 'resume',
                        message: '池爬虫恢复请求已发送',
                        timestamp: Date.now()
                    });
                } catch (error) {
                    socket.emit('pool-crawler:command-response', {
                        success: false,
                        command: 'resume',
                        message: `恢复失败: ${error}`,
                        timestamp: Date.now()
                    });
                }
            });

            socket.on('pool-crawler:crawl-now', async (data) => {
                console.log(`🏊 客户端请求立即爬取: ${socket.id}`);
                try {
                    await this.eventBus.emit('pool-crawler.command.crawl-now', data);
                    socket.emit('pool-crawler:command-response', {
                        success: true,
                        command: 'crawl-now',
                        message: '立即爬取请求已发送',
                        timestamp: Date.now()
                    });
                } catch (error) {
                    socket.emit('pool-crawler:command-response', {
                        success: false,
                        command: 'crawl-now',
                        message: `立即爬取失败: ${error}`,
                        timestamp: Date.now()
                    });
                }
            });

            socket.on('pool-crawler:update-config', async (data) => {
                console.log(`🏊 客户端请求更新配置: ${socket.id}`);
                try {
                    await this.eventBus.emit('pool-crawler.command.update-config', data);
                    socket.emit('pool-crawler:command-response', {
                        success: true,
                        command: 'update-config',
                        message: '配置更新请求已发送',
                        timestamp: Date.now()
                    });
                } catch (error) {
                    socket.emit('pool-crawler:command-response', {
                        success: false,
                        command: 'update-config',
                        message: `配置更新失败: ${error}`,
                        timestamp: Date.now()
                    });
                }
            });

            socket.on('pool-crawler:update-filters', async (data) => {
                console.log(`🏊 客户端请求更新筛选器: ${socket.id}`);
                try {
                    await this.eventBus.emit('pool-crawler.command.update-filters', data);
                    socket.emit('pool-crawler:command-response', {
                        success: true,
                        command: 'update-filters',
                        message: '筛选器更新请求已发送',
                        timestamp: Date.now()
                    });
                } catch (error) {
                    socket.emit('pool-crawler:command-response', {
                        success: false,
                        command: 'update-filters',
                        message: `筛选器更新失败: ${error}`,
                        timestamp: Date.now()
                    });
                }
            });

            // 处理断开连接
            socket.on('disconnect', (reason) => {
                console.log(`🔌 Socket.IO客户端断开: ${socket.id}, 原因: ${reason}`);
                
                // 🔧 修复：清理socket监听器，防止内存泄漏
                socket.removeAllListeners();
            });

            // 心跳检测
            socket.on('ping', () => {
                socket.emit('pong', { timestamp: Date.now() });
            });
        });
    }

    private bindEventBusListeners() {
        // 🔧 修复：跟踪所有订阅ID，便于清理
        
        // 监听策略状态更新
        const strategyStatusSub = this.eventBus.subscribe('strategy.status.update', async (data) => {
            console.log('📡 Socket.IO广播策略状态更新: 策略', data?.instanceId || 'unknown');

            this.io.to('strategy-monitor').emit('strategy:status-update', {
                type: 'strategy-status-update',
                data: data,
                timestamp: Date.now()
            });
        });
        this.eventBusSubscriptions.push(strategyStatusSub);

        // 🔥 监听智能止损数据更新
        const smartStopLossSub = this.eventBus.subscribe('strategy.smart-stop-loss.update', async (data) => {
            console.log('📡 Socket.IO广播智能止损数据: 策略', data?.instanceId || 'unknown');

            this.io.to('strategy-monitor').emit('strategy:smart-stop-loss', {
                type: 'smart-stop-loss-update',
                data: data,
                timestamp: Date.now()
            });
        });
        this.eventBusSubscriptions.push(smartStopLossSub);

        // 🔥 监听池爬虫状态更新
        const poolCrawlerStatusSub = this.eventBus.subscribe('pool-crawler.status.update', async (data) => {
            console.log('📡 Socket.IO广播池爬虫状态更新:', data?.status || 'unknown');

            this.io.to('pool-crawler').emit('pool-crawler:status-update', {
                type: 'pool-crawler-status-update',
                data: data,
                timestamp: Date.now()
            });
        });
        this.eventBusSubscriptions.push(poolCrawlerStatusSub);

        // 🔥 监听池发现通知
        const poolDiscoveredSub = this.eventBus.subscribe('pool-crawler.pools.discovered', async (data) => {
            console.log('📡 Socket.IO广播池发现通知:', data?.pools?.length || 0, '个池');

            this.io.to('pool-crawler').emit('pool-crawler:pools-discovered', {
                type: 'pools-discovered',
                data: data,
                timestamp: Date.now()
            });
        });
        this.eventBusSubscriptions.push(poolDiscoveredSub);

        // 🔥 监听合格池通知
        const poolQualifiedSub = this.eventBus.subscribe('pool-crawler.pools.qualified', async (data) => {
            console.log('📡 Socket.IO广播合格池通知:', data?.pools?.length || 0, '个合格池');

            this.io.to('pool-crawler').emit('pool-crawler:pools-qualified', {
                type: 'pools-qualified',
                data: data,
                timestamp: Date.now()
            });
        });
        this.eventBusSubscriptions.push(poolQualifiedSub);

        // 🔥 监听过滤器配置更新
        const filtersUpdatedSub = this.eventBus.subscribe('pool-crawler.filters.updated', async (data) => {
            console.log('📡 Socket.IO广播过滤器配置更新');

            this.io.to('pool-crawler').emit('pool-crawler:filters-updated', {
                type: 'filters-updated',
                data: data,
                timestamp: Date.now()
            });
        });
        this.eventBusSubscriptions.push(filtersUpdatedSub);

        // 🔥 监听爬虫错误通知
        const crawlerErrorSub = this.eventBus.subscribe('pool-crawler.error', async (data) => {
            console.log('📡 Socket.IO广播爬虫错误通知:', data?.error || 'unknown');

            this.io.to('pool-crawler').emit('pool-crawler:error', {
                type: 'crawler-error',
                data: data,
                timestamp: Date.now()
            });
        });
        this.eventBusSubscriptions.push(crawlerErrorSub);
    }

    // 手动广播消息
    public broadcastToStrategyMonitor(event: string, data: any) {
        this.io.to('strategy-monitor').emit(event, {
            type: event,
            data: data,
            timestamp: Date.now()
        });
    }

    // 🔥 手动广播池爬虫消息
    public broadcastToPoolCrawler(event: string, data: any) {
        this.io.to('pool-crawler').emit(event, {
            type: event,
            data: data,
            timestamp: Date.now()
        });
    }

    // 获取连接的客户端数量
    public getConnectedClientsCount(): number {
        return this.io.sockets.sockets.size;
    }

    // 获取订阅策略监控的客户端数量
    public async getStrategyMonitorSubscribersCount(): Promise<number> {
        const room = this.io.sockets.adapter.rooms.get('strategy-monitor');
        return room ? room.size : 0;
    }

    // 🔥 获取订阅池爬虫监控的客户端数量
    public async getPoolCrawlerSubscribersCount(): Promise<number> {
        const room = this.io.sockets.adapter.rooms.get('pool-crawler');
        return room ? room.size : 0;
    }

    /**
     * 🔧 修复：清理所有事件监听器，防止内存泄漏
     */
    public cleanup(): void {
        console.log('🧹 Socket.IO服务开始清理...');

        // 取消所有EventBus订阅
        this.eventBusSubscriptions.forEach(subscriptionId => {
            this.eventBus.unsubscribe(subscriptionId);
        });
        this.eventBusSubscriptions = [];

        // 关闭所有Socket.IO连接
        this.io.sockets.disconnectSockets(true);

        // 关闭Socket.IO服务器
        this.io.close();

        console.log('✅ Socket.IO服务清理完成');
    }

    /**
     * 🔧 修复：检查是否需要清理（防止重复初始化）
     */
    public static cleanupExisting(existingService: SocketIOService | null): void {
        if (existingService) {
            existingService.cleanup();
        }
    }
} 