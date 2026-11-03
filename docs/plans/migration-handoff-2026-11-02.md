# 新项目迁移交接清单

**日期**：2026-11-02  
**目标项目**：`/Users/yao/LLM/GGBond`  
**参考旧项目**：`/Users/yao/LLM/GGbondai`  
**用途**：在新项目目录启动新的开发会话后，按本文核查、实施和验收。本文记录的是代码对比结果，不代表生产部署已经验证。

后续更新：提交 `75f18b727` 已统一源码仓库为 `yaoruiquan/GGBond`、镜像为 `ghcr.io/yaoruiquan/ggbond`。下文的 `GGbondai` 发布目标和远程配置属于交接时快照；可选蓝绿部署的当前范围与迁移策略以 `migration-roadmap.md` 第 7 节为准。

## 1. 开工上下文

后续开发以 **GGBond 新项目为准**，旧项目只读参考。不要整目录覆盖新上游代码，不要重复迁移已经存在的业务功能。

交接时新项目：

- 当前分支：`feat/home-model-plaza`。
- 最近提交：`1221fcadb feat: 首页顶部导航新增模型广场入口`。
- 前一提交：`0bd557ca5 fix: 补齐 GGbond 品牌 Tailwind token 并移除首页 i18n any 断言`。
- 上述提交已在本地，尚未推送。
- 写入本交接文档前，工作区干净；开工必须重新检查。
- `origin` 仍指向 `https://github.com/Wei-Shaw/sub2api.git`，不能直接当作个人发布远程使用。
- 旧项目个人仓库为 `https://github.com/yaoruiquan/GGbondai`。
- 目标运行镜像目前为 `ghcr.io/yaoruiquan/ggbondai`。

先执行只读检查：

```bash
cd /Users/yao/LLM/GGBond
pwd
git status --short
git branch --show-current
git log -5 --oneline
git remote -v
```

不要直接 force push。新目录使用最新上游历史，个人远程仍可能对应旧项目历史；先核查两者关系，再制定同步方式。修改 remote、推送、发布镜像、操作生产环境前应获得明确授权。

## 2. 已完成，不要重复做

- 猪猪侠精细版 SVG 吉祥物、Logo、模型轨道、精选卡片已迁入；Logo、吉祥物及轨道计算文件与旧项目核对一致。
- 中英文 GGbond 文案、红黄配色、登录布局和空状态等品牌内容已部分迁移。
- 首页顶部新增模型广场入口：复用 `model_plaza_enabled`；桌面显示图标和文字，手机显示可访问性标注图标，窄屏允许换行。
- 补齐 Tailwind `shadow-glow-red`、`shadow-card-ggbond`、`twinkle` 动画及 keyframes。
- 中英文首页合并改为 `landing.home`，移除 `any`。
- 后端更新检查仓库、三个主要 Compose 镜像消费者已改为个人地址。

以下功能在新上游中已存在，无需重复开发或 cherry-pick：

- 安全相关提交 `828626804`、`fb22c9212`、`7bce2cfb4` 已通过 HEAD 祖先检查。
- 国内平台支持已有后端平台注册及前端平台目录；需要的是实际账号和路由配置、连通性与计费验收。
- 模型广场已有前后端实现：页面 `/model-plaza`，API `GET /api/v1/model-plaza`。
- 模型广场不是渠道监控 v2；监控管理入口为 `/admin/channels/monitor`。

不要新增重复的 `/models`、`/model-market` 或 `model_market_*` 设置。

## 3. 推荐阶段一：统一发布、安装和更新来源

这是最优先的迁移任务。当前镜像生产者与消费者不一致，可能导致发布后服务器仍拉不到正确镜像。

| 文件（相对新项目根目录） | 已发现状态 | 要做的事 |
|---|---|---|
| `.github/release-tools/release-images.sh` | 发布 `ghcr.io/${owner,,}/sub2api` | 统一个人镜像命名，保留新发布逻辑 |
| `.goreleaser.yaml` | 镜像名称仍含 `/sub2api` | 对齐发布镜像及相关说明 |
| `.goreleaser.simple.yaml` | 镜像名称仍含 `/sub2api` | 同上 |
| `frontend/src/components/common/VersionBadge.vue` | 发布链接、回滚镜像仍指向上游 | 对齐后端更新仓库与实际镜像 |
| `deploy/install.sh` | 仓库仍为 `Wei-Shaw/sub2api` | 只迁移个人仓库目标，保留新鉴权请求行为 |
| `deploy/docker-deploy.sh` | 部署资源仍从上游下载 | 对齐个人资源来源，保留新随机管理员密码逻辑 |
| `backend/internal/service/update_service.go` | 已使用个人更新仓库 | 核对即可，不覆盖新版本解析处理 |
| `deploy/docker-compose{,.local,.standalone}.yml` | 已用个人镜像 | 核对即可，保留新上游环境项 |

### 实施原则

