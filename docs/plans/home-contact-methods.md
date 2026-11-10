# Home 联系方式配置与展示开发方案

- 日期：2026-11-10
- 状态：功能已部署为 `v2026.11.10-1`，图片限额放宽已部署为 `v2026.11.10-2`，生产验证见 [部署记录](../../deploy/production/README.md)
- 调研基线：仓库提交 `f752c357e`
- 范围：管理员配置文字、二维码图片等联系方式，并在 Home 展示；本文保留原方案，实际交付以文末记录为准。

## 1. 建议方案

在「系统设置 → 通用／站点设置」增加独立的「首页联系方式」配置区，支持添加多条联系方式，每条可以是文字、图片，或图片加文字。提供总开关、单项启停、顺序调整、图片预览和删除能力。Home 增加共用联系方式区域，覆盖默认首页、自定义 HTML 首页和 URL iframe 首页。

第一版复用现有 settings 键值存储、图片选择组件与公共设置加载链路。图片以经过严格校验的 Data URL 随设置保存，不新增数据库表、上传服务或依赖。旧 `contact_info` 保持原有用途，避免影响顶部导航、个人资料和兑换页。

这是针对少量二维码的方案。图片会进入公共设置和 HTML 注入配置，必须限制总体积；如果后续需要大量图片，应切换到持久化文件／对象存储，不能无限扩大设置字段。

## 2. 已核实的现状

| 位置 | 当前行为与开发影响 | 源码依据 |
| --- | --- | --- |
| 管理员站点设置 | `contact_info` 是单个文本输入，无法配置多条联系方式或图片；Logo 已使用 `ImageUpload` | [SettingsView.vue](../../frontend/src/views/admin/SettingsView.vue)，约 6611–6683 行 |
| 首页 | `home_content` 存在时替换默认布局：HTTP(S) 地址使用 iframe，其他内容使用 HTML；未读取客服联系方式 | [HomeView.vue](../../frontend/src/views/HomeView.vue)，模板及公共设置 computed |
| 旧客服字段 | 顶部导航、个人资料、兑换页已有消费者，不能把原字符串直接改成数组 | [AppHeader.vue](../../frontend/src/components/layout/AppHeader.vue)、[ProfileView.vue](../../frontend/src/views/user/ProfileView.vue)、[RedeemView.vue](../../frontend/src/views/user/RedeemView.vue) |
| 图片选择 | `FileReader.readAsDataURL` 生成字符串，经 v-model 返回；不是独立 HTTP 上传；当前普通图片使用 `image/*` | [ImageUpload.vue](../../frontend/src/components/common/ImageUpload.vue) |
| 数据库存储 | settings 为唯一 key + text value，可用新键保存 JSON，无需表结构迁移 | [setting.go](../../backend/ent/schema/setting.go) |
| 设置更新 | 支持省略字段保留原值，通过 `sentFields`、字段映射和 omitted keys 完成；新字段必须遵循同一机制 | [setting_handler_update.go](../../backend/internal/handler/admin/setting_handler_update.go)、[setting_update.go](../../backend/internal/service/setting_update.go) |
| 公共设置 | API 与 HTML 注入是两条显式映射链路，都必须增加字段 | [setting_public.go](../../backend/internal/service/setting_public.go)、[setting_handler.go](../../backend/internal/handler/setting_handler.go) |
| 前端缓存 | 首次可直接使用 `window.__APP_CONFIG__`，不一定再请求公共设置；管理员保存成功后已强制刷新公共设置 | [app.ts](../../frontend/src/stores/app.ts)、[SettingsView.vue](../../frontend/src/views/admin/SettingsView.vue)，约 11888 行 |
| 服务端缓存 | 更新回调使前端 HTML 缓存失效；HTML 使用 JSON 序列化注入配置 | [router.go](../../backend/internal/server/router.go)、[embed_on.go](../../backend/internal/web/embed_on.go) |
| 已有图片存储 | 有用于生成图片结果的 ImageStorage / S3 能力，但不是现成的管理员联系方式上传接口 | [image_storage.go](../../backend/internal/service/image_storage.go)、[image_storage_s3.go](../../backend/internal/repository/image_storage_s3.go) |

