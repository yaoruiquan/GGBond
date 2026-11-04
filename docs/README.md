# 文档中心

本目录按查阅用途组织，保留原文件名以便检索。文档记录不等于功能验收：设计、MVP、历史运行快照和待办须结合当前代码、配置及测试核实，不将原文状态自动升级为“已完成”。

## 分类与入口

| 分类 | 面向用途 |
| --- | --- |
| [api](api/) | 鉴权、接口调用与异步任务契约 |
| [guides](guides/) | 管理员配置与日常使用 |
| [development](development/) | 插件开发与文档维护规范 |
| [operations](operations/) | 监控默认值、模型退役与运维决策 |
| [plans](plans/) | 迁移路线、阶段待办与会话交接 |
| [project](project/) | 新旧项目背景与对比 |
| [legal](legal/) | 中英文管理员合规文档，路径由构建与运行代码依赖，禁止随意移动 |
| [screenshots](screenshots/) | 文档图片资源，保留现有内容 |

### API 与任务

- [管理员 API 密钥](api/admin-api-keys.md)：创建、权限边界、旧版密钥迁移与自动化管理。
- [MCP](api/mcp.md)：MCP 接入、认证与调用说明。
- [Seedance API](api/seedance-api.md)：视频生成接口用法及限制。
- [外部支付集成 API](api/ADMIN_PAYMENT_INTEGRATION_API.md)：中英双语充值、用户查询、幂等及购买页对接。
- [异步图片任务](api/ASYNC_IMAGE_TASKS.md)：提交、轮询和结果获取。
- [批量图片 MVP](api/BATCH_IMAGE_MVP.md)：批量生成接口、任务流程及 MVP 范围；不据标题推断全部设计已验收。

### 配置与使用

- [支付配置（中文）](guides/PAYMENT_CN.md) / [Payment Configuration（English）](guides/PAYMENT.md)：支付渠道、回调、实例及迁移配置。
- [组合分组](guides/COMPOSITE_GROUPS.md)：多供应商路由、别名与订阅配置。

### 开发与运维

- [插件开发](development/PLUGIN_DEVELOPMENT.md)：公开协议、UI Bridge、签名、打包与宿主边界；示例仓库仍以原文公告状态为准。
- [模型市场开发说明](development/model-market.md)：页面范围、价格数据口径、倍率规则与验收标准。
- [文档维护规范](development/documentation.md)：开发交付时必须同步执行的维护规则。
- [渠道监控 v2 安全默认值](operations/channel-monitor-v2-safe-defaults.md)：默认模式、渐进回填及设计边界，原文为批准实施的设计，不代表本次验收。
- [GPT-5.5 退役](operations/OPENAI_GPT55_RETIREMENT.md)：ChatGPT 账号与 API Key 账号的适用区别、映射迁移与验证边界。
- [可选蓝绿部署](../deploy/production/README.md)：单机 Caddy 显式切流、状态与回退门禁；实现和验证状态以文中记录为准。

### 项目、计划与合规

- [新旧项目对比](project/comparison.md)：本地项目定位、功能对比、启动与数据边界。
- [迁移路线](plans/migration-roadmap.md)：已核查内容、配置与验收待办。
- [迁移交接（2026-11-02）](plans/migration-handoff-2026-11-02.md)：后续阶段、发布来源、品牌、部署与交接检查。
- [管理员合规（中文）](legal/admin-compliance.zh.md) / [Admin Compliance（English）](legal/admin-compliance.en.md)：管理员合规提示正文。
- [开发指南](../DEV_GUIDE.md)：根目录现有开发说明，开发环境与命令以当前配置核实。
- [品牌迁移记录](../BRANDING_MIGRATION.md)：品牌迁移历史；后续计划以迁移路线和最新交接为准。

## 常见查阅顺序

1. 接手项目：项目对比 → 迁移路线 → 最新交接；运行状态以重新检查结果为准。
2. 配置支付：支付配置 → 管理员密钥 → 外部支付集成 API（仅外部系统对接时）。
3. 调用接口：管理员密钥／MCP → 对应图片或视频接口；不要混淆管理员密钥和用户模型调用 Key。
4. 开发插件：插件开发 → 公开契约 `backend/pkg/pluginapi/` → 文档维护规范。
5. 运维排障：对应 operations 文档 → 实际配置与日志 → 测试和验收记录。

## 历史状态说明

项目对比和迁移路线记录过模型广场关闭时的 HTTP 404；同日较晚的交接记录为已开启但无可展示分组。这些是不同时间的历史快照，不是当前实例状态保证。交接中引用的旧项目部署手册属于待迁移资料，不据此创建虚假的当前运行手册。根目录品牌迁移记录保留历史结论，并已补充指向后续核查的说明。

外部上游链接保留其原有路径；本地目录整理不代表上游网站同步改版，也未联网验证外链。
