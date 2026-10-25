# 1.5.1 商店提交材料

## 上传文件

- Chrome/Edge：`.output/nexttab-1.5.1-chrome.zip`。
- Firefox：`.output/nexttab-1.5.1-firefox.zip`；源码与构建说明使用 `.output/nexttab-1.5.1-sources.zip` 和根目录 `DEVELOPMENT.en.md`。
- 图标：`public/icon-128.png`；大图备用 `public/icon-512.png`。
- 版本更新说明：[CHANGELOG.md](../CHANGELOG.md)。
- 隐私说明：[PRIVACY.md](../PRIVACY.md)。合并发布后，可将该文件的公开 GitHub 页面作为商店隐私说明链接。
- 截图：2026-10-24 已上传五张 1.5.1 功能图，包含 NextTab Logo、示意网站图标和中英文说明。依次介绍首页、统一搜索、站点页面、工具栏 Popup 与本地数据／深色主题；原有两张明暗主题截图保留。

本次图片使用 1.5.1 生产界面、模拟浏览器 API 和示例数据制作，并非 Firefox 原生窗口实拍。图片尺寸为 1600 × 1000，不包含真实浏览记录。制作文件、完整中英文文案和公开页面存档保存在本地忽略目录 `artifacts/requirements/amo-151/`，不提交到 Git。后续素材继续使用当前发布版本，保留最新 Logo 与平台快捷键；`doc/images/` 中的旧图仅作为构图参考。

## 产品描述

名称：NextTab

简体中文简述：一个搜索框找标签、书签和历史；从最近使用记录继续工作，在工具栏快速切换同站点页面。核心数据留在本地，无广告、无分析追踪。

English summary: Find tabs, bookmarks and history in one search. Return to recent work and switch pages from a keyboard-friendly popup. Local-first, no ads or analytics.

AMO 中英文详细介绍已更新，按“能做什么”“为什么选择”“本地数据与可选联网功能”说明统一搜索、回到页面、站点详情、Popup、键盘操作和个性化。MQTT 默认关闭，只用于提醒，不用于同步浏览记录或设置；频道密钥不是端到端加密。

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

## Firefox 配置与发布状态

- 固定 ID：`nexttab@n0i0c0k.github.io`。2026-10-24 已与 AMO 后台实际 UUID 核对，和源码、生产 manifest 一致；后续更新沿用此 ID。
- 桌面最低版本：Firefox 140.0，以使用内置的可选数据授权。
- 1.5.1 已移除 `gecko_android` 声明，仅面向桌面 Firefox；Android 不支持当前首页使用的 `chrome_url_overrides.newtab`。此前提交的 1.5.0 仍含 Android 声明，已用匹配的 1.5.1 发布包与源码更新 AMO。
- 必需数据类型：`none`；可选类型：`authenticationInfo`、`personallyIdentifyingInfo`、`technicalAndInteraction`，对应 MQTT 频道密钥、显示名称和消息元数据。核心搜索与推荐不依赖这些可选权限。
- 构建方法：Node.js 24.22.1+（使用 `.nvmrc` 固定版本）、pnpm 9.9，`pnpm install --frozen-lockfile` 后执行 `pnpm build:firefox`。PNG 与字标已包含在源码中，构建无需运行图标生成器或安装 Chromium。
- 上传前用 `pnpm exec web-ext lint --source-dir .output/firefox-mv3` 校验包，再在 Firefox 140+ 中核对新标签页、Popup、明暗主题及 MQTT 授权／撤销。

2026-10-24 实际核查：1.5.0 已于 10 月 15 日通过审核。现已提交 1.5.1 生产包、匹配源码、更新说明与审核构建说明；AMO 后台显示“已通过审核”，[公开页面](https://addons.mozilla.org/zh-CN/firefox/addon/nexttab1/) 已显示版本 1.5.1、新介绍和五张新增截图。AMO 版本记录 ID 为 `6616671`，对应源码提交为 `4ac68a522c00f482eba6f25132f815ededeb5576`。本地 ZIP 为未签名原始包，公开 XPI 由 AMO 签名分发。

提交文件的 SHA-256：

- `.output/nexttab-1.5.1-firefox.zip`：`024ae11e0ad8e60a02cd1a4793f6f7f979d3dffe5d95d22ebbba56c7c4241f9d`。
- `.output/nexttab-1.5.1-sources.zip`：`57c66b281b8ba4bb2b9f10a43e607325246fbda32c04a2ff718fd1d49d9f670b`。

本次未进行原生 Firefox 的 MQTT 授权／撤销人工测试；AMO 上架状态不替代该项验证。

依据：[Firefox 扩展 ID](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/browser_specific_settings)、[内置数据授权](https://extensionworkshop.com/documentation/develop/firefox-builtin-data-consent/)、[Android 兼容声明与 AMO 控制](https://extensionworkshop.com/documentation/publish/version-compatibility/)。

## AMO 审核说明 / Reviewer notes

The source ZIP includes the pnpm lockfile and build instructions. No remote code is loaded and the default MV3 content security policy is used without `unsafe-eval`.

For 1.5.1, `web-ext lint` reports 0 errors, 0 notices and 9 warnings. Eight warnings come from bundled dependencies:

- `innerHTML`: React DOM's renderer and Base UI's DOM mirroring. Application code does not use `dangerouslySetInnerHTML` for page titles, URLs or MQTT messages.
- `Function`: expr-eval's unused `toJSFunction` method, lodash's global-object fallback, and MQTT dependency polyfills for generator runtime/function binding. The calculator uses `Parser.evaluate` to interpret expressions. Modern browser globals and native function binding bypass the fallback branches.
- `eval`: an intrinsic reference in an MQTT dependency; it is not an evaluation of downloaded code.

The remaining warning checks `gecko.data_collection_permissions` against Android 140 (inherited from the desktop minimum). Data consent is supported on desktop Firefox 140; this release intentionally omits `gecko_android` because Android does not support the new-tab override. The warning does not represent an Android support claim, and Android compatibility should not be added to suppress it.

These are static warnings, not an AMO approval. Reviewers can inspect the corresponding locked dependencies in the source build. The package does not enable dynamic evaluation to bypass extension CSP.
