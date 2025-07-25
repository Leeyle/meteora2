#!/bin/bash

# DLMM流动性管理器 - 系统功能测试脚本

set -e

echo "🧪 DLMM系统功能测试"
echo "===================="

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# 测试结果统计
TESTS_PASSED=0
TESTS_FAILED=0
TESTS_TOTAL=0

# 测试函数
run_test() {
    local test_name="$1"
    local test_command="$2"
    
    TESTS_TOTAL=$((TESTS_TOTAL + 1))
    echo -e "${BLUE}🔍 测试: $test_name${NC}"
    
    if eval "$test_command" > /dev/null 2>&1; then
        echo -e "${GREEN}✅ 通过: $test_name${NC}"
        TESTS_PASSED=$((TESTS_PASSED + 1))
        return 0
    else
        echo -e "${RED}❌ 失败: $test_name${NC}"
        TESTS_FAILED=$((TESTS_FAILED + 1))
        return 1
    fi
}

# TypeScript编译测试
test_typescript_compilation() {
    echo -e "${BLUE}🔨 TypeScript编译测试${NC}"
    
    run_test "TypeScript语法检查" "npx tsc --noEmit"
    
    if [ -f "tsconfig.json" ]; then
        run_test "TypeScript配置验证" "npx tsc --showConfig > /dev/null"
    fi
}

# 模块导入测试
test_module_imports() {
    echo -e "${BLUE}📦 模块导入测试${NC}"
    
    # 测试主要模块是否可以导入
    run_test "策略引擎模块导入" "node -e \"require('./dist/services/strategy/StrategyEngine.js') || console.log('跳过-构建文件不存在')\""
    
    run_test "依赖注入容器" "node -e \"require('./dist/di/container.js') || console.log('跳过-构建文件不存在')\""
    
    # 测试类型定义
    run_test "策略类型定义" "node -e \"require('./dist/types/strategy.js') || console.log('跳过-构建文件不存在')\""
    
    run_test "接口定义" "node -e \"require('./dist/types/interfaces.js') || console.log('跳过-构建文件不存在')\""
}

# 配置文件测试
test_configuration() {
    echo -e "${BLUE}⚙️  配置文件测试${NC}"
    
    run_test "package.json存在" "[ -f package.json ]"
    run_test "tsconfig.json存在" "[ -f tsconfig.json ]"
    
    if [ -f "package.json" ]; then
        run_test "package.json格式正确" "node -e \"JSON.parse(require('fs').readFileSync('package.json', 'utf8'))\""
    fi
    
    if [ -f "tsconfig.json" ]; then
        run_test "tsconfig.json格式正确" "node -e \"JSON.parse(require('fs').readFileSync('tsconfig.json', 'utf8'))\""
    fi
}

# 源码结构测试
test_source_structure() {
    echo -e "${BLUE}📁 源码结构测试${NC}"
    
    run_test "src目录存在" "[ -d src ]"
    run_test "types目录存在" "[ -d src/types ]"
    run_test "services目录存在" "[ -d src/services ]"
    run_test "strategy服务目录存在" "[ -d src/services/strategy ]"
    
    # 检查核心文件
    run_test "StrategyEngine.ts存在" "[ -f src/services/strategy/StrategyEngine.ts ]"
    run_test "StrategyCore.ts存在" "[ -f src/services/strategy/StrategyCore.ts ]"
    run_test "StrategyScheduler.ts存在" "[ -f src/services/strategy/StrategyScheduler.ts ]"
    
    # 检查类型文件
    run_test "interfaces.ts存在" "[ -f src/types/interfaces.ts ]"
    run_test "strategy.ts存在" "[ -f src/types/strategy.ts ]"
}

