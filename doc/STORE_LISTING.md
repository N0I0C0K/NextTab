# 1.5.1 商店提交材料

## 上传文件

- Chrome/Edge：`.output/nexttab-1.5.1-chrome.zip`。
- Firefox：`.output/nexttab-1.5.1-firefox.zip`；源码与构建说明使用 `.output/nexttab-1.5.1-sources.zip` 和根目录 `DEVELOPMENT.en.md`。
- 图标：`public/icon-128.png`；大图备用 `public/icon-512.png`。
- 版本更新说明：[CHANGELOG.md](../CHANGELOG.md)。
- 隐私说明：[PRIVACY.md](../PRIVACY.md)。合并发布后，可将该文件的公开 GitHub 页面作为商店隐私说明链接。
- 截图：`doc/images/` 中的中英文图片可作为构图参考；正式商店素材应使用当前发布版本和示例数据重新拍摄，保留最新 Logo 与平台快捷键。

建议按顺序展示四个场景：有回访推荐和常用网站的首页、带搜索结果的命令面板、包含标签／书签／最近访问的站点详情、有内容的深色首页。使用统一尺寸与语言，不包含真实浏览记录。

## 产品描述

名称：NextTab

简体中文简述：简洁的新标签页：搜索标签、书签与历史，找回最近浏览的页面，管理常用网站。

English summary: A clean new tab for searching tabs, bookmarks and history, returning to recent pages, and managing quick links.

详细描述可使用中英文 README 的简介与功能展示。不要将当前 MQTT 提醒功能描述为已实现的数据同步。

## 权限用途

| 权限                             | 用途                                                   |
| -------------------------------- | ------------------------------------------------------ |
| storage                          | 保存设置、快捷链接和本地推荐偏好                       |
| tabs                             | 搜索、展示及切换打开的标签页，记录前台页面使用         |
| history                          | 搜索历史和计算最近常用页面                             |
| bookmarks                        | 搜索书签和展示相关书签                                 |
| search                           | 调用浏览器选择的搜索引擎进行网页搜索                   |
| topSites                         | 首次使用时供用户选择常用站点                           |
| notifications、alarms            | 可选 MQTT 喝水提醒与连接心跳                           |
| favicon（Chrome）                | 使用浏览器已有的网站图标                               |
| GitHub 可选站点权限              | 用户授权后检查本项目最新版本                           |
| MQTT 可选站点与 Firefox 数据权限 | 用户授权后向选定服务发送显示名称、频道密钥和消息元数据 |

## Firefox 首次提交

- 固定 ID：`nexttab@n0i0c0k.github.io`，后续更新沿用此 ID。AMO 在首次签名时校验唯一性。
- 桌面最低版本：Firefox 140.0，以使用内置的可选数据授权。
- 1.5.1 已移除 `gecko_android` 声明，仅面向桌面 Firefox；Android 不支持当前首页使用的 `chrome_url_overrides.newtab`。此前提交的 1.5.0 仍含 Android 声明，需用匹配的 1.5.1 发布包与源码更新 AMO，仓库修复不会自动修改商店中已上传的版本。
- 必需数据类型：`none`；可选类型：`authenticationInfo`、`personallyIdentifyingInfo`、`technicalAndInteraction`，对应 MQTT 频道密钥、显示名称和消息元数据。核心搜索与推荐不依赖这些可选权限。
- 构建方法：Node.js 20.19+、pnpm 9.9，`pnpm install --frozen-lockfile` 后执行 `pnpm build:firefox`。PNG 与字标已包含在源码中，构建无需运行图标生成器或安装 Chromium。
- 上传前用 `pnpm exec web-ext lint --source-dir .output/firefox-mv3` 校验包，再在 Firefox 140+ 中核对新标签页、Popup、明暗主题及 MQTT 授权／撤销。

1.5.0 已由用户在 AMO 完成首次提交；上次核对时等待审核，尚未公开上架。源码、版本说明、审核说明、隐私说明、图标和两张主题截图已保存。1.5.1 是本轮 review 后的修复版本，尚待用户最终确认提交；正式截图仍需按上述场景完善。本地构建的 ZIP 是未签名原始包，签名与审核由 AMO 处理。

依据：[Firefox 扩展 ID](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/browser_specific_settings)、[内置数据授权](https://extensionworkshop.com/documentation/develop/firefox-builtin-data-consent/)、[Android 兼容声明与 AMO 控制](https://extensionworkshop.com/documentation/publish/version-compatibility/)。

## AMO 审核说明 / Reviewer notes

The source ZIP includes the pnpm lockfile and build instructions. No remote code is loaded and the default MV3 content security policy is used without `unsafe-eval`.

For 1.5.1, `web-ext lint` reports 0 errors, 0 notices and 9 warnings. Eight warnings come from bundled dependencies:

- `innerHTML`: React DOM's renderer and Base UI's DOM mirroring. Application code does not use `dangerouslySetInnerHTML` for page titles, URLs or MQTT messages.
- `Function`: expr-eval's unused `toJSFunction` method, lodash's global-object fallback, and MQTT dependency polyfills for generator runtime/function binding. The calculator uses `Parser.evaluate` to interpret expressions. Modern browser globals and native function binding bypass the fallback branches.
- `eval`: an intrinsic reference in an MQTT dependency; it is not an evaluation of downloaded code.

The remaining warning checks `gecko.data_collection_permissions` against Android 140 (inherited from the desktop minimum). Data consent is supported on desktop Firefox 140; this release intentionally omits `gecko_android` because Android does not support the new-tab override. The warning does not represent an Android support claim, and Android compatibility should not be added to suppress it.

These are static warnings, not an AMO approval. Reviewers can inspect the corresponding locked dependencies in the source build. The package does not enable dynamic evaluation to bypass extension CSP.
