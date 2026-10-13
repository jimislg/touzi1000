# 投资平台微信小程序

只读展示总览、持仓、策略席位和观察池。启动时显示本地快照，随后通过 WorkBuddy 官方小程序 SDK 读取云数据库，通过腾讯行情接口更新价格。计算口径沿用平台。

## 本地配置与构建

本项目需要本机相邻的 investment-platform 目录及其 publicConfig.json、config.json。scripts/build.js 使用平台访问配置只读拉取线上数据，生成以下本机文件：

- utils/config.js：共享网关与 publishableKey。
- utils/snapshot.js：包含个人持仓与成本的离线快照。

这两个生成物不在公开源码归档中。不要将平台口令、完整快照、预览码或含这些文件的 Git 历史推送到公开仓库。持有 publishableKey 能否读到数据取决于云数据库权限，不能仅凭“公开密钥”的名称认定可以公开个人数据。

```sh
node scripts/build.js
node scripts/verify.js
node scripts/verify-network.js
# 可选：只读连接真实服务，模拟微信 UA / Referer
node scripts/verify-network.js --live
```

verify-network.js 在不提供浏览器 URL、Headers、fetch 的隔离环境中加载原版 SDK，覆盖域名拒绝、超时、SSL 错误、HTTP 错误、刷新失败及恢复。不手改 libs/workbuddy-cloud.js。

## 手机端配置与验收

在微信公众平台的开发管理 → 开发设置 → 服务器域名中配置两个 **request 合法域名**：

```text
https://mp-api.app.workbuddy.host
https://qt.gtimg.cn
```

开发者工具的 urlCheck: false 不代表手机已经配置合法域名。配置后刷新开发者工具的域名信息并重新生成预览包，以关闭调试的手机实际请求为验收依据。若后台不接受域名，需要另行部署符合要求的代理或云函数；本次没有新增云服务。

SDK 的 error 信封也可能来自本机 wx.request 失败，不能据此断言请求到达网关。新版保留错误消息、代码和 HTTP 状态，识别域名拒绝并给出操作提示。

只有配置和行情均成功才更新数据；刷新失败保留原有完整数据并标明失败。桌面线上测试不验证手机域名白名单，不等于真机通过。手机验收需确认顶部显示“实时”，四页正常，并在关闭调试后重新打开仍能刷新。

生成预览码时，将输出路径设在本机 codex-产出 目录。预览码有有效期，长期使用需要另行上传版本并在微信后台设置体验版；成功生成预览码不代表已设置体验版。
