# 单机蓝绿部署

**日期：2026-11-10；状态：部署事务、SSH 传输及真实 Caddy 隔离测试通过，真实目标部署尚未完成。**

本目录用于单机 Docker Compose + Caddy 的蓝绿发布。蓝、绿共用 PostgreSQL、Redis、插件文件和定价目录；每个实例的配置目录和插件 runtime socket 保持隔离。单机蓝绿不提供主机高可用，应用回滚不会恢复数据库，也不保证无限时长的流式请求不中断。

## 发布链路

Release 解析一个固定提交 SHA，对该 SHA 运行可复用 CI，全部通过后才发布镜像。镜像发布输出 `repository@sha256:...`，生产任务直接消费该 digest，不通过 `latest` 再解析版本。dry-run 不发布、不部署。

生产任务使用 `production` GitHub Environment。未启用时明确跳过部署；启用后，缺少配置或精确 SHA 的迁移兼容性确认会失败，不会静默跳过。VERSION 文件的机器人同步不作为部署源。

实际部署顺序：

1. 获取部署锁，核对活动状态、磁盘配置、Caddy 运行态和容器镜像。
2. 核对活动实例的共享文件卷，预拉取候选 digest；传入 `--source-sha` 时核对镜像 OCI revision。
3. 在启动候选及执行迁移前，用 PostgreSQL 容器生成 custom-format 备份，并通过 `pg_restore --list` 校验归档。
4. 启动空闲色，通过健康检查、直连业务接口和 Caddy 配置校验。
5. 原子替换配置并 reload；检查运行态和公网 HTTPS 的唯一部署标记。
6. 观察新路由，继续保留旧实例，默认等待 300 秒让现有连接结束；期间持续探测新路由。
7. 提交新活动状态，停止旧色。切流失败则恢复并验证旧配置；无法确认恢复时保留两色及 `pending.json`，拒绝继续发布。

## 配置自动部署

在仓库的 `production` Environment 配置以下变量与 secrets。服务器需要 Docker Compose v2、Python 3.9+、curl，以及预先审核过的域名、80/443 端口和现有蓝绿状态。

| 类型 | 名称 | 用途 |
| --- | --- | --- |
| Variable | `PRODUCTION_DEPLOY_ENABLED` | 设置为 `true` 才执行生产任务 |
| Variable | `PRODUCTION_SSH_HOST` / `PRODUCTION_SSH_USER` | SSH 目标与部署用户 |
| Variable | `PRODUCTION_SSH_PORT` | 默认 22 |
| Variable | `PRODUCTION_DEPLOY_PATH` | 专用部署根目录，例如 `/opt/ggbond-production` |
| Variable | `PRODUCTION_DOMAIN` | 域名，不含协议或路径 |
| Variable | `PRODUCTION_PROJECT` | 稳定且专用的 Compose 项目名，默认 `ggbond-production` |
| Variable | `PRODUCTION_SCHEMA_COMPATIBLE_SHA` | 已审核数据库向后兼容性的完整 40 位提交 SHA，必须等于本次发布 SHA |
| Variable | `PRODUCTION_DUAL_INSTANCE_APPROVED` | 确认启用的后台任务允许短时双实例后设置 `true` |
| Secret | `PRODUCTION_SSH_PRIVATE_KEY` | 部署专用私钥 |
| Secret | `PRODUCTION_SSH_KNOWN_HOSTS` | 已核验的服务器 SSH 主机密钥记录 |

服务器目录约定：

```text
/opt/ggbond-production/
  shared/production.env
  shared/state/state.json
  shared/state/caddy/Caddyfile
  shared/state/transactions/<token>/database.dump
  releases/<source-sha>-<unique-id>/
```

部署工具由 workflow revision 在 prepare 阶段保存为同次运行的 artifact，发布旧 tag 时仍使用已审核的部署工具；应用镜像继续按发布源 SHA 校验。SSH 入口只上传允许列表中的部署脚本，每次写入独立 release 目录，不覆盖远端私有环境文件、不执行 `git pull`。SSH 强制校验已固定的主机密钥。自动流程只执行现有环境的 `deploy`，不自动 bootstrap，也不认领旧项目卷。

`production.env` 至少包含固定且一致的 `POSTGRES_PASSWORD`、`REDIS_PASSWORD`、`JWT_SECRET`、`TOTP_ENCRYPTION_KEY`、`ADMIN_EMAIL` 和 `ADMIN_PASSWORD`，权限建议 0600。私有环境文件不提交仓库，不作为 shell 脚本 source。私有镜像须预先在服务器配置 registry 登录。

## 首次启动与手动命令

首次环境、已有本工具的旧版本、从旧 GGbondai 项目迁站是三种不同操作。bootstrap 仅用于显式确认的空项目，拒绝覆盖现有容器、状态或配置。禁止使用 `down -v` 迁移数据。

以下占位值须替换为真实且已核验的值。全局参数写在子命令之前：

