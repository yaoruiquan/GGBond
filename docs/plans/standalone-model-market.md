# 独立模型市场开发说明

- 日期：2026-11-17
- 状态：原型版本已于 `v2026.11.18-1` 部署；真实分组数据版本于 2026-11-18 本地验证通过，等待新版本发布

## 目标

新增一个独立的模型展示页，产品名称为“模型市场”。页面复用 Sub2API 的分组可见性与计价数据，但拥有独立页面/API 路径，不依赖旧模型广场开关，也不新增后台配置。

## 页面边界

- 新路由：`/model-market`
- 原路由：`/model-plaza` 保持原样，继续服务 Sub2API 自带模型广场
- 新页面通过 `/api/v1/model-market` 加载可见分组中的真实模型及本站价格
- 默认首页固定显示“模型市场”入口；原版入口保留原有开关规则，文案区分为“原版广场”
- 不读取旧 `/api/v1/model-plaza` 路径；新的 API handler 复用其安全 DTO 和服务层数据聚合
- 不修改现有模型广场设置、鉴权、计费和管理端入口

## 信息架构

页面从上到下分为：

1. 独立导航栏：站点标识、模型市场标题、原版广场入口、登录/控制台入口。原版入口沿用首页的开关与登录可见性规则；新模型市场不受这些开关影响。
2. 页面标题区：说明这是一个用于浏览和比较模型的独立目录。
3. 厂商横栏：按厂商筛选，例如 OpenAI、Anthropic、Google、xAI、DeepSeek、Moonshot。
4. 模型横栏：根据当前厂商展示具体模型，例如 GPT-5.6、Claude Sonnet 4.5；支持“全部模型”。
5. 搜索与排序：按模型名、厂商和分组搜索，支持厂商、价格和模型名排序。
6. 模型卡片：展示厂商、模型名、所属分组、明显的生效倍率、本站输入/输出或按次价格及“查看详情”按钮。

## 数据结构

页面卡片由 API 分组及模型数据构建，模型对象包含：

- `id`、`name`、`vendorId`、`platform`
- `groupId`、`groupName`、`description`、`billingMode`、`multiplier`
- 输入/输出价格、按次价格和缓存价格；缺失价格显示“未配置”

厂商和模型均根据当前可见分组动态生成。同一厂商/模型在不同分组分别展示。倍率应用规则与现有模型广场一致，卡片显著标注生效倍率；不填充后端未提供的能力、上下文等参数，不用官方参考价替代本站计费价。

市场默认展示访问者可见的全部启用分组。分组暂时没有确认的模型时，页面仍展示分组名称和倍率。模型候选来自绑定账号的有效映射、上游目录、渠道、分组白名单和组合路由，并按实际路由和渠道准入规则核验。同一个模型在不同分组分别展示，短期限流不会把模型移出目录。

通配符和透传账号通过上游目录发现具体模型，页面会自动补载仍在查询的结果。上游未提供目录或查询失败时，已确认的模型仍然展示。没有具体配置或目录记录的自由透传 ID 无法穷举。价格按计费使用的模型名查询，多条路径无法确定统一价格时仍展示模型和已知倍率。

导航品牌可读取已有公开设置，但设置加载失败会使用默认品牌。无需新增模型市场设置项；分组、模型和计价继续由现有管理界面维护。

## 实现文件

- `frontend/src/views/ModelMarketView.vue`：独立页面、两级筛选、搜索排序、详情。
- `frontend/src/components/modelMarket/ModelMarketNavBar.vue`：导航与默认品牌。
- `frontend/src/components/modelMarket/ModelMarketCard.vue`：模型价格卡片。
- `frontend/src/data/modelMarket.ts`：将分组响应映射为每个分组独立的模型卡片。
- `frontend/src/api/modelPlaza.ts`：独立模型市场 API 类型与请求入口。
- `backend/internal/server/routes/model_plaza.go`：注册独立市场 API 路由。
- `backend/internal/handler/model_plaza_handler.go`：复用分组可见性和计价 DTO，忽略旧广场开关。
- `frontend/src/components/modelMarket/__tests__/ModelMarketNavBar.spec.ts`：原版入口可见性、默认品牌与控制台导航回归测试。
- `frontend/src/router/index.ts`、`frontend/src/views/HomeView.vue`：公开路由与首页入口。
- `frontend/src/i18n/locales/{zh,en}/dashboard.ts`：页面界面文案。

详情复用项目 `BaseDialog`，支持 Escape、背景点击关闭及滚动锁定。新增依赖、后端接口与数据库迁移均为零。

## 验收标准

- 访问 `/model-market` 不需要新增后台配置；返回数据严格来自当前可见分组
- 厂商横栏和模型横栏可以联动筛选
- 搜索、排序、空结果状态可用
- `/model-plaza` 的路由、守卫和页面行为不改变
- 页面在桌面端三列、移动端单列布局下均可正常使用
- 通过前端类型检查、相关组件测试和生产构建

## 本地验收记录

2026-11-17 在 `frontend` 目录完成以下检查：

- `pnpm exec vitest run src/views/__tests__/ModelMarketView.spec.ts src/components/modelMarket/__tests__/ModelMarketNavBar.spec.ts src/views/__tests__/HomeView.brand.spec.ts src/router/__tests__/modelPlazaGuard.spec.ts src/i18n/__tests__/localeKeyCompleteness.spec.ts`：5 个测试文件、40 项测试通过，覆盖筛选联动、搜索排序、详情关闭、首页及市场导航入口、默认品牌和独立路由访问。
- `pnpm lint:check`：全量 ESLint 通过。
- `pnpm build`：文案键检查、TypeScript 检查与生产构建通过；构建仍有 Browserslist、包体积和动态导入提示。
- `git diff --check`：通过。

浏览器预览地址为 `http://127.0.0.1:4000/model-market`。已验证默认显示 8 张卡片，选择 Claude 显示 2 张，再选择 Opus 仅显示 1 张；详情价格表和 Escape 关闭正常。已检查桌面、深色模式及 390 × 844 手机布局，手机页面无横向溢出，两条筛选栏可以独立横向滚动。

原始验收仅覆盖内置演示数据，不能证明真实模型与价格正确。2026-11-18 修正后，需以本地 API 集成测试、倍率测试和生产构建的最新结果重新验收。

截图保存在本地 `output/playwright/`：`model-market-desktop.png`、`model-market-mobile.png`、`model-market-dark.png`。

生产部署于 2026-11-18 完成：发布源码 `db2686bce93e7eb354335a58b08724afbed986d4`，镜像 `ghcr.io/yaoruiquan/ggbond@sha256:226e71826e4f52545abfa8ecaf4bfbc69b06424a4f0a3602e2b3cb3e5b6e15ad`。CI、安全检查、镜像发布和蓝绿部署全部成功；切换至 green generation 8，完成 300 秒排空。公网 `/health`、`/home`、`/model-market` 返回 HTTP 200。部署细节记录在 [单机蓝绿部署](../../deploy/production/README.md)。

## 提交前 Review

2026-11-17 分别检查需求实现和仓库规范。需求检查无遗漏；规范检查发现导航栏无条件显示原版广场入口，已改为沿用首页可见性规则，并新增 9 项导航回归测试。检查范围为此次模型市场改动，未修改原版广场的路由守卫。