上表记录调研时的代码事实；以下为实施采用的设计与验收要求，实际完成情况见第 9 节。行号只辅助定位，以符号和文件内容为准。

## 3. 用户交互与展示

### 3.1 管理员配置

配置区放在旧「客服联系方式」附近，标题为「首页联系方式」，说明“启用后访客可在首页查看”。复用站点设置现有保存按钮。

```text
首页联系方式                         [展示到首页：开]
  客服微信                 [启用] [上移] [下移] [删除]
    名称：客服微信
    文字：微信号 example_support（可选）
    图片：[选择图片] [缩略预览] [移除]（可选）
  商务合作                 [启用] [上移] [下移] [删除]
    名称：商务合作
    文字：business@example.com
    图片：未选择
  [+ 添加联系方式]
  提示：每条至少填写文字或选择一张图片；保存后生效。
```

- 名称必填；文字和图片至少有一项。一个条目可同时显示文字和二维码，不要求管理员先选择互斥类型。
- 图片选择后立即本地预览；删除图片不删除文字；上传失败保留原图并提示原因。
- 选择图片仅修改表单草稿，点击保存成功后才发布；保存失败保留草稿和错误提示。
- 删除、禁用、排序同样随保存生效；最后一条删除后允许保存空列表。
- 总开关关闭时仍允许维护列表，不清空已保存内容。
- 第一版不自动迁移旧客服文本。如需迁移，可提供显式「从现有客服联系方式复制」操作，生成待保存的新条目；不增加持续同步关系。

### 3.2 Home 展示

新增 `HomeContactSection.vue`，使用公共设置渲染紧凑的「联系我们」入口和联系方式。文字允许换行和长内容折行，提供「复制」按钮及成功／失败反馈。2026-11-10 用户进一步确认：二维码默认收起，避免直接展示大图。

二维码默认不在首页内容区展示。桌面端悬停或键盘聚焦「查看二维码」入口时显示浮层预览，移出后关闭；点击可固定预览，支持 Escape 关闭。手机端点击查看。预览使用白色留边和 `object-contain` 完整展示，不裁剪、不拉伸，浮层位置需限制在视口内。支持图片替代文本和必要的焦点恢复；不承诺浏览器之外的自动扫码或长按识别能力。

| Home 模式 | 放置方式 | 验收重点 |
| --- | --- | --- |
| 默认首页 | 现有主内容之后、版权信息之前 | 保留品牌区、模型卡片、登录等现有行为 |
| 自定义 HTML | HTML 内容容器之后，共用联系方式区域 | 不把新组件放在默认首页的 `v-else` 内；联系人文本不经过 `v-html` |
| URL iframe | iframe 容器之后，在宿主 Home 页面展示 | 外层页面可滚动至联系方式；不向 iframe 内注入节点，不依赖跨域访问 |

模板应形成“主内容三选一 → 单个联系方式组件 → 默认模式版权信息”的结构，避免三个分支复制组件。iframe 原有高度与外层滚动需要一起检查，不能让后续区域被固定高度或 `overflow: hidden` 截断。

总开关关闭、列表为空或全部禁用时，整个区域不占位。图片加载失败保留名称与文字，并提供简短占位提示；纯图片条目展示加载失败提示，不能造成页面崩溃。匿名访客和登录用户均可查看已发布项。

## 4. 数据与接口契约

### 4.1 新设置字段

| 字段 | 类型／默认值 | 说明 |
| --- | --- | --- |
| `home_contact_enabled` | boolean / `false` | 是否发布首页联系方式 |
| `contact_methods` | ContactMethod[] / `[]` | 有序列表，按数组顺序展示 |

