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

```bash
npm ci
npm run dev
```

开发服务器启动后，打开终端输出的本地地址；Hash 路由可访问 `#home`、`#today`、`#risk`、`#strategy` 和 `#ipo`。

生产构建与本机启动：

```bash
npm run build
npm run start
```

完整的同机部署、独立产物、环境变量、定时任务与回滚说明见 [自托管运维指南](docs/deployment/self-hosted-node.md)。

## 数据与日期原则

- 页面标题中的“今日”由服务器按 `Asia/Shanghai` 生成；浏览器本机时间不参与该日期计算。
- IPO 节点、信息发布时间和批次时间来自数据库，属于历史业务时间，不会被当天日期替换。
- 数据库无最新成功批次、表或字段时，研究模块保留布局并显示 `XX` 与明确状态。
- 策略页仅保留策略01：`momentum-gap-volume`；批处理默认只读演练，不会写入数据库。
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

数据库结构草案只供评审，不会在本项目中自动执行。请先阅读 [建表授权说明](docs/database/mysql-research-schema-proposal.sql) 和 [页面字段映射](docs/database/frontend-table-map.md)。

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
