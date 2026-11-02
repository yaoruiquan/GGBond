# 迁移核查与后续计划

**项目**：GGBond（基于 sub2api v0.2.19）  
**核查日期**：2026-11-02  
**状态**：品牌兼容修复和本地启动完成；业务配置验收待执行。

> 本文替代先前的迁移方案。先前误把旧项目的功能缺口套用于最新上游，导致重复 cherry-pick、重复开发模型市场的建议。不要执行旧版方案。

## 1. 安全补丁：已包含，不重复迁移

以下提交均通过 `git merge-base --is-ancestor <commit> HEAD` 检查（退出码 0）：

| 提交 | 修复范围 | 状态 |
|------|----------|------|
| `828626804` | DOMPurify 依赖更新 | 已在当前历史中 |
| `fb22c9212` | MCP SDK 更新 | 已在当前历史中 |
| `7bce2cfb4` | UTF-16 计费处理 | 已在当前历史中 |

依赖声明为 DOMPurify `^3.4.17`、MCP SDK `v1.4.1`。此结论表示指定补丁已包含，不等于完成全量安全审计。

## 2. 国内模型：已有支持，转为配置验收

后端 `backend/internal/domain/platforms.go` 和前端 `frontend/src/constants/platformCatalog.builtin.json` 已包含国内平台支持。无需按旧文档 cherry-pick 数据库迁移。

原文错误对应的迁移实际上包括渠道监控隐私默认值、音频价格、搜索价格、视频配置清理、模型价格、平台约束移除和分组多语言，并非逐个国内厂商的迁移。

### 后续验收

- [ ] 在 `/admin/accounts` 添加实际需要的平台账号，使用有效凭据。
- [ ] 配置对应分组、模型和路由，确认平台兼容。
- [ ] 使用平台当前实际支持的模型 ID 测试连通性。
- [ ] 发起真实网关请求并核对使用记录、价格和扣费。

真实调用可能产生费用，本次未执行；不创建虚假 API Key 或示例计费数据。

## 3. 模型广场：复用现有实现

- 前端：`/model-plaza`
- API：`GET /api/v1/model-plaza`
- 后端：`backend/internal/service/model_plaza_service.go`
- 前端页面：`frontend/src/views/ModelPlazaView.vue`
- 系统设置：`model_plaza_enabled`、`model_plaza_require_auth`、`model_plaza_description`

无需新增 `/models`、`/model-market` 或另一套 `model_market_*` 设置。

### 启用步骤

1. 从 `http://localhost:4000/login` 登录管理员账号。
2. 在 `/admin/settings` 开启模型广场，按需设置是否必须登录和说明。
3. 在 `/admin/groups` 配置有效分组及倍率。
4. 在 `/admin/channels` 配置有效渠道并关联平台兼容、处于启用状态的分组。
5. 填写明确的模型映射或模型定价，让渠道能够枚举支持模型；二者均为空时，可能没有模型展示。
6. 访问 `http://localhost:4000/model-plaza` 验证。

账号凭据在账号管理中配置，不是在渠道中随意填写 API Key。匿名访问不展示专属分组；后台模式等访问限制也会影响可见性。

### 当前实测

通过 4000 前端代理请求 API，返回 HTTP 404：

```json
{"code":404,"message":"Model plaza is not enabled"}
```

说明当前是功能开关未开启，而非缺失路由。本次未修改该业务设置，也未核查数据库中是否已配置可展示的渠道。

### 待验收

- [ ] 开启后页面能展示已配置模型。
- [ ] 搜索、筛选、分组倍率展示正常。
- [ ] 必须登录开关生效；匿名访问无专属分组泄漏。
- [ ] 用户专属倍率与实际扣费核对一致。

## 4. 本次品牌兼容修复

- [x] 补齐 `shadow-glow-red`、`shadow-card-ggbond`。
- [x] 补齐 `animate-twinkle` 及对应 keyframes。
- [x] 中英文首页合并改为 `landing.home`，移除 `any`。
- [x] TypeScript 检查通过。
- [x] i18n 完整性测试 3/3 通过。
- [x] 前端生产构建通过。
- [x] 浏览器打开首页并检查截图。
- [x] 新目录后端 `/health` 返回 `{"status":"ok"}`。

未执行全量后端测试或全量覆盖率测试，不宣称达到 80% 覆盖率。

## 5. 本地运行与数据安全

当前 4000 前端与 8080 后端进程工作目录均位于 `/Users/yao/LLM/GGBond`。不再依赖旧目录中的运行进程。

本地开发配置已复制到新项目 `backend/data/`，权限限制为仅当前用户读取，且被 Git 忽略。两个项目的开发配置沿用同一数据库，不能认为它们是隔离环境。

启动新后端前已生成 PostgreSQL 自定义格式备份，位于：

`backend/data/backups/pre-upstream-20261102-142550.dump`

备份文件已确认非空；尚未进行恢复演练。不要直接将旧版本后端连接升级后的数据库做回滚；如需回滚，应先在隔离数据库验证恢复流程。

### 重新启动（先确认端口未占用）

终端一：

```bash
cd /Users/yao/LLM/GGBond/backend
set -a
source data/dev.env
set +a
DATA_DIR="$PWD/data" SERVER_HOST=127.0.0.1 SERVER_PORT=8080 go run ./cmd/server
```

终端二：

```bash
cd /Users/yao/LLM/GGBond/frontend
VITE_DEV_PORT=4000 pnpm run dev --host 127.0.0.1 --strictPort
```

默认 Vite 端口不是 4000，因此必须显式设置。停止服务优先使用对应终端的 Ctrl+C；不要批量 `kill -9` 未确认归属的进程。

## 6. 当前实施：前两批必要迁移（2026-11-02）

**状态：进行中，未发布。** 以本节安排为准；上文运行状态和验证结果为此前快照，不代表本次变更已通过。

### 第一批：数据边界与发布来源

- [ ] 仅比较新旧配置的数据库、Redis 和数据目录是否隔离，不输出凭据；未确认隔离前不启动后端或执行迁移。
- [ ] 统一 Release 镜像生产者、Compose 消费者、安装资源、在线更新和回滚指引：源码目标 `yaoruiquan/GGbondai`，GHCR 目标 `ghcr.io/yaoruiquan/ggbondai`。
- [ ] 保留 `sub2api` 二进制、归档与服务名称兼容性，以及新上游 dry-run、固定源 SHA、下载鉴权和随机密码逻辑。
- [ ] 通过离线测试或本地 dry-run 验证，不推送、不发布、不修改 remote、不操作生产。

### 第二批：品牌、恢复方案与退出窗口

- [ ] 补全 `GGbond AI` 默认品牌及回退，保留管理员自定义设置；适配算法、品牌与首页入口测试。
- [ ] 复用已有备份能力，补充配置/应用数据覆盖和隔离恢复演练步骤；未实际恢复不得声称已验证可恢复。
- [ ] 增加经校验的退出超时配置，匹配 Compose/systemd 停止宽限；测试退出行为，不承诺所有长流零中断。
- [ ] 运行相关测试、类型检查、构建及独立审查，记录失败和未验证范围。

蓝绿、独立 `-migrate` 和 SSH 自动部署不作为本轮完成条件。数据库创建、配置切换和恢复会改变数据边界，执行前另行确认具体目标；本轮先只读核查与完善代码、操作说明。

## 7. 参考

- 新旧对比与使用指南：[项目对比](../project/comparison.md)
- 品牌迁移记录：`../../BRANDING_MIGRATION.md`
- 旧项目模型市场草案仅作历史参考，不再作为新项目实施依据。