ContactMethod 定义：

| 字段 | 类型 | 规则 |
| --- | --- | --- |
| `id` | string | 前端创建并在编辑时保持稳定；1–64 个 ASCII 字母、数字、`-` 或 `_`，列表内唯一 |
| `label` | string | 去除首尾空白后必填，最多 40 个 Unicode 码点 |
| `text` | string | 默认空字符串，最多 500 个 Unicode 码点，纯文本；与图片至少填一项 |
| `image_data_url` | string | 默认空字符串；仅允许下文规定的 PNG/JPEG Base64 Data URL |
| `enabled` | boolean | 新增条目默认 `true`，管理员可单独关闭 |

不额外保存 `type` 或 `sort_order`：有无文字／图片决定展示内容，数组顺序决定排序，减少不一致状态。持久化时 `contact_methods` 序列化为 JSON 字符串；API 对外始终使用数组。

管理员请求示例（文本条目，可直接表达有效数据）：

```json
{
  "home_contact_enabled": true,
  "contact_methods": [
    {
      "id": "support-wechat",
      "label": "客服微信",
      "text": "微信号 example_support",
      "image_data_url": "",
      "enabled": true
    }
  ]
}
```

有图片时，`image_data_url` 为实际 `data:image/png;base64,` 或 `data:image/jpeg;base64,` 加合法内容；文档不放置伪造的图片数据。

### 4.2 接口与可见性

沿用现有接口，不新增联系人 CRUD API：

| 接口／出口 | 行为 |
| --- | --- |
| `GET /api/v1/admin/settings` | 返回总开关及完整条目，包括禁用项 |
| `PUT /api/v1/admin/settings` | 接收两个新字段，沿用现有管理员权限和设置更新流程 |
| `GET /api/v1/settings/public` | 返回总开关及已发布项；总开关为 false 时列表必须为 `[]` |
| HTML 的 `window.__APP_CONFIG__` | 与公共 API 使用同一投影逻辑，字段及值保持一致 |

总开关打开时公共列表仍需过滤 `enabled=false` 项，不能仅靠前端隐藏。两条公共出口均不得带出禁用项的文字或图片。建议在服务层共用一个纯函数生成发布列表，维持条目原顺序；不要先把管理员全量设置发给浏览器再过滤。

### 4.3 更新语义与兼容

- 省略 `contact_methods`：保留原列表；显式 `[]`：清空列表；显式 `null`：拒绝并返回字段校验错误。
- 省略 `home_contact_enabled`：保留原值；显式 `false`：关闭发布；显式 `null`：拒绝。
- 更新整个列表，不进行按 id 隐式合并。条目所有字段按契约提交；服务端校验类型及必填项。
- 沿用现有 `sentFields` 检测与 omitted key 处理。当前反射映射会自动处理同名的非指针顶层字段；若改用指针，必须补齐显式保留／合并逻辑，不能认为指针自动满足现有机制。
- 在写入任何设置前完成列表校验；无效联系人不能导致其他站点设置部分写入。
- 旧数据库缺少新键时返回关闭和空列表；历史损坏 JSON 应安全降级为空列表并记录不含内容的诊断日志，不让公共首页报错。
- 保持 `contact_info` 的字段类型、接口和消费者不变。不使用“新列表为空就自动显示旧文本”的回退，否则管理员清空后会再次显示旧联系方式。
- 当前管理设置仍是整体表单保存。并发管理员编辑的覆盖风险沿用现有行为，本期不扩展为全站版本锁或冲突合并系统。

## 5. 图片方案与边界

### 5.1 选型

