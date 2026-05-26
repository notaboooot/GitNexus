# GitNexus CLI 完全指南

> 版本: 1.6.5 | 更新日期: 2026-05-21

GitNexus 是一个为 AI 代理提供代码智能的工具，通过知识图谱索引代码库，支持 MCP 协议与 Cursor、Claude Code、Codex 等编辑器集成。

---

## 目录

1. [安装与配置](#1-安装与配置)
2. [核心命令](#2-核心命令)
3. [索引管理命令](#3-索引管理命令)
4. [查询工具命令](#4-查询工具命令)
5. [仓库组管理命令](#5-仓库组管理命令)
6. [Wiki 生成命令](#6-wiki-生成命令)
7. [服务命令](#7-服务命令)
8. [环境变量](#8-环境变量)
9. [配置文件](#9-配置文件)
10. [最佳实践](#10-最佳实践)

---

## 1. 安装与配置

### 全局安装

```bash
# 使用 npm
npm install -g gitnexus

# 使用 npx（无需安装）
npx gitnexus --help
```

### 系统要求

- **Node.js**: >= 22.0.0
- **可选依赖**: Python3、make、g++（用于编译 tree-sitter 原生绑定）

### 快速跳过可选依赖安装

```bash
# 跳过 Dart/Proto 语法解析器编译，安装更快
GITNEXUS_SKIP_OPTIONAL_GRAMMARS=1 npm install -g gitnexus
```

### 首次配置

```bash
# 自动配置 MCP（一次性设置）
gitnexus setup
```

---

## 2. 核心命令

### 2.1 `gitnexus setup` - 环境配置

一次性配置 MCP 服务，支持自动检测已安装的编辑器。

**语法:**
```bash
gitnexus setup
```

**功能:**
- 自动检测 Cursor、Claude Code、OpenCode、Codex 等编辑器
- 写入正确的全局 MCP 配置文件
- 注册 GitNexus hooks（用于 Claude Code）

**配置文件位置:**
| 编辑器 | 配置文件 |
|--------|----------|
| Claude Code | `~/.claude/settings.json` |
| Cursor | `~/.cursor/mcp.json` |
| Codex | `~/.codex/config.toml` |
| OpenCode | `~/.config/opencode/config.json` |

---

### 2.2 `gitnexus analyze` - 索引代码库

索引代码库，生成知识图谱。这是最核心的命令。

**语法:**
```bash
gitnexus analyze [path] [options]
```

**选项:**

| 选项 | 说明 | 默认值 |
|------|------|--------|
| `-f, --force` | 强制重新索引（即使索引是最新的） | `false` |
| `--embeddings [limit]` | 启用语义搜索嵌入生成 | 关闭 |
| `--drop-embeddings` | 重建时删除现有嵌入 | `false` |
| `--skills` | 从检测到的社区生成仓库特定技能文件 | `false` |
| `--skip-agents-md` | 跳过更新 AGENTS.md 和 CLAUDE.md | `false` |
| `--no-stats` | 从 AGENTS.md/CLAUDE.md 中省略文件/符号计数 | `false` |
| `--skip-skills` | 跳过安装标准 GitNexus 技能文件 | `false` |
| `--index-only` | 纯索引模式，跳过所有文件注入 | `false` |
| `--skip-git` | 跳过 git 根目录发现，将当前目录作为索引根 | `false` |
| `--name <alias>` | 为仓库注册自定义名称 | - |
| `--allow-duplicate-name` | 允许重复名称注册 | `false` |
| `-v, --verbose` | 显示详细警告信息 | `false` |
| `--max-file-size <kb>` | 跳过大于此大小的文件（KB） | `512` |
| `--worker-timeout <seconds>` | Worker 超时时间 | `30` |
| `--embedding-threads <n>` | 限制嵌入 CPU 线程数 | 自动 |
| `--embedding-batch-size <n>` | 每批嵌入节点数 | 自动 |
| `--embedding-sub-batch-size <n>` | 每次嵌入调用的块数 | 自动 |
| `--embedding-device <device>` | 嵌入设备: auto/cpu/dml/cuda/wasm | `auto` |

**示例:**

```bash
# 基本索引
gitnexus analyze

# 强制重新索引
gitnexus analyze --force

# 启用语义搜索（推荐）
gitnexus analyze --embeddings

# 生成技能文件
gitnexus analyze --skills

# 完整索引（推荐用于首次索引）
gitnexus analyze --force --embeddings --skills

# 索引非 Git 目录
gitnexus analyze /path/to/folder --skip-git

# 大型仓库增加超时
gitnexus analyze --worker-timeout 60

# 自定义仓库名称
gitnexus analyze --name my-project
```

**注意事项:**
- 首次索引建议使用 `--embeddings --skills` 获得最佳体验
- 嵌入生成会增加索引时间，但显著提升搜索质量
- 默认嵌入节点上限为 50,000，可通过 `--embeddings 0` 取消限制

---

## 3. 索引管理命令

### 3.1 `gitnexus list` - 列出已索引仓库

**语法:**
```bash
gitnexus list
```

**输出示例:**
```
┌──────────────────────────────────────────────────────────────────────────────┐
│ name            path                           status    files   symbols      │
├──────────────────────────────────────────────────────────────────────────────┤
│ my-app          /Users/dev/projects/my-app    current   234     1,892        │
│ another-repo    /Users/dev/another-repo       stale     156     987          │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

### 3.2 `gitnexus status` - 查看索引状态

显示当前仓库的索引状态。

**语法:**
```bash
gitnexus status
```

**输出包括:**
- 索引是否最新
- 文件和符号计数
- 最后索引时间
- 嵌入状态

---

### 3.3 `gitnexus index` - 注册现有索引

将现有的 `.gitnexus/` 目录注册到全局注册表，无需重新分析。

**语法:**
```bash
gitnexus index [path...] [options]
```

**选项:**
| 选项 | 说明 |
|------|------|
| `-f, --force` | 即使缺少 meta.json 也注册 |
| `--allow-non-git` | 允许注册非 Git 仓库 |

**示例:**
```bash
# 注册当前目录
gitnexus index

# 注册多个路径
gitnexus index /path/to/repo1 /path/to/repo2
```

---

### 3.4 `gitnexus clean` - 清理索引

删除 GitNexus 索引。

**语法:**
```bash
gitnexus clean [options]
```

**选项:**
| 选项 | 说明 |
|------|------|
| `-f, --force` | 跳过确认提示 |
| `--all` | 清理所有已索引仓库 |

**示例:**
```bash
# 清理当前仓库索引（需确认）
gitnexus clean

# 强制清理当前仓库
gitnexus clean -f

# 清理所有仓库索引
gitnexus clean --all --force
```

---

### 3.5 `gitnexus remove` - 远程删除索引

通过别名、名称或绝对路径删除仓库索引，无需进入仓库目录。

**语法:**
```bash
gitnexus remove <target> [options]
```

**选项:**
| 选项 | 说明 |
|------|------|
| `-f, --force` | 跳过确认提示 |

**示例:**
```bash
# 按名称删除
gitnexus remove my-app

# 按路径删除
gitnexus remove /Users/dev/projects/my-app
```

---

### 3.6 `gitnexus doctor` - 诊断运行时环境

显示运行时平台能力和嵌入配置。

**语法:**
```bash
gitnexus doctor
```

**输出包括:**
- Node.js 版本
- 平台信息（macOS/Windows/Linux）
- 嵌入设备可用性（CPU/CUDA/DML/WebGPU）
- Tree-sitter 解析器状态

---

## 4. 查询工具命令

### 4.1 `gitnexus query` - 搜索执行流

搜索与概念相关的执行流程。

**语法:**
```bash
gitnexus query <search_query> [options]
```

**选项:**
| 选项 | 说明 | 默认值 |
|------|------|--------|
| `-r, --repo <name>` | 目标仓库名称 | 自动检测 |
| `-c, --context <text>` | 任务上下文，改善排名 | - |
| `-g, --goal <text>` | 查找目标 | - |
| `-l, --limit <n>` | 最大返回进程数 | `5` |
| `--content` | 包含完整符号源代码 | `false` |

**示例:**
```bash
# 搜索认证相关代码
gitnexus query "authentication"

# 带上下文搜索
gitnexus query "login" -c "user authentication flow"

# 指定目标
gitnexus query "database" -g "find connection pooling"

# 包含源代码
gitnexus query "error handling" --content
```

---

### 4.2 `gitnexus context` - 符号上下文视图

获取代码符号的 360 度视图：调用者、被调用者、参与的进程。

**语法:**
```bash
gitnexus context [name] [options]
```

**选项:**
| 选项 | 说明 |
|------|------|
| `-r, --repo <name>` | 目标仓库名称 |
| `-u, --uid <uid>` | 直接使用符号 UID（零歧义查找） |
| `-f, --file <path>` | 文件路径，消除名称歧义 |
| `--content` | 包含完整符号源代码 |

**示例:**
```bash
# 查看函数上下文
gitnexus context validateUser

# 指定文件消除歧义
gitnexus context validateUser -f src/auth/validate.ts

# 使用 UID 精确查找
gitnexus context -u "Function:validateUser:src/auth/validate.ts:15"

# 包含源代码
gitnexus context handleLogin --content
```

---

### 4.3 `gitnexus impact` - 影响范围分析

分析修改符号的影响范围（爆破半径分析）。

**语法:**
```bash
gitnexus impact <target> [options]
```

**选项:**
| 选项 | 说明 | 默认值 |
|------|------|--------|
| `-d, --direction <dir>` | upstream（依赖者）或 downstream（依赖） | `upstream` |
| `-r, --repo <name>` | 目标仓库名称 | 自动检测 |
| `--depth <n>` | 最大关系深度 | `3` |
| `--include-tests` | 包含测试文件 | `false` |

**方向说明:**
- `upstream`: 谁依赖我？（修改会影响谁）
- `downstream`: 我依赖谁？（修改会受谁影响）

**示例:**
```bash
# 查看谁依赖 UserService
gitnexus impact UserService

# 查看我依赖谁
gitnexus impact UserService -d downstream

# 增加深度
gitnexus impact UserService --depth 5

# 包含测试文件
gitnexus impact UserService --include-tests
```

**输出示例:**
```
TARGET: Class UserService (src/services/user.ts)

UPSTREAM (what depends on this):
  Depth 1 (WILL BREAK):
    handleLogin [CALLS 90%] -> src/api/auth.ts:45
    handleRegister [CALLS 90%] -> src/api/auth.ts:78
  Depth 2 (LIKELY AFFECTED):
    authRouter [IMPORTS] -> src/routes/auth.ts
```

---

### 4.4 `gitnexus cypher` - 原始 Cypher 查询

执行原始 Cypher 图查询。

**语法:**
```bash
gitnexus cypher <query> [options]
```

**选项:**
| 选项 | 说明 |
|------|------|
| `-r, --repo <name>` | 目标仓库名称 |

**示例:**
```bash
# 查找高置信度的认证函数调用
gitnexus cypher "MATCH (c:Community {heuristicLabel: 'Authentication'})<-[:MEMBER_OF]-(fn)
MATCH (caller)-[r:CALLS]->(fn)
WHERE r.confidence > 0.8
RETURN caller.name, fn.name, r.confidence
ORDER BY r.confidence DESC"

# 查找所有继承关系
gitnexus cypher "MATCH (child)-[:EXTENDS]->(parent)
RETURN child.name, parent.name"
```

---

### 4.5 `gitnexus detect-changes` - Git 变更检测

将 git diff 映射到索引符号和受影响的执行流程。

**语法:**
```bash
gitnexus detect-changes [options]
```

**选项:**
| 选项 | 说明 | 默认值 |
|------|------|--------|
| `-s, --scope <scope>` | 分析范围: unstaged/staged/all/compare | `unstaged` |
| `-b, --base-ref <ref>` | compare 范围的基准分支/提交 | - |
| `-r, --repo <name>` | 目标仓库名称 | 自动检测 |

**示例:**
```bash
# 检测未暂存更改
gitnexus detect-changes

# 检测已暂存更改
gitnexus detect-changes -s staged

# 检测所有更改
gitnexus detect-changes -s all

# 与 main 分支比较
gitnexus detect-changes -s compare -b main
```

---

### 4.6 `gitnexus augment` - 搜索增强

使用知识图谱上下文增强搜索模式（供 hooks 使用）。

**语法:**
```bash
gitnexus augment <pattern>
```

**示例:**
```bash
gitnexus augment "auth"
```

---

## 5. 仓库组管理命令

仓库组用于管理多仓库/单体仓库的跨仓库影响分析。

### 5.1 `gitnexus group create` - 创建仓库组

**语法:**
```bash
gitnexus group create <name>
```

**示例:**
```bash
gitnexus group create my-monorepo
```

**输出:**
- 创建 `~/.gitnexus/groups/<name>/group.yaml` 模板文件

---

### 5.2 `gitnexus group add` - 添加仓库到组

**语法:**
```bash
gitnexus group add <group> <groupPath> <registryName>
```

**参数:**
- `group`: 组名
- `groupPath`: 层级路径（如 `hr/hiring/backend`）
- `registryName`: 注册表中的仓库名（来自 `gitnexus list`）

**示例:**
```bash
# 添加后端服务
gitnexus group add my-monorepo app/backend my-backend-repo

# 添加前端服务
gitnexus group add my-monorepo app/frontend my-frontend-repo
```

---

### 5.3 `gitnexus group remove` - 从组中移除仓库

**语法:**
```bash
gitnexus group remove <group> <path>
```

**示例:**
```bash
gitnexus group remove my-monorepo app/backend
```

---

### 5.4 `gitnexus group list` - 列出仓库组

**语法:**
```bash
gitnexus group list [name]
```

**示例:**
```bash
# 列出所有组
gitnexus group list

# 查看特定组详情
gitnexus group list my-monorepo
```

---

### 5.5 `gitnexus group status` - 检查组状态

**语法:**
```bash
gitnexus group status <name>
```

**输出:**
- 各仓库的索引状态
- 是否需要重新索引

---

### 5.6 `gitnexus group sync` - 同步契约注册表

提取契约并构建跨链接。

**语法:**
```bash
gitnexus group sync <name> [options]
```

**选项:**
| 选项 | 说明 |
|------|------|
| `--skip-embeddings` | 仅使用精确匹配和 BM25 |
| `--exact-only` | 仅使用精确匹配 |
| `--allow-stale` | 跳过过期索引警告 |
| `--verbose` | 显示每个跨链接详情 |
| `--json` | JSON 输出 |

**示例:**
```bash
# 同步契约
gitnexus group sync my-monorepo

# 详细输出
gitnexus group sync my-monorepo --verbose

# JSON 输出
gitnexus group sync my-monorepo --json
```

---

### 5.7 `gitnexus group impact` - 跨仓库影响分析

分析组内跨仓库的符号影响。

**语法:**
```bash
gitnexus group impact <name> [options]
```

**选项:**
| 选项 | 说明 | 默认值 |
|------|------|--------|
| `--target <symbol>` | 要分析的符号或文件名 | - |
| `--repo <groupPath>` | 成员路径（如 app/backend） | - |
| `--direction <dir>` | upstream 或 downstream | `upstream` |
| `--service <path>` | 单体仓库服务目录前缀 | - |
| `--subgroup <path>` | 限制参与跨传播的组仓库 | - |
| `--max-depth <n>` | 最大图遍历深度 | - |
| `--cross-depth <n>` | 跨仓库跳转深度 | - |
| `--min-confidence <n>` | 最小关系置信度（0-1） | - |
| `--include-tests` | 包含测试文件 | `false` |
| `--timeout-ms <n>` | 第一阶段本地影响超时 | - |
| `--json` | JSON 输出 | `false` |

**示例:**
```bash
# 分析跨仓库影响
gitnexus group impact my-monorepo --target UserService --repo app/backend

# 指定方向
gitnexus group impact my-monorepo --target UserService --repo app/backend --direction downstream

# JSON 输出
gitnexus group impact my-monorepo --target UserService --repo app/backend --json
```

---

### 5.8 `gitnexus group query` - 跨仓库搜索

搜索组内所有仓库的执行流程。

**语法:**
```bash
gitnexus group query <name> <query> [options]
```

**选项:**
| 选项 | 说明 | 默认值 |
|------|------|--------|
| `--subgroup <path>` | 限制搜索范围 | - |
| `--limit <n>` | 最大合并结果数 | `5` |
| `--json` | JSON 输出 | `false` |

**示例:**
```bash
# 跨仓库搜索
gitnexus group query my-monorepo "authentication"

# 限制范围
gitnexus group query my-monorepo "database" --subgroup app/backend
```

---

### 5.9 `gitnexus group contracts` - 查看契约注册表

**语法:**
```bash
gitnexus group contracts <name> [options]
```

**选项:**
| 选项 | 说明 |
|------|------|
| `--type <type>` | 按契约类型过滤 |
| `--repo <repo>` | 按仓库过滤 |
| `--unmatched` | 仅显示未匹配的契约 |
| `--json` | JSON 输出 |

**示例:**
```bash
# 查看所有契约
gitnexus group contracts my-monorepo

# 仅查看未匹配的契约
gitnexus group contracts my-monorepo --unmatched

# 按类型过滤
gitnexus group contracts my-monorepo --type API
```

---

## 6. Wiki 生成命令

### `gitnexus wiki` - 从知识图谱生成 Wiki

使用 LLM 从知识图谱生成仓库文档。

**语法:**
```bash
gitnexus wiki [path] [options]
```

**选项:**
| 选项 | 说明 | 默认值 |
|------|------|--------|
| `-f, --force` | 强制重新生成 | `false` |
| `--provider <provider>` | LLM 提供商: openai 或 cursor | `openai` |
| `--model <model>` | LLM 模型或 Azure 部署名 | `minimax/minimax-m2.5` |
| `--base-url <url>` | LLM API 基础 URL | - |
| `--api-key <key>` | API 密钥（保存到 ~/.gitnexus/config.json） | - |
| `--api-version <version>` | Azure API 版本 | - |
| `--reasoning-model` | 标记为推理模型（o1/o3/o4-mini） | `false` |
| `--no-reasoning-model` | 禁用推理模型模式 | `false` |
| `--concurrency <n>` | 并行 LLM 调用数 | `3` |
| `--timeout <seconds>` | LLM 请求超时（秒） | 禁用 |
| `--retries <n>` | 最大重试次数 | `3` |
| `--gist` | 生成后发布为 GitHub Gist | `false` |
| `-v, --verbose` | 显示详细输出 | `false` |
| `--review` | 在生成页面前审查模块结构 | `false` |
| `--lang <lang>` | 输出语言（english/chinese/spanish/japanese） | `english` |

**示例:**

```bash
# 基本生成（需要 API 密钥）
gitnexus wiki

# 使用 OpenAI
gitnexus wiki --provider openai --model gpt-4o --api-key sk-xxx

# 使用 Azure OpenAI
gitnexus wiki \
  --base-url https://my-resource.openai.azure.com/openai/v1 \
  --api-key my-azure-key \
  --api-version 2024-10-21

# 使用推理模型
gitnexus wiki --model o1-mini --reasoning-model

# 中文文档
gitnexus wiki --lang chinese

# 发布为 Gist
gitnexus wiki --gist

# 审查模式（先生成模块结构，人工确认后生成页面）
gitnexus wiki --review
```

**注意事项:**
- 需要设置 LLM API 密钥
- 首次使用会提示输入 API 密钥
- API 密钥保存在 `~/.gitnexus/config.json`

---

## 7. 服务命令

### 7.1 `gitnexus mcp` - 启动 MCP 服务器

启动 MCP 服务器（stdio 模式），服务所有已索引仓库。

**语法:**
```bash
gitnexus mcp
```

**用途:**
- 供 Claude Code、Cursor、Codex 等编辑器通过 MCP 协议访问
- 通常由编辑器自动调用，无需手动运行

**编辑器配置示例:**

```json
// ~/.cursor/mcp.json
{
  "mcpServers": {
    "gitnexus": {
      "command": "npx",
      "args": ["-y", "gitnexus@latest", "mcp"]
    }
  }
}
```

---

### 7.2 `gitnexus serve` - 启动 HTTP 服务器

启动本地 HTTP 服务器，供 Web UI 连接。

**语法:**
```bash
gitnexus serve [options]
```

**选项:**
| 选项 | 说明 | 默认值 |
|------|------|--------|
| `-p, --port <port>` | 端口号 | `4747` |
| `--host <host>` | 绑定地址 | `127.0.0.1` |

**示例:**
```bash
# 默认启动
gitnexus serve

# 指定端口
gitnexus serve -p 8080

# 允许远程访问
gitnexus serve --host 0.0.0.0
```

**访问 Web UI:**
- 启动后访问 [gitnexus.vercel.app](https://gitnexus.vercel.app)
- Web UI 会自动检测本地服务器

---

### 7.3 `gitnexus eval-server` - 评估服务器

启动轻量级 HTTP 服务器，用于 SWE-bench 评估等场景。

**语法:**
```bash
gitnexus eval-server [options]
```

**选项:**
| 选项 | 说明 | 默认值 |
|------|------|--------|
| `-p, --port <port>` | 端口号 | `4848` |
| `--host <host>` | 绑定地址 | `127.0.0.1` |
| `--idle-timeout <seconds>` | 空闲超时自动关闭（0=禁用） | `0` |

**示例:**
```bash
# 默认启动
gitnexus eval-server

# 5分钟空闲后自动关闭
gitnexus eval-server --idle-timeout 300
```

---

### 7.4 `gitnexus publish` - 发布到注册表

通知 understand-quickly 注册表仓库有新索引。

**语法:**
```bash
gitnexus publish [path] [options]
```

**选项:**
| 选项 | 说明 |
|------|------|
| `--id <owner/repo>` | 覆盖注册表 ID |
| `--skip-git` | 跳过 git 根目录发现 |

**前提条件:**
- 设置 `UNDERSTAND_QUICKLY_TOKEN` 环境变量
- Token 需要对 `looptech-ai/understand-quickly` 有 `Repository dispatches: write` 权限

**示例:**
```bash
export UNDERSTAND_QUICKLY_TOKEN=ghp_xxx
gitnexus publish
```

---

## 8. 环境变量

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `GITNEXUS_NO_GITIGNORE` | 跳过 .gitignore 解析（仍读取 .gitnexusignore） | - |
| `GITNEXUS_MAX_FILE_SIZE` | 大文件跳过阈值（KB） | `512` |
| `GITNEXUS_WORKER_SUB_BATCH_TIMEOUT_MS` | Worker 空闲超时（毫秒） | `30000` |
| `GITNEXUS_WORKER_SUB_BATCH_MAX_BYTES` | Worker 作业字节预算 | `8388608` |
| `GITNEXUS_EMBEDDING_THREADS` | 限制本地 ONNX CPU 线程 | 自动 |
| `GITNEXUS_SEMANTIC_EXACT_SCAN_LIMIT` | 嵌入精确扫描回退限制 | `10000` |
| `GITNEXUS_SKIP_OPTIONAL_GRAMMARS` | 跳过可选语法解析器编译 | - |
| `UNDERSTAND_QUICKLY_TOKEN` | understand-quickly 注册表 token | - |

**示例:**
```bash
# 跳过大文件
GITNEXUS_MAX_FILE_SIZE=1024 gitnexus analyze

# 增加 Worker 超时
GITNEXUS_WORKER_SUB_BATCH_TIMEOUT_MS=60000 gitnexus analyze
```

---

## 9. 配置文件

### 9.1 `.gitnexusignore`

类似 `.gitignore` 的忽略文件，控制哪些文件不被索引。

**位置:** 仓库根目录

**语法:** 与 `.gitignore` 相同

**示例:**
```
# 忽略生成的文件
*.generated.ts
__generated__/

# 否定规则：强制索引某些目录
!__tests__/
```

### 9.2 `~/.gitnexus/registry.json`

全局注册表，记录所有已索引仓库。

**结构:**
```json
{
  "repos": {
    "/path/to/repo": {
      "name": "my-repo",
      "indexedAt": "2026-05-21T10:00:00Z",
      "files": 234,
      "symbols": 1892
    }
  }
}
```

### 9.3 `~/.gitnexus/config.json`

全局配置，存储 API 密钥等。

**结构:**
```json
{
  "llm": {
    "provider": "openai",
    "model": "gpt-4o",
    "baseUrl": "https://api.openai.com/v1",
    "apiKey": "sk-xxx"
  }
}
```

### 9.4 `~/.gitnexus/groups/<name>/group.yaml`

仓库组配置文件。

**结构:**
```yaml
name: my-monorepo
repos:
  - path: app/backend
    registryName: my-backend-repo
  - path: app/frontend
    registryName: my-frontend-repo
```

---

## 10. 最佳实践

### 10.1 首次使用

```bash
# 1. 安装
npm install -g gitnexus

# 2. 配置 MCP
gitnexus setup

# 3. 索引代码库（推荐选项）
cd /path/to/your/project
gitnexus analyze --embeddings --skills
```

### 10.2 日常使用

```bash
# 快速更新索引
gitnexus analyze

# 代码修改后检查影响
gitnexus detect-changes

# 查看符号上下文
gitnexus context myFunction
```

### 10.3 多仓库管理

```bash
# 创建组
gitnexus group create my-project

# 添加仓库
gitnexus group add my-project backend my-backend
gitnexus group add my-project frontend my-frontend

# 同步契约
gitnexus group sync my-project

# 跨仓库影响分析
gitnexus group impact my-project --target UserService --repo backend
```

### 10.4 CI/CD 集成

```bash
# 在 CI 中索引
gitnexus analyze --index-only

# 检测变更影响
gitnexus detect-changes -s compare -b main
```

### 10.5 性能优化

- **大型仓库**: 增加 `--worker-timeout`
- **嵌入生成**: 使用 `--embedding-device cuda` 利用 GPU
- **跳过不需要的解析**: 创建 `.gitnexusignore`

---

## 支持的语言

| 语言 | 导入解析 | 命名绑定 | 导出 | 继承 | 类型注解 | 构造函数推断 |
|------|----------|----------|------|------|----------|--------------|
| TypeScript | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| JavaScript | ✓ | ✓ | ✓ | ✓ | - | ✓ |
| Python | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Java | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Kotlin | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| C# | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Go | ✓ | - | ✓ | ✓ | ✓ | ✓ |
| Rust | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| PHP | ✓ | ✓ | ✓ | - | ✓ | ✓ |
| Ruby | ✓ | - | ✓ | ✓ | - | ✓ |
| Swift | - | - | ✓ | ✓ | ✓ | ✓ |
| C | - | - | ✓ | - | ✓ | ✓ |
| C++ | - | - | ✓ | ✓ | ✓ | ✓ |
| Dart | ✓ | - | ✓ | ✓ | ✓ | ✓ |

---

## 故障排除

### 索引失败

```bash
# 检查环境
gitnexus doctor

# 增加超时
gitnexus analyze --worker-timeout 60

# 查看详细日志
gitnexus analyze -v
```

### MCP 连接问题

```bash
# 重新配置
gitnexus setup

# 检查索引
gitnexus list
```

### 嵌入生成慢

```bash
# 使用 GPU
gitnexus analyze --embeddings --embedding-device cuda

# 限制线程
gitnexus analyze --embeddings --embedding-threads 4
```

---

## 相关链接

- **官方文档**: [github.com/abhigyanpatwari/GitNexus](https://github.com/abhigyanpatwari/GitNexus)
- **Web UI**: [gitnexus.vercel.app](https://gitnexus.vercel.app)
- **Discord**: [discord.gg/MgJrmsqr62](https://discord.gg/MgJrmsqr62)
- **NPM**: [npmjs.com/package/gitnexus](https://www.npmjs.com/package/gitnexus)
