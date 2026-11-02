# 可选蓝绿部署运行手册

**日期：2026-11-02；状态：实现中，待模拟测试与独立审查，尚未真实部署。**

本目录用于单机 Docker Compose + 容器化 Caddy 的可选蓝绿发布，不覆盖上层通用 Compose。不是双机高可用，也不保证数据库回滚、零中断或零计费损失。本次开发不连接生产、不拉取或发布镜像、不切真实流量。

## 1. 上线门禁

执行任何真实命令前，另行审核服务器拓扑、域名及端口、当前版本、镜像架构和 digest、现有 Compose 项目名与卷归属。首次空环境与已有 GGbondai 迁站是不同操作，不能通过 bootstrap 自动认领旧容器或旧卷；禁止 `down -v`。

- blue、green 共享同一生产 PostgreSQL/Redis，但开发环境不得误连生产。
- 两色使用独立不可变镜像 digest；不要用 `latest` 或可变 tag 作为恢复依据。
- 两色使用一致且固定的 JWT/TOTP 等密钥，不能在每次启动时重新生成。私有 env 不提交、不粘贴到日志。
- 候选启动会执行数据库迁移；`AUTO_SETUP=false` 不会关闭迁移。没有兼容性证据不能确认 `--ack-schema-compatible`。
- 数据库变更必须兼容旧实例；不兼容升级使用另行设计的维护窗口，不强行在线蓝绿。
- 提供备份标识并不证明备份可恢复，恢复演练应按 [部署恢复门禁](../README.md#ggbond-migration-safety-and-recovery-gate) 单独完成。
- 后台任务仅部分有跨实例协调证据。确认实际启用的任务及幂等性后才能允许短时双活；不要默认长期 `--keep-old`。

## 2. 流量与状态约束

Caddy 配置只能包含一个活动色 upstream，候选通过健康与直连检查前不接公网流量。切换通过完整配置校验、原子替换、reload、运行态校验及入口观察完成，不依赖“blue 优先、停止旧色”。

持久状态记录活动色、每色 digest 和上一版本；部署使用互斥锁。配置挂载目录而非单文件，避免原子 rename 后容器仍看到旧 inode。状态缺失、非法或与代理运行态不一致时拒绝部署，不能默认 blue。

切流失败应恢复并确认旧路由；无法确认恢复时保留两色、事务记录和配置现场，禁止继续发布。不得删除 pending 状态来绕过失败门禁。

## 3. 命令接口

接口正在实现，以下描述不是已通过验收的上线指令；最终以 `production.sh --help` 和模拟测试为准。

入口：`production.sh [全局参数] {bootstrap,deploy,rollback,status}`。全局参数必须写在子命令之前；门禁和 image/color 等子命令参数写在之后。包括 `status` 在内均需明确 `--env-file` 与 `--domain`。

以下仅演示参数布局，不代表已经授权连接服务器；占位值必须替换为审核后的真实值，不能直接运行：

```text
./deploy/production/production.sh \
  --env-file /ABSOLUTE/PATH/production.env \
  --domain api.example.com --project ggbond-production \
  status

./deploy/production/production.sh \
  --env-file /ABSOLUTE/PATH/production.env \
  --domain api.example.com --project ggbond-production \
  bootstrap --color blue \
  --image ghcr.io/yaoruiquan/ggbondai@sha256:REPLACE_WITH_APPROVED_DIGEST \
  --ack-bootstrap --ack-schema-compatible --ack-dual-instance \
  --backup-ref REPLACE_WITH_VERIFIED_BACKUP_ID
```

`status` 的只读性仅针对应用部署状态，并不表示无需 Docker 访问权限；本轮只调用帮助与 fake 测试，不执行真实 status。

- `--env-file`：人工准备的绝对路径，交给 Compose，不作为 shell 脚本 source。
- `--domain`：实际域名；`--project`：专用且稳定的 Compose 项目名。
- `--state-dir`：持久状态路径，默认本目录 `state/`，权限应限制为部署用户。
- `--timeout`、`--observe-seconds`、`--probe-interval`：候选等待及切流观察窗口，不能代替业务验收。
- `bootstrap`：仅用于显式确认的首次环境，需 `--ack-bootstrap`、`--color` 和 `--image`。
- `deploy`：使用 `--image` 指定候选 digest。
- `rollback`：使用持久记录的 previous 色和 digest，不恢复数据库。
- 变更命令须确认 `--ack-schema-compatible`、`--ack-dual-instance` 并提供 `--backup-ref`。
- 默认观察通过后停止旧色；`--keep-old` 只保留容器，不改变单 upstream 原则。旧 `KEEP_OLD` 环境变量不支持。

## 4. 停止、排空与回滚

停止窗口必须覆盖 HTTP 排空和服务清理：默认 HTTP 60 秒、容器宽限 90 秒；调整排空上限时同步增加容器宽限。

`http.Server.Shutdown` 超时不会保证所有 handler 已结束。超时后仍有流式处理器与资源清理竞争的遗留风险，可能影响最终 usage/计费持久化。本方案不宣称已修复该问题。

镜像回退只在数据库结构、Redis 状态及密钥与旧程序兼容时成立。数据库恢复需另行批准、停写并评估备份之后的数据损失，不由 rollback 自动执行。

## 5. 代理信任与网络

只有 Caddy 暴露公网 80/443；数据库、Redis、应用端口和 Caddy admin 2019 不映射公网。直连源站的配置不能信任客户端自报的 Cloudflare/IP 头；使用 CDN 时按 [边缘安全说明](../EDGE_SECURITY.md) 配置精确信任链和源站防火墙，不能泛信任所有来源。

## 6. 验收边界

模拟测试应覆盖双向切流、候选/配置校验/reload/观察失败、恢复失败、状态漂移、锁冲突及每色镜像记录。fake 工具对未知命令直接失败，绝不转发真实 Docker 或 HTTP 请求。

模拟测试不能证明真实 Caddy 版本兼容、TLS/DNS、镜像可拉取、迁移安全、后台任务防重或 SSE/WebSocket 与计费排空。首次真实部署前应在隔离环境确认这些项目；真实模型 smoke 可能收费，需另行授权。