| 方案 | 优点 | 成本与限制 | 结论 |
| --- | --- | --- | --- |
| Data URL 存入 settings | 复用现有选择、预览、保存链路；随数据库备份；无需新依赖 | Base64 增大载荷；公共设置和每份注入 HTML 均携带图片；不能独立缓存图片 | 第一版采用，仅适合有严格上限的小量二维码 |
| 专用上传接口 + 文件／对象存储 | 图片可独立缓存，设置仅存 URL，适合大图或更多资源 | 需管理员上传鉴权、持久 URL、资源清理、部署与备份策略 | 后续体量增加时采用，可评估复用已有 ImageStorage |
| 只填写外部图片 URL | 实现简单 | 无法满足直接上传体验；外链寿命、访问可用性及内容控制不足 | 不作为第一版入口 |

已有 ImageStorage 可返回公开或预签名 URL。未来复用前必须确认 URL 长期有效，不能把短期签名地址保存为持久联系方式。第一版不要求后端抓取外部图片，也不提供二维码生成、识别或内容审核功能。

### 5.2 图片硬限制

以下限制前后端保持一致，后端为最终裁决：

| 项目 | 第一版限制 |
| --- | --- |
| 联系方式数量 | 最多 6 条，包含禁用项 |
| 图片格式 | PNG、JPEG；二维码推荐 PNG；拒绝 SVG、GIF、WebP 及其他格式 |
| 单张解码文件体积 | 不超过 100 KiB |
| 所有图片解码体积合计 | 不超过 300 KiB，包含禁用项 |
| 单张宽高 | 每边 64–2048 像素，并限制总像素不超过 4,000,000 |
| 联系方式数组 JSON 编码体积 | 不超过 450 KiB；按应用 JSON 序列化结果的 UTF-8 字节数计算 |

300 KiB 图片经 Base64 编码约为 400 KiB，再加字段和文本。这是新功能载荷上限量级，不是整页大小保证。HTML 缓存减少服务端重复生成，但不能消除向客户端传输注入图片的成本；实施时须记录一个典型二维码配置和最大配置下的公共 JSON／HTML 大小。若这一上限仍超出站点首屏预算，应在上线前改用 URL 方案，不提高上限来绕过问题。

前端的文件 `accept`、扩展名和 MIME 仅用于选择与早期提示。服务端应先限制字符串长度和 JSON 体积，再检查 Data URL 前缀、严格解码 Base64，核对真实格式与声明 MIME，读取尺寸并校验像素数，最后完整解码确认图片有效。可使用 Go 标准库 PNG/JPEG 解码能力；不能只检查 `data:image/` 或客户端 MIME。

复用 `ImageUpload.vue` 时建议增加可选的格式白名单参数，仅在联系人编辑器启用 PNG/JPEG 限制，保留 Logo 等现有调用行为。尺寸与合计体积由编辑器提供反馈，服务端重复校验。超限时明确提示重新选择清晰且较小的图片，第一版不自动压缩或裁切二维码。

所有联系人文字使用 Vue 文本插值，第一版不自动识别链接、不提供富文本。现有 [url.ts](../../frontend/src/utils/url.ts) 对 `data:image/` 的宽泛判断不能代替本功能格式校验。配置注入继续使用 JSON 序列化及现有转义路径，不手工拼接用户内容。默认 [CSP 配置](../../backend/internal/config/config.go) 已允许 `data:` 图片，自定义 CSP 的部署需验证实际策略。

## 6. 具体改动清单

### 6.1 后端

