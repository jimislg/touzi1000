# 投资平台小程序（只读客户端）

手机浏览投资平台的微信小程序。**纯只读**，不写任何数据；数据唯一来源是线上平台 `https://langang-invest.app.workbuddy.host`。

## 页面结构

| Tab | 内容 |
|---|---|
| 总览 | 总资产/浮盈/税后年股息 + 信号清单（已触发/接近/仓位预警；网页端已划掉的信号淡出显示并标注） |
| 持仓 | 7 只持仓：现价/市值/成本/浮盈/权重/税后股息 |
| 策略 | 五大席位：预算/进度/空间 + 每成员档位 pill（到档 ✓ 高亮）+ 满配年股息（含宁德特别股息单列）+ 过渡仓 |
| 观察 | 30 标的观察池：档位/状态（可购入·接近·等待）/研究批次，可筛选 |

## 技术要点

- **计算口径与网页版 public/index.html 同源**：totalCapital / hLive / divCNYof / ladderTxt / pill 金额（totalCapital×tierPct）全部移植自网页版
- **快照秒开 + 实时覆盖**：`utils/snapshot.js` 为构建时生成的离线快照（config + 行情），小程序启动立即渲染快照，随后 `wx.request` 拉取 `/api/config`、`/api/quotes` 覆盖为实时数据
- **口令注入**：`utils/config.js` 由 `scripts/build.js` 在构建时从 `investment-platform/config.json` 读取 accessKey 生成（源码中不出现口令字面量）。平台口令变更后重跑 build 即可
- **scripts/ 目录不打包**：project.config.json `packOptions.ignore` 已排除，verify 的禁用语法扫描同样跳过

## 使用步骤（微信开发者工具）

1. 下载安装「微信开发者工具」（stable 版）
2. 导入项目 → 选择本目录（invest-miniprogram）→ AppID 选「测试号」即可（touristappid 已预填）
3. 预览/真机调试：工具栏「预览」扫码即可在手机打开
4. 正式发布需要自己的小程序 AppID；注意**个人主体无法选择股票信息类目**，作为自用工具建议不上线、仅用「体验版」（把你的微信号加为体验成员即可长期使用）

## 域名白名单

`urlCheck: false` 已关（开发/体验版可直接请求）。若发布正式版，需到公众平台→开发管理→开发设置→服务器域名，把 `langang-invest.app.workbuddy.host` 加入 **request 合法域名**。

## 数据更新流程

平台数据（档位/持仓/口令）变更后，在本目录跑：

```bash
node scripts/build.js   # 重新生成 utils/config.js + utils/snapshot.js
node scripts/verify.js  # 交付前校验（结构 + 口径空跑）
```
