/* 脱敏源码交付白名单。禁止增加真实配置、旧研究归档、日志或Git历史。 */
module.exports = [
  '.gitignore', 'ci/offline-checks.yml.example', 'SOURCE_DELIVERY.md', 'validation-results.json',
  'scripts/source-files.js', 'scripts/export-source.js', 'scripts/fixtures.js', 'scripts/test-offline.js',
  'investment-platform/server.js', 'investment-platform/cloud-store.js', 'investment-platform/config-service.js', 'investment-platform/sql/001_compare_and_swap.sql', 'investment-platform/test-cloud-adapter.js',
  'investment-platform/package.json', 'investment-platform/package-lock.json', 'investment-platform/public',
  'investment-platform/config.example.json', 'investment-platform/publicConfig.example.json',
  'investment-platform/lg_sync_test.js', 'investment-platform/verify-integrity.js', 'investment-platform/test-config-service.js',
  'investment-platform/test-refresh.js', 'investment-platform/test-server-api.js', 'investment-platform/test-cloud-roundtrip.js',
  'invest-miniprogram/app.js', 'invest-miniprogram/app.json', 'invest-miniprogram/app.wxss', 'invest-miniprogram/sitemap.json',
  'invest-miniprogram/project.config.example.json', 'invest-miniprogram/README.md', 'invest-miniprogram/pages',
  'invest-miniprogram/libs/workbuddy-cloud.js', 'invest-miniprogram/utils/cloud.js', 'invest-miniprogram/utils/errors.js',
  'invest-miniprogram/utils/quotes.js', 'invest-miniprogram/utils/store.js', 'invest-miniprogram/utils/investment-core.js',
  'invest-miniprogram/scripts/build.js', 'invest-miniprogram/scripts/sync-core.js', 'invest-miniprogram/scripts/verify.js', 'invest-miniprogram/scripts/verify-network.js',
  'codex-产出/界面验收-20261018.png', 'codex-产出/代码审查与改进-20261018.md', 'codex-产出/第二轮完善与验收-20261018.md'
]