| 文件 | 实施内容 |
| --- | --- |
| [domain_constants.go](../../backend/internal/service/domain_constants.go) | 新增两个设置键常量 |
| [settings_view.go](../../backend/internal/service/settings_view.go) | 新增 ContactMethod 模型，扩展 SystemSettings 与 PublicSettings |
| [setting_parse.go](../../backend/internal/service/setting_parse.go) | 解析 JSON、默认值及损坏数据降级 |
| [setting_service.go](../../backend/internal/service/setting_service.go) | 保存最近一份联系人原始配置的已验证结果，避免公共配置请求重复解码图片 |
| [setting_update.go](../../backend/internal/service/setting_update.go) | 校验、序列化及新键映射，保留省略字段语义 |
| [contact_methods.go](../../backend/internal/service/contact_methods.go) | 集中实现列表校验、图片检查和公共投影，供两个出口复用 |
| [setting_handler_update.go](../../backend/internal/handler/admin/setting_handler_update.go) | 请求字段、null 检查、请求到服务模型及更新响应映射 |
| [setting_handler.go（管理员）](../../backend/internal/handler/admin/setting_handler.go) | 管理员 GET 响应映射 |
| [settings.go（DTO）](../../backend/internal/handler/dto/settings.go) | 管理员与公共 DTO 扩展 |
| [setting_public.go](../../backend/internal/service/setting_public.go) | 公共设置读取键列表、响应、注入 payload 与注入映射全部补齐 |
| [setting_handler.go（公共）](../../backend/internal/handler/setting_handler.go) | 公共 API DTO 映射 |
| [setting_handler_audit.go](../../backend/internal/handler/admin/setting_handler_audit.go) | 记录两个新字段的变更；沿用只记录字段名的机制，不记录图片或联系内容 |

不需要 Ent schema 变更或数据库迁移。继续使用现有设置写入及缓存刷新回调，不能新增绕过该回调的独立写入入口。

### 6.2 前端

| 文件 | 实施内容 |
| --- | --- |
| [types/index.ts](../../frontend/src/types/index.ts) | 定义共用 ContactMethod 类型，扩展 PublicSettings |
| [api/admin/settings.ts](../../frontend/src/api/admin/settings.ts) | 管理员设置返回值与可选更新字段类型 |
| [stores/app.ts](../../frontend/src/stores/app.ts) | 补齐默认值与旧版注入数据兼容；保留缓存、请求去重和强制刷新机制 |
| [ContactMethodsEditor.vue](../../frontend/src/components/admin/ContactMethodsEditor.vue) | 列表编辑、启停、排序、图片选择、体积校验和预览 |
| [ImageUpload.vue](../../frontend/src/components/common/ImageUpload.vue) | 可选格式白名单及错误提示；保持异步读取顺序保护 |
| [SettingsView.vue](../../frontend/src/views/admin/SettingsView.vue) | 接入编辑器、表单默认值、加载和显式保存字段；沿用已有保存后公共设置刷新 |
| [HomeContactSection.vue](../../frontend/src/components/home/HomeContactSection.vue) | 紧凑入口、复制文本、悬浮预览、移动端点击与无障碍操作 |
| [HomeView.vue](../../frontend/src/views/HomeView.vue) | 重组分支与共用区域，覆盖三种模式 |
| [中文文案](../../frontend/src/i18n/locales/zh/contact-methods.ts)、[英文文案](../../frontend/src/i18n/locales/en/contact-methods.ts) | 配置名称、限制、错误、复制和悬浮预览文案，分别从 locale index 注册 |
| [contactMethods.ts](../../frontend/src/utils/contactMethods.ts) | 前端列表、体积与图片尺寸校验 |
| [vite.config.ts](../../frontend/vite.config.ts) | 开发环境注入 JSON 转义 `<`，防止联系文字闭合 script 标签 |

列表交互封装在独立编辑器中，SettingsView 保留表单接线；图片校验期间禁用保存，避免上传未完成时提交旧值。

### 6.3 缓存与发布一致性

正常链路应为：管理员保存 → 服务端校验并写 settings → 现有回调使 HTML 缓存失效 → 设置页面沿用 `fetchPublicSettings(true)` 刷新当前应用缓存 → Home 读取最新发布列表。

新访问者既可能读取公共 API，也可能直接消费 HTML 注入配置；这两条路径必须表现相同。已经打开的其他浏览器页面不保证自动收到新配置，重新加载后应一致。当前调研确认了本进程的缓存失效机制，没有验证跨实例广播；多副本部署时必须检查各实例更新可见性，不能承诺全站即时同步。

