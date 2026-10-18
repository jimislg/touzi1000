# 投资平台与微信小程序：脱敏源码交付

本分支包含投资平台、小程序、本轮修复、离线测试及验收报告。它是从文件白名单建立的独立源码快照，不携带原分支Git历史、个人配置、访问凭证、持仓成本快照或旧研究归档。

## 离线验证

需要Node 24，不需要安装npm依赖或连接云库：

```sh
node scripts/test-offline.js
# 保存本次验收结果
node scripts/test-offline.js --results validation-results.json
```

测试在临时目录注入明确标注的合成数据，完成后删除临时目录，不覆盖本机个人文件。CI模板 `ci/offline-checks.yml.example` 仅执行此离线验收，不执行发布、上传或云数据库写入。当前OAuth凭证缺少workflow权限，因此模板未放入活动工作流目录，远端CI尚未启用；维护者可另行审核并启用。`delivery-manifest.json`记录交付文件哈希，`validation-results.json`记录本地测试结果。

## 本地运行与个人配置

1. 将`investment-platform/config.example.json`复制为同目录`config.json`，按实际资料填写；设置个人访问口令。空示例不含投资建议或研究结论。
2. 将`publicConfig.example.json`复制为`publicConfig.json`并在本机配置实际数据面；不要提交这两个文件。
3. 运行`LG_MOCK_CLOUD=1 node investment-platform/server.js`可检查本地界面。mock只隔离云数据库，本地网页保存仍会修改本机配置；自动行情/分红读取仍使用原有上游。
4. 小程序将`project.config.example.json`复制为`project.config.json`并填写自己的AppID。共用口径更新运行`node invest-miniprogram/scripts/sync-core.js`。
5. 真机使用仍需在本人环境生成私有`utils/config.js`与`utils/snapshot.js`。`build.js`会读取线上配置和行情；本次没有执行它，没有云端、发布或真机验收。

## 保存与同步规则

配置GET返回`_revision`与`_syncStatus`。POST必须带`expectedRevision`，否则返回428；旧版本返回409，不覆盖其他客户端修改。`config.json.pending`持久保存未完成同步的数据；云端条件更新失败或冲突时保留该文件，不能把删除它当成解决冲突。云端更新使用既有JSONB行的相等条件；维护者需先审查并安装 `investment-platform/sql/001_compare_and_swap.sql` 中的RPC（本轮未安装），配置通过POST正文传输，避免长URL和敏感查询参数；服务不支持条件更新时保持待同步，绝不退回无条件upsert。

客户端RPC入口沿用仓库随附的官方SDK接口。真实网关、RLS策略与条件更新兼容性必须由具备云端权限的人另行验收，本地mock不能代替该结论。

本分支不删除GitHub既有其他分支中的历史资料，也不轮换任何凭证；若原历史已经暴露，需要由仓库与云账号所有者另行处理。所有内容性改动以数据口径、日期与待核提示为主，未编造研究观点或改变持仓、买卖条件、税率与IRR锚点。
