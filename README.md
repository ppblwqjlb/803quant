# 803见势研究 · A 股数据与信息研究平台

这是一个以 Next.js Node 运行时构建的本地自托管研究平台。首页、今日决策台、风控提醒、策略信号观察和 IPO 专题保留原有前端体验；研究数据通过只读 API 从 MySQL 读取。数据库尚无对应数据或字段时，页面会显示 `XX`，不会回退为旧的静态市场数据。

## 页面

- 品牌首页（`#home`）
- 今日决策台（`#today`）
- 风控提醒（`#risk`）
- 策略信号观察（`#strategy`）
- IPO 专题（`#ipo`）
- 会员服务（`#membership`，浏览器内演示）

## 本地运行

要求 Node.js `>=22.13.0`。

托管数据库只监听服务器本机回环地址，因此本地开发需要先把远端 MySQL 映射到本地端口：

```bash
npm ci
# 从 .env.example 创建 .env，并填写 MYSQL_* 与 SSH_TUNNEL_*
npm run db:tunnel    # 常驻运行，把远端 MySQL 暴露到 127.0.0.1:3306
npm run dev          # 另开一个终端
```

开发服务器启动后，打开终端输出的本地地址；Hash 路由可访问 `#home`、`#today`、`#risk`、`#strategy`、`#ipo` 和 `#membership`。

生产构建与本机启动：

```bash
npm run build
npm run start
```

完整的同机部署、独立产物、环境变量、定时任务与回滚说明见 [自托管运维指南](docs/deployment/self-hosted-node.md)。

## 数据与日期原则

- 页面标题中的“今日”由服务器按 `Asia/Shanghai` 生成；浏览器本机时间不参与该日期计算。
- 交易日期由 `daily` 的最新可用交易日推导，取值不晚于请求日期，批次号形如 `market-20260917`，页面同时展示实际数据日期，不会把旧数据当作当日数据。
- 每个模块各自标注取数来源与来源自身的日期（例如 `margin_daily` 通常滞后一至两个交易日）。
- 缺少某个数据源时，该模块保留布局并显示 `XX`，响应状态为 `partial`；完全没有可用交易日时状态为 `missing`；查询异常时状态为 `failed`，且不泄露驱动或连接细节。
- 策略页展示数据库中已存在的 `startup_signal`（启动信号）批次，来源为 `risk_strategy_run`、`risk_strategy_funnel`、`risk_strategy_result`、`risk_strategy_stock_stage` 与 `risk_strategy_signal_history`。
- 页面一律只读；数据入库由外部数据管道负责，本项目不执行任何写入、建表或迁移。
- 会员购买和兑换仍为浏览器内原型演示，不是支付或账户系统。

## MySQL 配置

从 `.env.example` 创建仅供服务器使用的环境文件，并按实际环境填写。前端代码不会读取这些变量，也不要将任何真实环境文件提交到仓库。

| 变量 | 用途 |
| --- | --- |
| `MYSQL_HOST` | MySQL 主机或同机回环地址 |
| `MYSQL_PORT` | MySQL 端口 |
| `MYSQL_DATABASE` | 数据库名 |
| `MYSQL_USER` | 网页服务只读账号 |
| `MYSQL_PASSWORD` | 上述账号密码 |
| `MYSQL_CONNECTION_LIMIT` | 连接池上限 |
| `SSH_TUNNEL_HOST` / `SSH_TUNNEL_PORT` | 仅本地开发：跳板机地址与端口 |
| `SSH_TUNNEL_USER` / `SSH_TUNNEL_PASSWORD` | 仅本地开发：跳板机账号 |
| `SSH_TUNNEL_REMOTE_HOST` / `SSH_TUNNEL_REMOTE_PORT` | 仅本地开发：跳板机侧的 MySQL 地址 |
| `SSH_TUNNEL_LOCAL_HOST` / `SSH_TUNNEL_LOCAL_PORT` | 仅本地开发：本地监听地址，需与 `MYSQL_HOST` / `MYSQL_PORT` 一致 |

今日决策台与策略信号观察直接读取已部署的行情与研究表：`daily`、`daily_basic`、`adj_factor`、`index_basic`、`index_daily`、`limit_updown`、`margin_daily`、`call_auction`、`gold_oil`、`exchange_rate`、`foreign_index`、`ci_index_daily`、`ci_index_member`、`stock_basic` 以及 `risk_strategy_*` 系列。全部查询经过 `lib/server/sql-guard.ts` 的表名白名单与只读语法校验。

风控提醒与 IPO 专题仍按 [建表授权说明](docs/database/mysql-research-schema-proposal.sql) 中的研究结果表设计，这些表尚未部署，因此对应模块当前显示 `XX` 与明确状态；[页面字段映射](docs/database/frontend-table-map.md) 与 [现有库结构盘点](docs/database/current-schema-audit.md) 保留了该设计说明，实际库结构以本机 `npm run db:audit` 的结果为准。

## 验证

```bash
npm run test:unit
npm run lint
npm run build
node --test tests/rendered-html.test.mjs
```

浏览器烟测需要一个已开启远程调试端口的本地浏览器和正在运行的本地服务：

```bash
APP_BASE_URL=http://localhost:3000 CDP_PORT=9222 node tests/browser-smoke.mjs
```

默认烟测按“未配置研究数据库”的本地状态断言 `XX` 缺失值；如在完整数据库环境核验，可显式设置 `SMOKE_EXPECT_MISSING_DATA=false`。

不在未获单独授权时执行任何数据库建表、改表、写入或迁移操作。