## 7. 开发顺序与验收

实施按以下顺序完成，验证结果见第 9 节：

1. 完成数据模型、校验、设置读写、默认值与公共投影，补齐 API 和 HTML 注入映射。
2. 完成管理员编辑器、图片格式限制和保存接线，验证草稿／发布边界。
3. 完成共用 Home 区域及三种模式布局，补齐中英文文案。
4. 完成针对性回归、浏览器人工检查及载荷测量，再更新配置使用文档。

### 7.1 自动化验证

| 范围 | 必须覆盖 |
| --- | --- |
| 设置默认与持久化 | 缺键默认值；文字、图片、混合条目保存后重新读取；排序一致；损坏 JSON 安全降级 |
| 更新兼容 | 省略字段不改变数据；`[]` 清空；`false` 关闭；`null` 拒绝；无效列表不部分写入其他设置 |
| 输入限制 | 空名称、内容全空、重复 id、超长文字、超数量、超单图／合计／JSON 大小、非法 Base64、MIME 不匹配、伪造及截断图片、超尺寸图片 |
| 公共数据 | 总开关关闭返回空列表；单项禁用后两条公共出口都不含该项文字或图片；API 与注入字段和值一致 |
| HTML 注入 | 标签、引号与 `</script>` 等文本不破坏注入结构，不产生脚本执行 |
| 管理员前端 | 添加、删除、排序、移除图片保留文字；保存失败保留草稿；快速换图不会被旧 FileReader 覆盖；保存后 Home 使用刷新结果 |
| Home 前端 | 默认／HTML／iframe 均展示；匿名可见；空／全禁用无占位；图片失败可降级；默认不显示二维码；悬停／聚焦预览与离开关闭；移动端点击；文本复制成功和失败；Escape 关闭 |
| 兼容回归 | 旧客服在导航／个人资料／兑换页行为不变；原 Logo 上传行为不变；品牌、模型广场、登录入口及已有自定义首页功能不回退 |

优先扩展现有测试：[部分设置更新](../../backend/internal/handler/admin/setting_handler_partial_payload_test.go)、[公共设置服务](../../backend/internal/service/setting_service_public_test.go)、[公共设置 handler](../../backend/internal/handler/setting_handler_public_test.go)、[注入 schema 一致性](../../backend/internal/handler/dto/public_settings_injection_schema_test.go)、[HTML 注入](../../backend/internal/web/embed_test.go)、[Home 品牌与模式](../../frontend/src/views/__tests__/HomeView.brand.spec.ts)、[ImageUpload 读取顺序](../../frontend/src/components/common/__tests__/ImageUpload.readOrder.spec.ts)。schema 测试不能替代字段实际值和过滤结果一致性测试。

后续维护可使用以下命令；本次实际执行的范围见第 9 节：

```sh
# backend 目录：公共设置服务测试含 unit 构建标签
go test -tags=unit ./internal/service ./internal/handler/...

# frontend 目录：按实际新增测试路径运行针对性测试，再执行项目检查
pnpm test:run src/views/__tests__/HomeView.brand.spec.ts src/components/common/__tests__/ImageUpload.readOrder.spec.ts
pnpm typecheck
pnpm lint:check
pnpm build
```

HTML 注入测试包含 `embed` 构建标签，需在项目要求的前端嵌入资源准备完成后执行对应测试；具体构建方式按现有 Makefile／嵌入流程核实。不能将未编入执行的测试视为通过。

### 7.2 部署与真实设备验收清单