```bash
./deploy/production/production.sh \
  --env-file /opt/ggbond-production/shared/production.env \
  --state-dir /opt/ggbond-production/shared/state \
  --domain api.example.com --project ggbond-production \
  bootstrap --color blue \
  --image ghcr.io/yaoruiquan/ggbond@sha256:REPLACE_WITH_64_HEX_DIGEST \
  --source-sha REPLACE_WITH_40_HEX_COMMIT \
  --ack-bootstrap --ack-schema-compatible --ack-dual-instance \
  --backup-ref REPLACE_WITH_VERIFIED_BACKUP_ID
```

日常命令用同样的全局参数：`status`；`deploy --image <digest> [--source-sha <commit>]`；或 `rollback`。变更命令需要 `--ack-schema-compatible --ack-dual-instance --backup-ref <non-secret-id>`。rollback 使用持久记录的另一色 digest，回退前也生成数据库备份。

`--timeout` 控制单次启动、拉取与备份命令的超时；`--observe-seconds` 默认 10 秒，`--drain-seconds` 默认 300 秒，`--probe-interval` 默认 2 秒。测试可将排空设为 0，生产需按请求最大时长安排。`--keep-old` 会保留旧容器，但仍需完成排空观察。不要长期双活未审核的后台任务。

## 已有数据卷升级

旧版给两色各自挂载 `/app/data`，没有共享子卷。新版发现活动实例没有挂载本项目的 `plugins_data` 与 `pricing_data` 时，**会在拉取/备份/候选启动前拒绝升级**，防止自动挂载空卷掩盖既有数据。

需先安排维护迁移：备份两色卷，识别实际活动色及文件来源；停止可能写入文件的应用实例，将活动实例的 `plugins` 内容复制到共享插件卷，将定价文件复制到共享定价卷，处理另一色的差异，再以同一 digest 重建活动实例并核对数据。保留原插件路径 `/app/data/plugins`，不要把 runtime socket 复制为持久数据。定价默认目录改为 `/app/data/pricing`；自定义 fallback/override 路径或 config.yaml 应明确迁移并在两色保持一致。没有通用的自动覆盖/合并策略，禁止用 bootstrap 绕过迁移。

插件共享 `packages`、`installed` 和 staging；`/app/data/plugins/runtime` 使用每容器独立 tmpfs，避免共享 Unix socket。实例自己的 `/app/data/config.yaml` 仍位于各色独立卷，显式自定义配置必须在两色同步。

## 长连接、恢复与备份

Caddy 使用 `stream_close_delay` 推迟 reload 时关闭 WebSocket，脚本按新旧配置中较长的上限保留旧实例。超过这个窗口的 WebSocket 仍可能需要重连；普通 HTTP/SSE 停止时再由应用执行默认 60 秒 Shutdown，容器给予 90 秒宽限。该策略是有界排空，不代表对无限时长流或最终计费落库的完全保证。

部署会保存实际旧 Caddy 配置和目标配置快照，回退不根据新模板重建旧配置，因此更改排空时间或模板后仍可恢复原配置。无法核验恢复时，检查事务结果、两色和 Caddy 的实际状态后再处理；不要直接删除 pending 文件继续发布。旧路由确认保留或恢复后，会停止失败候选以免后台任务继续运行，保留停止的容器和日志；候选停止失败也会保留 pending 并拒绝后续部署。

`database.dump` 保存于每次事务目录，权限 0600；归档列表校验不等于完整恢复演练。需制定空间监控、加密异地备份和保留策略，当前脚本不会自动删除备份。数据库迁移必须兼容旧程序；不兼容变更使用维护窗口。数据库恢复涉及停写与备份后数据损失，应单独执行，rollback 不会自动恢复。

只有 Caddy 映射公网端口；应用、数据库、Redis 和 Caddy admin 均不映射公网。接入 CDN 时按 [边缘安全说明](../EDGE_SECURITY.md) 配置精确信任链。

## 验证

```bash
python3 deploy/tests/production-blue-green-test.py
python3 deploy/tests/production-ssh-test.py
python3 deploy/tests/production-caddy-integration-test.py
bash deploy/tests/release-deployment-test.sh
```

CI 包含上述测试。fake Docker/curl 对未知命令直接失败，不转发真实网络请求。模拟测试覆盖双向切流、拉取、镜像 revision、备份、配置校验、reload、观察、恢复、状态漂移与锁；SSH 测试覆盖固定主机密钥、配置校验、允许列表传输和拒绝隐式 bootstrap。真实 Caddy 2.10.2 完整模板配置解析已核验；Docker 隔离测试实际验证生产 reverse_proxy 块在 reload 后新请求切到 green、已有 blue SSE/WebSocket 持续收到新消息，以及共享文件卷和独立 runtime tmpfs。隔离测试提取代理块并使用 HTTP，未覆盖生产 TLS/DNS、后台任务、真实数据迁移、应用自身退出与计费，仍须在目标环境验证。