1. 全链路统一目标：源码仓库、Release 页面、二进制下载、镜像构建、镜像拉取、更新与回滚提示。
2. 不直接复制旧 `.github/workflows/release.yml` 替换新版本。
3. 核查新的 release helper、测试和配置之间的命名假设，必要时同步修改测试。
4. 对外发布来源必须对应新项目代码；仅修改本地 remote 不会把新代码自动发布到个人仓库。
5. 优先使用本地 dry-run、配置解析和测试验证，不为了验收直接发布版本。

### 验收

- [ ] 镜像生产者、消费者、在线更新与回滚说明一致。
- [ ] 安装脚本不会无意下载回上游品牌资源。
- [ ] 保留安装脚本随机密码、token-aware GitHub 请求能力。
- [ ] 发布流水线 dry-run、版本元数据、产物验证仍有效。
- [ ] 未未经许可 push、发布镜像或操作服务器。

## 4. 推荐阶段二：补全品牌回退与回归测试

### 4.1 全站回退

新项目以下位置仍存在上游默认品牌：

- `frontend/src/stores/app.ts`：默认及配置缺失时的 `Sub2API`。
- `frontend/src/router/title.ts`：标题站点名称回退。
- `frontend/src/main.ts`：站点名称默认值判断。
- `frontend/src/components/layout/AppSidebar.vue`：默认 `/logo.svg`。

按新项目当前代码做小范围修改，保留管理员自定义站点名、Logo 和设置加载行为。核对 404 页及全局主题 token；新 Tailwind 部分通用 glow/gradient 仍可能保留青绿色，不要整份覆盖。

### 4.2 缺少的旧项目测试

以下相对路径在旧项目存在，新项目未迁入：

- `frontend/src/views/home/__tests__/featuredRotation.spec.ts`
- `frontend/src/views/home/__tests__/orbitGeometry.spec.ts`
- `frontend/src/i18n/__tests__/ggbondLocales.spec.ts`

迁入时适配当前实现与 namespace，不盲目照搬旧断言。为首页入口补充开关启用/关闭、匿名/登录、目标路由测试。品牌回退变更应同步调整现有标题和 store 测试。

### 验收

- [ ] 设置未加载或缺失时，不意外露出上游默认品牌。
- [ ] 自定义站点设置不受影响。
- [ ] 迁入及新增测试通过。
- [ ] 中英文、浅深色、320/375px 与桌面导航无重叠。
- [ ] 生产构建、类型检查、lint 通过。

## 5. 推荐阶段三：迁移生产部署能力（需要配套后端适配）

旧项目存在 `deploy/production/`，新项目没有。建议移植为可选生产 overlay，而不是覆盖新上游通用部署配置。

### 值得迁移的旧文件与能力

- `deploy/production/docker-compose.yml`：版本镜像、blue/green 双实例、私网 PostgreSQL/Redis、容器化 Caddy。
- `deploy/production/deploy.sh`：备份、迁移、检查、切换与记录。
- `deploy/production/backup.sh`、`restore.sh`：数据库和应用数据备份恢复。
- `deploy/production/migrate.sh`：独立迁移流程。
- `deploy/production/switch.sh`、`Caddyfile`：流量切换（必须修正旧逻辑）。
- `deploy/build_production_image.sh`、`deploy/IMAGE_BUILD.md`：可选手动版本镜像构建工具。
- `docs/operations/deployment.md`：运行手册，应按新代码更新后迁移。

### 必须解决的依赖与缺陷

#### A. 新后端没有旧脚本依赖的 `-migrate`

旧 `migrate.sh` 调用 `/app/sub2api -migrate`；新 `backend/cmd/server/main.go` 没有该参数。

适配独立迁移入口并测试：成功退出、错误退出码、无需启动 HTTP 服务、迁移幂等与并发控制。保留新后端插件和审计初始化行为，不覆盖整个 main.go。不要使用旧错误文档中的 `./server migrate`。

#### B. SSE 优雅退出

旧后端支持 `SHUTDOWN_TIMEOUT_SECONDS`，默认 60 秒；新后端当前是 5 秒。旧部署切换流程依赖较长排空。

恢复为经过校验的可配置超时，配套 Compose stop grace period 和切换等待。真实测试长连接完成、超时强制结束与进程回收，不仅检查参数文本。

#### C. 蓝绿切换存在旧缺陷

旧 Caddy 配置固定 blue 优先，`lb_policy first`；切换脚本没有可靠更新活动实例优先级。

可能后果：green→blue 提前接流量，或 blue→green 在保留旧实例时仍走 blue。因此不能宣称复制后即可零中断。

必须设计明确的活动实例状态和可验证切换流程，测试：

- [ ] blue→green 与 green→blue 都在切换前完成新实例检查。
- [ ] 保留旧实例时，流量仍准确切到目标实例。
- [ ] Caddy 配置校验/重载失败时，原流量不受影响。
- [ ] 新实例启动或 smoke 失败时，不切流。
- [ ] SSE 排空符合设定。
- [ ] 镜像回滚和数据库恢复分开处理。

#### D. 备份恢复演练

