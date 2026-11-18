# 模型市场开发说明

- 日期：2026-11-18
- 状态：已按真实分组数据修正；本地验证通过，待重新发布
- 范围：新增独立 `/model-market` 展示页，从当前可见分组动态读取模型和本站价格；不依赖旧版模型广场开关，不开发监控功能。

## 产品范围

模型市场展示当前可见分组中的实际模型与价格，厂商筛选从模型平台动态生成，模型筛选从返回的模型动态生成。同一平台和模型如果出现在多个分组，分别展示各分组价格，避免把不同价格合并。页面不填充上下文、能力或官方价格等未由分组数据提供的字段。

页面仅呈现查价需要的信息，不增加成功率、延迟、请求量、趋势图或其他监控指标。

## 数据与计价

- 使用新增 `GET /api/v1/model-market` 返回的可见分组及模型；服务层复用模型广场的模型聚合、价格解析和 DTO 白名单。
- 新接口不读取 `model_plaza_enabled` / `model_plaza_require_auth`，但沿用可见性裁剪、可选 JWT、后端模式限制与面板 API 限流。匿名只看公开非专属分组；登录用户按可见性授权查看。
- 生效通用倍率为 `user_rate_multiplier ?? rate_multiplier`。已登录用户的专属倍率优先；匿名用户和未配置专属倍率的用户使用分组默认倍率。
- Token 模型本站展示价按 API 定价乘生效倍率计算，单价换算为每百万 Token；缓存价格同步应用倍率。
- 图片、视频模型可能启用独立倍率，遵循 `image_rate_independent` / `image_rate_multiplier` 与 `video_rate_independent` / `video_rate_multiplier`。按次价格保留原计费单位，不与每百万 Token 价格混算。
- 卡片和详情均醒目展示该模型实际采用的倍率。价格缺失时显示“未配置”，不推断或填入零。
- 长上下文模型在详情展示所有 API 返回的价格档位；分时模型标出存在分时倍率，并说明卡片展示的是标准时段价格。

## 交互与权限

- `/model-market` 和 `/api/v1/model-market` 独立于旧 `/model-plaza` 路径、设置开关和路由守卫；旧广场行为保持不变。
- 厂商和模型筛选、模型名/分组搜索及价格排序只处理 API 返回的数据；无匹配项与无已接入模型使用不同文案。
- 页面加载、接口失败、无可见模型和筛选无结果分别展示状态；实际可见数据仍由服务端鉴权结果决定。
- 不改管理设置字段、鉴权策略、后端模型发现范围和计价计算规则。

## 验收

- 中英文标题和导航名称一致，现有独立访问与后台内嵌访问均可用。
- 筛选、搜索、空状态有前端测试覆盖；后端测试确认模型市场 API 不受旧广场开关控制；倍率价格覆盖默认倍率、用户专属倍率及媒体独立倍率。
- `pnpm test:run`（相关测试）、`pnpm check:i18n`、`pnpm typecheck`、`pnpm lint:check` 和 `pnpm build` 通过。
- 在固定的 `4000` 端口打开页面，确认当前数据为空时展示真实空状态，不构造演示模型。

2026-11-18 修正记录：撤销静态示例目录与示例价格，改为从 `/api/v1/model-market` 加载真实分组数据，并在卡片显著展示分组/个人、媒体独立、高峰与分时倍率。`pnpm exec vitest run src/views/__tests__/ModelMarketView.spec.ts src/i18n/__tests__/localeKeyCompleteness.spec.ts`（9 项）、改动文件 ESLint、`pnpm build`、`go test -tags unit ./internal/handler ./internal/server/routes ./internal/server` 和 `git diff --check` 均通过。Vite 本地路由在 `http://127.0.0.1:5173/model-market` 返回 HTTP 200；尚未连接生产数据库验证线上实际分组内容。