# 依赖检查测试
test_dependencies() {
    echo -e "${BLUE}📋 依赖检查测试${NC}"
    
    if [ -f "package.json" ]; then
        # 检查关键依赖
        run_test "inversify依赖存在" "node -e \"const pkg = JSON.parse(require('fs').readFileSync('package.json', 'utf8')); if (!pkg.dependencies || !pkg.dependencies.inversify) throw new Error('missing inversify')\""
        
        run_test "reflect-metadata依赖存在" "node -e \"const pkg = JSON.parse(require('fs').readFileSync('package.json', 'utf8')); if (!pkg.dependencies || !pkg.dependencies['reflect-metadata']) throw new Error('missing reflect-metadata')\""
        
        # 检查开发依赖
        run_test "typescript开发依赖存在" "node -e \"const pkg = JSON.parse(require('fs').readFileSync('package.json', 'utf8')); if (!pkg.devDependencies || !pkg.devDependencies.typescript) throw new Error('missing typescript')\""
    fi
    
    # 检查node_modules
    run_test "node_modules目录存在" "[ -d node_modules ]"
}

# 环境变量测试
test_environment() {
    echo -e "${BLUE}🌍 环境变量测试${NC}"
    
    run_test "env.example存在" "[ -f env.example ]"
    
    if [ -f ".env" ]; then
        run_test ".env文件存在" "[ -f .env ]"
    else
        echo -e "${YELLOW}⚠️  .env文件不存在，这在开发环境中是可选的${NC}"
    fi
}

# 构建测试
test_build() {
    echo -e "${BLUE}🏗️  构建测试${NC}"
    
    if npm run | grep -q "build"; then
        run_test "构建脚本存在" "npm run | grep -q build"
        
        echo -e "${BLUE}执行构建...${NC}"
        if npm run build > build.log 2>&1; then
            run_test "项目构建成功" "true"
            run_test "dist目录生成" "[ -d dist ]"
        else
            run_test "项目构建成功" "false"
            echo -e "${YELLOW}构建日志:${NC}"
            tail -20 build.log
        fi
    else
        echo -e "${YELLOW}⚠️  跳过构建测试（无构建脚本）${NC}"
    fi
}

# API测试（如果服务器正在运行）
test_api() {
    echo -e "${BLUE}🔌 API接口测试${NC}"
    
    # 检查是否有服务器运行在3000端口
    if curl -s http://localhost:3000/health > /dev/null 2>&1; then
        run_test "健康检查接口" "curl -s http://localhost:3000/health | grep -q 'healthy\\|ok'"
        run_test "API根路径" "curl -s http://localhost:3000/api > /dev/null"
    else
        echo -e "${YELLOW}⚠️  跳过API测试（服务器未运行在localhost:3000）${NC}"
        echo -e "${BLUE}提示: 运行 'npm start' 启动服务器后再测试${NC}"
    fi
}

# 文档测试
test_documentation() {
    echo -e "${BLUE}📚 文档测试${NC}"
    
    run_test "README.md存在" "[ -f README.md ]"
    run_test "docs目录存在" "[ -d docs ]"
    
    if [ -d docs ]; then
        run_test "系统架构文档存在" "[ -f docs/README-系统架构与使用指南.md ]"
        run_test "架构图文档存在" "[ -f docs/系统架构图.md ]"
    fi
}

# 执行所有测试
main() {
    echo -e "${BLUE}开始执行系统功能测试...${NC}"
    echo ""
    
    test_source_structure
    echo ""
    
    test_configuration
    echo ""
    
    test_dependencies
    echo ""
    
    test_environment
    echo ""
    
    test_typescript_compilation
    echo ""
    
    test_module_imports
    echo ""
    
    test_build
    echo ""
    
    test_api
    echo ""
    
    test_documentation
    echo ""
    
    # 测试结果汇总
    echo "📊 测试结果汇总"
    echo "================"
    echo -e "总测试数: $TESTS_TOTAL"
    echo -e "${GREEN}通过: $TESTS_PASSED${NC}"
    echo -e "${RED}失败: $TESTS_FAILED${NC}"
    
    if [ $TESTS_FAILED -eq 0 ]; then
        echo ""
        echo -e "${GREEN}🎉 所有测试通过！系统状态良好。${NC}"
        exit 0
    else
        echo ""
        echo -e "${YELLOW}⚠️  部分测试失败，请检查上述错误信息。${NC}"
        exit 1
    fi
}

# 清理函数
cleanup() {
    if [ -f "build.log" ]; then
        rm -f build.log
    fi
}

# 错误处理
trap cleanup EXIT

# 执行主函数
main "$@" 