备份成功不等于可恢复。必须在隔离数据库验证恢复结果，记录版本、备份时间、文件校验和及恢复步骤。不得直接向现有数据库灌入历史 dump 做测试。

### 必须保留的新上游改进

- Dockerfile 原生构建器、交叉编译与持久构建缓存。
- 新 Release dry-run、串行发布、固定源 SHA、矩阵构建及产物校验。
- 新后端 CI 的部署/发布 helper 校验。
- 新 Caddy 请求限制、安全转发头、适配 SSE 的压缩行为。
- `deploy/EDGE_SECURITY.md` 中的信任边界，不能恢复对客户端伪造 Cloudflare 头的直接信任。
- Compose 的权限收紧、PostgreSQL 调优与更严格的 readiness。

## 6. 推荐阶段四：可选自动部署

旧 `.github/workflows/release.yml` 存在 SSH 自动部署 job，但当时被 `if: ${{ false }}` 禁用，不能称为已工作的自动部署体系。

如需启用：新增受保护环境审批的任务，消费新 Release 产物，排除 dry-run，保持串行部署和严格 SSH host 校验。

旧任务仅 `git fetch` 不保证远程部署脚本更新，应使用明确审核的 commit，并核对运行脚本与发布版本一致。任何 SSH 凭据、token、域名和服务器地址不得写进仓库。

版本 tag 名称本身不保证不可变；需要 registry policy 或 digest 固定，而不是仅靠脚本描述。

## 7. 本地运行与数据注意事项

交接时本地服务为：

- 前端 `http://localhost:4000/home`
- 后端 `http://localhost:8080/health`
- 两个服务进程工作目录均在新项目。

服务可能随会话结束而停止，接手后重新检查端口和进程归属，不批量 `kill -9`。

后端启动：

```bash
cd /Users/yao/LLM/GGBond/backend
set -a
source data/dev.env
set +a
DATA_DIR="$PWD/data" SERVER_HOST=127.0.0.1 SERVER_PORT=8080 go run ./cmd/server
```

前端启动：

```bash
cd /Users/yao/LLM/GGBond/frontend
VITE_DEV_PORT=4000 pnpm run dev --host 127.0.0.1 --strictPort
```

不要用默认 3000 端口。

### 数据边界

- 新项目开发配置从旧项目复制，**本地数据库仍共用**，不是独立环境。
- `backend/data/` 被 Git 忽略，包含私有配置、日志和备份，禁止提交或在交接文档里展开。
- 新后端启动前已生成 `backend/data/backups/pre-upstream-20261102-142550.dump`，确认非空，但未做恢复演练。
- 不应让旧后端直接连接已经升级的数据库做回滚。
- `.env`、管理员密码、供应商 API Key、数据库凭据、数据目录均不得提交。

## 8. 模型广场最新实测状态

最近一次检查时，`model_plaza_enabled` 已为 true（不是本轮代码修改开启），首页点击入口可以进入模型广场，匿名页面显示「暂无可展示的分组」。

更早的两份本地文档曾记录关闭时的 HTTP 404，那是之前状态；接手后以当前 API 为准。

要展示数据，需要启用渠道与平台兼容的有效分组，配置模型映射或模型定价，使渠道能枚举支持模型。上游凭据在账号管理 `/admin/accounts` 中配置，不是随便往渠道里填 API Key。展示验收和真实调用/计费验收是不同任务；真实调用可能产生费用。

## 9. 验证与提交要求

实施前读取新项目现有指令与测试配置。建议按阶段拆提交，先测试再实现，每阶段独立 review。

此前已通过（不表示未来修改自动通过）：

- 首页修改后生产构建与 TypeScript 检查。
- `HomeView.vue` ESLint。
- i18n 完整性 3/3。
- 浏览器首页入口点击、桌面/手机截图和 320px 无页面横向溢出检查。

此前未完成：全量后端测试、全量覆盖率、生产切换及恢复演练、真实平台调用计费验收。

每阶段按影响范围运行：

```bash
cd /Users/yao/LLM/GGBond/frontend
pnpm run typecheck
pnpm run check:i18n
pnpm run test:run
pnpm run build
```

后端、Shell、Compose、Release 的测试命令应从新项目现有 CI/测试脚本确认，不假设单文件 `go test` 等于模块测试。涉及用户输入、文件操作、外部请求和部署脚本时进行安全审查。失败必须如实报告；没有测出的覆盖率不得写成已达标。

## 10. 给新会话的启动指令

可直接粘贴：

> 请读取 `docs/plans/migration-handoff-2026-11-02.md`，以 `/Users/yao/LLM/GGBond` 为目标、旧项目只读参考。先核实 Git、remote 和文档中的代码差异，再从阶段一统一发布/安装/更新来源开始。不要整文件覆盖新上游实现，不要重复迁移模型广场、国内模型或已包含的安全补丁。使用测试与独立审查，分阶段提交；未经明确授权，不 push、不发布镜像、不操作生产服务器、不修改远程仓库配置。部署生产能力放在后续阶段，先解决 `-migrate`、SSE 排空和蓝绿流量切换缺陷。
