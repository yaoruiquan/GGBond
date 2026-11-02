# GGbondai 品牌迁移到最新 sub2api

**日期**: 2026-11-02  
**状态**: 已完成  
**分支**: `ggbond-branding`  
**提交**: `9f07a1100`

---

## 迁移内容

已将 GGbondai 的**品牌定制**完整迁移到最新 sub2api (v0.2.19)，保留全部 GGbond 主题元素。

### 1. 前端品牌文件

| 文件 | 说明 |
|------|------|
| `frontend/src/views/home/GGbondMascot.vue` | 3D 猪猪侠吉祥物（浮动、眨眼、眼睛跟随、挥手、变身） |
| `frontend/src/views/home/ModelOrbit.vue` | 模型轨道动画（27 个厂商图标，三圈倾斜轨道） |
| `frontend/src/views/home/FeaturedModelCard.vue` | 精选模型卡片（Claude/GPT/DeepSeek 轮换） |
| `frontend/src/views/home/*.ts` | 轨道几何、轮播逻辑、模型数据 |
| `frontend/src/views/HomeView.vue` | 落地页整体布局 |

### 2. 品牌配色系统

**tailwind.config.js** 新增：
- `ggbond-red`: 头套红 (#E2231A)，作为主色调
- `ggbond-yellow`: 眉饰黄 (#FFB703)
- `ggbond-skin`: 角色肤色
- `primary` 色阶改为 GGbond 红

### 3. i18n 文案

| 文件 | 说明 |
|------|------|
| `frontend/src/i18n/locales/*/ggbond.ts` | GGbond 品牌文案 |
| `frontend/src/i18n/locales/*/home-ggbond.ts` | 首页文案（口号、副标题、按钮） |
| `frontend/src/i18n/locales/*/index.ts` | 合并逻辑：`home: { ...landing.home, ...homeGgbond }` |

### 4. 其他 UI 组件

- `frontend/src/components/brand/BrandLockup.vue` — 品牌标识
- `frontend/src/components/layout/AuthLayout.vue` — 登录页背景
- `frontend/src/components/common/EmptyState.vue` — 空状态样式
- `frontend/public/ggbond-logo.svg` — Logo
- `frontend/index.html` — 标题和 favicon

### 5. 后端配置

| 文件 | 修改 |
|------|------|
| `backend/internal/service/update_service.go` | `githubRepo = "yaoruiquan/GGbondai"` |
| `deploy/docker-compose*.yml` | `image: ghcr.io/yaoruiquan/ggbondai:latest` |

---

## 验证结果

```bash
cd /Users/yao/LLM/GGBond/frontend

# i18n 完整性检查
pnpm run check:i18n
# ✅ Test Files  1 passed (1)
# ✅ Tests  3 passed (3)

# TypeScript 类型检查
pnpm run typecheck
# ✅ 无错误
```

---

## 改动统计

```
23 files changed, 1919 insertions(+), 664 deletions(-)
```

**新增文件** (12 个):
- 6 个 home/ 组件和逻辑文件
- 4 个 i18n 文案文件
- 1 个 Logo SVG
- 1 个 brand/ 组件

**修改文件** (11 个):
- 前端: HomeView、AuthLayout、EmptyState、tailwind.config、index.html、i18n index
- 后端: update_service.go
- 部署: 3 个 docker-compose 文件

---

## 未迁移内容

**GGbondai 独有但不需要迁移的**：
- `docs/` 文档（个人笔记，不通用）
- 测试文件（会自动生成新的）

**上游新增但本次未包含的**（见 `docs/plans/upstream-sync-2026-11.md`）：
- 模型广场（计划自己实现）
- 国内大模型支持（后续单独迁移）
- MCP OAuth、联盟分销、内容审核等企业功能

---

## 下一步

### 立即做
1. **合并分支到 main**
   ```bash
   cd /Users/yao/LLM/GGBond
   git checkout main
   git merge ggbond-branding
   ```

2. **启动开发服务器测试**
   ```bash
   cd frontend
   pnpm run dev
   # 访问 http://localhost:4000/home 查看落地页
   ```

### 后续计划

1. **安全修复** (P0)
   - Cherry-pick 3 个 CVE 修复（dompurify、MCP SDK、UTF-16）

2. **国内大模型** (P1)
   - 迁移 6 个数据库迁移（206, 218-221, 242）
   - 测试 Kimi/智谱/DeepSeek

3. **模型广场** (P1)
   - 自己实现，参考 `docs/plans/model-market.md`

---

## 目录结构

迁移后的最新 sub2api 现在位于：
- **开发目录**: `/Users/yao/LLM/GGBond`
- **分支**: `ggbond-branding`
- **原 GGbondai**: `/Users/yao/LLM/GGbondai`（保留作为参考）

---

## 技术细节

### i18n 合并逻辑

原 GGbondai 的 i18n 结构：
```typescript
export default {
  ggbond: { /* ... */ },
  home: { heroTitleLead, heroTitleTail, primaryCta, ... }
}
```

上游 sub2api 的 landing.ts 已有：
```typescript
export default {
  home: { viewDocs, dashboard, login, ... }
}
```

**解决方案**：在 index.ts 里合并：
```typescript
import homeGgbond from './home-ggbond'
export default {
  ...landing,
  ggbond,
  home: { ...(landing as any).home, ...homeGgbond }
}
```

这样 GGbond 的 `home.*` 键会覆盖上游的，保留 GGbond 文案的同时不丢失上游新增的其他 `home.*` 键。

---

## 问题排查

如果遇到问题：

1. **构建失败**
   ```bash
   rm -rf node_modules pnpm-lock.yaml
   pnpm install
   pnpm run typecheck
   ```

2. **i18n 键缺失**
   ```bash
   pnpm run check:i18n
   # 查看报错的键，补充到对应 locale 文件
   ```

3. **颜色不对**
   - 检查 `tailwind.config.js` 的 `primary` 色阶
   - 确认 `ggbond-red/yellow/skin` 已定义

4. **Logo 不显示**
   - 确认 `frontend/public/ggbond-logo.svg` 存在
   - 检查 `frontend/index.html` 的 favicon 路径

---

## 联系信息

- **项目**: [yaoruiquan/GGbondai](https://github.com/yaoruiquan/GGbondai)
- **上游**: [Wei-Shaw/sub2api](https://github.com/Wei-Shaw/sub2api)
- **镜像**: `ghcr.io/yaoruiquan/ggbondai:latest`