- [ ] 管理员上传真实微信等二维码，保存、刷新设置页面后图片与文字仍存在。
- [ ] 分别配置纯文字、纯图片、图文组合，Home 显示顺序及内容正确。
- [ ] 默认、HTML 和 iframe 三种 Home 均能看到联系人区域，无重复、遮挡或无法滚动的问题。
- [ ] 默认不直接显示二维码；桌面悬浮和手机点击后完整预览，使用真实设备扫描验证；浮层不溢出视口，长文字不撑破布局。
- [ ] 禁用单项、关闭总开关、清空列表后，匿名重新加载页面均不再获得隐藏内容；旧客服文本不会自动回填。
- [ ] 未登录请求管理员配置写接口不能成功；公共接口只返回发布项。
- [ ] 保存后当前页面缓存刷新，新页面注入设置一致；若部署多实例，分别验证每个实例。
- [ ] 记录典型与最大允许图片配置的公共 JSON 和注入 HTML 体积，确认首屏成本可接受。
- [ ] 中英文文案完整，复制及图片弹窗可通过键盘使用，原有站点设置正常保存。

## 8. 上线与回退

新字段默认关闭，升级后不自动公开已有客服文本。推荐先部署支持新字段的后端，再部署前端，最后由管理员添加内容并开启。前端读取缺失字段时使用安全默认值，但配置新字段需要配套后端上线。

功能级回退可关闭总开关，停止公共输出并保留后台配置；新设置键无需删除。代码级回退不应附带删除数据库中的新键。上线前检查使用中的 CSP、反向代理请求大小限制及多实例缓存行为；现有全局请求上限不能代替本功能的较小字段限额。

## 9. 本次交付与验证状态

2026-11-10 已完成前后端实现与本地验证，没有提交、推送或部署。使用说明见[配置首页联系方式](../guides/home-contact-methods.md)。

### 9.1 实际交付

- 后台支持添加、删除、排序、单项启停、总开关、纯文字／图片／图文条目。图片先读取和校验，通过后更新草稿；失败保留原图，保存成功后发布。
- Home 使用紧凑入口，默认没有二维码图片节点。桌面悬停或聚焦打开浮层，移入浮层可继续查看，移出关闭；点击固定预览，再次点击切换关闭。手机端点击打开，支持关闭按钮、外部点击、Escape 及焦点恢复。
- 默认、HTML 和 iframe 三种 Home 共用一个区域。文字按纯文本展示并可复制；关闭总开关或全禁用时区域隐藏。
- 后端严格校验格式、完整图片解码、尺寸和体积；公共 API 与 HTML 注入仅输出发布项。省略、清空、关闭和拒绝 null 的更新语义均保留。
- 不增加依赖、数据库表或迁移。开发环境注入配置增加 script 转义回归，并显式使用维护中的 `vite.config.ts`，避免被本地残留生成文件覆盖。

### 9.2 验证证据

| 范围 | 结果 |
| --- | --- |
| 前端定向回归 | 9 个测试文件、125 项通过：Home 浮层与三种模式、设置页、编辑器、上传、校验、公共配置缓存及开发注入；随后补充移除图片回归，编辑器／上传器 16 项再次通过 |
| 前端工程检查 | `pnpm typecheck`、`pnpm lint:check`、`pnpm build` 通过；构建包含 locale 完整性检查。仍有现有大 chunk 与 Browserslist 数据提示 |
| 后端 service 包 | `go test -tags=unit ./internal/service -count=1` 完整通过（223.179 秒） |
| 后端 handler / DTO | `go test -tags=unit ./internal/handler/admin ./internal/handler/dto ./internal/handler -run 'Contact\|PartialPayload\|PublicSettings\|Injection' -count=1` 通过 |
| HTML 嵌入 | 前端构建后，`go test -tags='unit embed' ./internal/web -count=1` 通过 |
| 浏览器交互 | 本地构建产物、模拟 API：管理员移除图片保留文字／重新上传／保存／公共配置刷新／重载；三种 Home、匿名访客过滤、390px 布局、悬停进入和离开浮层、点击固定与外部关闭、键盘 Tab／Escape／焦点恢复均通过 |

