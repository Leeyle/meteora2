/**
 * 简单Y策略模块化架构导出
 * 
 * 这个文件导出所有模块化组件，方便在其他地方使用
 */

// 类型定义
export * from './types';

// 核心服务模块
export { SimpleYPositionService } from './SimpleYPositionService';
export { SimpleYMonitoringService } from './SimpleYMonitoringService';
export { SimpleYRiskService } from './SimpleYRiskService';
export { SimpleYUtilityService } from './SimpleYUtilityService';

// 模块化执行器（如果需要的话）
// export { SimpleYModularExecutor } from './SimpleYModularExecutor';

/**
 * 模块化架构使用指南：
 * 
 * 1. 在现有的SimpleYExecutor中注入这些服务
 * 2. 将原有的功能逐步迁移到对应的服务模块中
 * 3. 使用SimpleYModuleContext在模块间传递上下文
 * 4. 每个模块都是独立可测试的单元
 * 
 * 示例用法：
 * ```typescript
 * // 在SimpleYExecutor中
 * constructor(
 *   @inject(SimpleYPositionService) private positionService: ISimpleYPositionService,
 *   @inject(SimpleYMonitoringService) private monitoringService: ISimpleYMonitoringService,
 *   // ... 其他服务
 * ) {}
 * 
 * // 使用模块
 * const context = { instanceId, config, state };
 * const result = await this.positionService.createPosition(context);
 * ```
 */ 