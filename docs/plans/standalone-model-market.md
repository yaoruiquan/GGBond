# 独立模型市场开发说明

- 日期：2026-11-17
- 状态：已实现并通过本地验收；未部署

## 目标

新增一个独立的模型展示页，产品名称为“模型市场”。页面参考卡片式模型价格目录，但不复用 Sub2API 自带的 `/model-plaza` 业务逻辑，也不依赖管理员开关、分组、倍率或权限配置。

## 页面边界

- 新路由：`/model-market`
- 原路由：`/model-plaza` 保持原样，继续服务 Sub2API 自带模型广场
- 新页面使用前端内置展示数据，打开路由即可渲染
- 默认首页固定显示“模型市场”入口；原版入口保留原有开关规则，文案区分为“原版广场”
- 不新增后端接口，不读取 `/api/v1/model-plaza`
- 不修改现有模型广场设置、鉴权、计费和管理端入口

## 信息架构

页面从上到下分为：

1. 独立导航栏：站点标识、模型市场标题、原版广场入口、登录/控制台入口。原版入口沿用首页的开关与登录可见性规则；新模型市场不受这些开关影响。
2. 页面标题区：说明这是一个用于浏览和比较模型的独立目录。
3. 厂商横栏：按厂商筛选，例如 OpenAI、Anthropic、Google、xAI、DeepSeek、Moonshot。
4. 模型横栏：根据当前厂商展示具体模型，例如 GPT-5.6、Claude Sonnet 4.5；支持“全部模型”。
5. 搜索与排序：按模型名、能力和厂商搜索，支持推荐、价格和上下文长度排序。
6. 模型卡片：展示厂商、模型名、能力标签、上下文长度、输入/输出参考价、缓存价格和“查看详情”按钮。

## 数据结构

首版数据放在 `frontend/src/data/modelMarket.ts`，模型对象包含：

- `id`、`name`、`vendorId`、`platform`
- `description`、`capabilities`、`contextLength`
- `inputPrice`、`outputPrice`、`cacheReadPrice`、`cacheWrite5mPrice`、`cacheWrite1hPrice`
- `badge`

内置的 6 个厂商、8 个模型条目用于展示布局；名称、参数、价格均非经过供应商校验的实时目录，不代表当前实例真实可用性或计费价格。页面标明“示例价格”，缺失缓存价格显示 `—`，不伪造在线状态、折扣或刷新时间。所有 Token 价格示例以 USD / 1M token 展示，不乘后台倍率或站点汇率。

导航品牌可读取已有公开设置，但设置加载失败会使用默认品牌，卡片和筛选不受影响。不需要配置新设置项。后续如果接入真实目录，应新增独立的目录接口和数据来源标识，不把目录数据混入 `/model-plaza`。

## 实现文件

- `frontend/src/views/ModelMarketView.vue`：独立页面、两级筛选、搜索排序、详情。
- `frontend/src/components/modelMarket/ModelMarketNavBar.vue`：导航与默认品牌。
- `frontend/src/components/modelMarket/ModelMarketCard.vue`：模型价格卡片。
- `frontend/src/data/modelMarket.ts`：内置展示目录。
- `frontend/src/components/modelMarket/__tests__/ModelMarketNavBar.spec.ts`：原版入口可见性、默认品牌与控制台导航回归测试。
- `frontend/src/router/index.ts`、`frontend/src/views/HomeView.vue`：公开路由与首页入口。
- `frontend/src/i18n/locales/{zh,en}/dashboard.ts`：页面界面文案。内置模型描述当前为中文。

详情复用项目 `BaseDialog`，支持 Escape、背景点击关闭及滚动锁定。新增依赖、后端接口与数据库迁移均为零。

## 验收标准

- 访问 `/model-market` 不需要任何后台配置即可看到卡片
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

本地后端未启动，全局初始化及公开设置请求会报错；模型卡片仍能使用默认品牌和内置数据正常展示。此次验收不包含真实后端计费、真实目录或生产部署。

截图保存在本地 `output/playwright/`：`model-market-desktop.png`、`model-market-mobile.png`、`model-market-dark.png`。

## 提交前 Review

2026-11-17 分别检查需求实现和仓库规范。需求检查无遗漏；规范检查发现导航栏无条件显示原版广场入口，已改为沿用首页可见性规则，并新增 9 项导航回归测试。检查范围为此次模型市场改动，未修改原版广场的路由守卫。