浏览器截图位于本地忽略目录 `output/playwright/`：`home-contact-desktop.png`、`home-contact-preview-desktop.png`、`home-contact-default-mobile.png`、`home-contact-preview-mobile.png`，其他两个 Home 模式也有对应截图。截图使用示例联系人和示例二维码，不是真实客服信息。

### 9.3 载荷测量与未验证范围

使用 Go 测试生成的有效 PNG 测量注入配置 JSON：小型 256 像素样例配置为 2,841 字节，比无联系人增加 664 字节；三张各 100 KiB 图片及文本的边界配置为 427,358 字节，增加 425,181 字节。这是合成 fixture 下的注入 JSON 测量，不能视为真实二维码平均大小或完整页面传输基准。

测试使用仓库测试替身及浏览器模拟 API，未连接真实数据库、未部署生产、未验证多实例缓存或真实设备扫码。第 7.2 节保留上线验收项；手机浏览器验证采用窄视口与点击，触摸事件另由组件测试覆盖。发布前仍需按实际环境完成这些检查。

### 9.4 提交前审查与修复

代码审查和架构复核分别完成，最终结果为 APPROVE / CLEAR。审查期间修复：

- 公共配置原先每次读取都完整解码已保存图片。现按最近一份原始配置缓存已验证结果，配置内容变化时重验，关闭展示时跳过图片读取；返回独立列表，避免调用方修改影响后续响应。新增配置变化、调用方隔离与并发测试，`go test -race -tags=unit ./internal/service -run 'ContactMethods(ReadCache\|ConcurrentReads)' -count=1` 通过。
- 后台允许的 40 个连续英文字母名称在 390px 手机视口造成卡片横向溢出。增加标题换行与宽度约束，浏览器复现及修复后宽度断言均已执行。

提交前重新运行前端 9 个文件、127 项定向回归通过，长名称样式调整后编辑器 7 项再次通过；工程 lint、类型检查（构建内执行）、正式构建、后端 service 完整包、handler／DTO 定向回归和 HTML 嵌入测试均通过。无新增依赖或迁移。

## 10. 图片限额放宽（2026-11-10）

用户在生产上传时受到原 100 KiB、最小 64 像素及最大 2048 像素限制。本次将单张上限提高到 20 MiB、图片总量提高到 60 MiB、列表 JSON 提高到 85 MiB；取消最小尺寸要求，宽高最高 32768 像素，总像素最高 100,000,000。前后端、选择器和中英文提示同步调整，完整内容解码和 PNG/JPEG 格式校验仍保留，图片不压缩、不裁切。以上替代本文原方案的图片边界，当前操作说明见[配置指南](../guides/home-contact-methods.md)。

较大图片的浏览器解码等待窗口调整为 30 秒，签名检查只解码必要的头尾字节，避免将整个文件转换为 JS 数字数组。原有二维码悬浮预览交互保持不变。

状态：前端上传／校验／编辑器定向回归 32 项通过，后端联系方式定向测试通过；浏览器真实上传验证通过 4096×4096 PNG 和 48×32 PNG。GitHub Actions `42779690963` 的完整 CI、安全扫描、镜像发布和生产部署全部成功，生产运行 `v2026.11.10-2`，活动色 `blue`、generation `5`。首页、健康检查和公开设置接口均返回 200，详见[部署记录](../../deploy/production/README.md)。

## 11. 顶栏入口窄屏修复（2026-11-10）

联系方式已移至首页顶栏。发布验收发现，375px 下展开菜单以按钮为锚点时左侧越出视口。小于 1024px 时改以首页顶栏定位，左右各留 16px；桌面继续靠按钮右侧定位。二维码仍按需悬浮／点击预览。

浏览器实测 375、640、768、1024、1440px，菜单均完整处于视口内；组件回归、ESLint 与 TypeScript 检查通过。当前为本地验证，生产结果以部署记录为准。
