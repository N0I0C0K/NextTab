# 更新日志 / Changelog

## Unreleased / 未发布

### 简体中文

- 搜索结果打开失败时保留查询和选择以便重试；标签搜索支持标题与网址多词匹配，书签和历史预览新增分页入口，历史明确限定为最近最多 1,000 条匹配。继续查看入口直接位于分组标题旁，适用结果显示 Ctrl／⌘+Enter 新开提示；同名同地址标签补充窗口和位置以便区分。

<!-- 未发布草稿：同一功能持续更新已有条目。发版前核对实际发布范围、合并去重并整理中英文说明，再移入带版本号和日期的章节。 -->

### English

- Keep search and selection when opening a result fails; search tabs by title and URL, and browse beyond bookmark/history previews with pagination and an explicit 1,000-match history limit. Continuation is visible beside group headings, applicable results show the Ctrl/⌘+Enter hint, and identical tabs include window/position cues.

<!-- Working draft: update existing entries as a feature evolves. Before releasing, reconcile the shipping scope, merge duplicates, and edit matching Chinese and English notes, then move them to a dated version section. -->

## 1.5.1

### 简体中文

- 完善 Popup 同站点页面切换、搜索、键盘帮助和自适应预览，支持 Alt/Option + 1、2 进入完整列表。
- 新增常用网站搜索、自定义搜索引擎和站点详情分组，优化首页时钟及保存入口。
- 将构建环境统一到 Node.js 24.22.1+。
- 移除 Android 兼容声明；Firefox Android 不支持当前首页使用的新标签页覆盖接口，此轮仅发布桌面 Firefox 140+。
- 修复 MQTT 更换服务与频道后向新服务发送旧频道主题的问题；新客户端保留提醒主题定义，但不继承旧会话的订阅状态，旧订阅确认晚到也不会污染新会话。

### English

- Improved popup contextual navigation, search, keyboard help, and adaptive previews, with Alt/Option + 1 and 2 opening full lists.
- Added saved-site search, custom search engines, and grouped site details; improved the homepage clock and save actions.
- Standardized builds on Node.js 24.22.1+.
- Removed the Android compatibility declaration because Firefox for Android does not support the new-tab override used by NextTab. This release targets desktop Firefox 140+.
- Prevented old MQTT channel topics from being sent to a replacement broker. New clients retain reminder topic definitions without inheriting prior subscription state, including late acknowledgements from an old client.

## 1.5.0

### 简体中文

- 重设计新标签页和 Popup，以更简洁的明暗界面展示搜索、回到页面和常用网站。
- 新增「回到页面」：按最近 7 天的前台使用推荐最近回访，按最近 30 天的历史访问天数展示最近常用，按本地进入事件展示最近访问。
- 支持查看页面使用详情、切换已打开的标签页、隐藏推荐和屏蔽网站。
- 快捷链接支持原始顺序与字母排序；站点展开后集中查看打开的标签、保存的页面和最近访问记录。
- 命令面板新增命令快捷键，并统一触发键设置；完善历史搜索、键盘操作和窄窗口布局。
- 根据平台显示快捷键：macOS 使用 ⌘，Windows/Linux 使用 Ctrl；首页和引导页保持正确的平台快捷键。
- 统一新标签页、Popup、工具栏、扩展管理页、通知和文档的 Logo，采用倾斜的粗边圆角方框。
- 迁移到 WXT 构建，提供 Chrome/Edge 与 Firefox MV3 发布包；补充自动化测试和发布版本校验。
- 准备 Firefox 140+ 首次上架：固定扩展 ID，声明 MQTT 可选数据权限，授权前不连接，撤销授权后断开。

### English

- Redesigned NewTab and the popup with a simpler light/dark interface for search, returning to pages, and quick links.
- Added Return to a Page: recent revisits based on seven days of foreground use, frequent pages based on 30 days of history, and recent visits from local foreground events.
- Added page usage details, switching to open tabs, hidden recommendations, and excluded websites.
- Added original/alphabetical quick-link sorting and site panels containing open tabs, saved pages, and recent visits.
- Added command shortcuts and unified trigger-key settings; improved history search, keyboard navigation, and narrow-window layouts.
- Made shortcut hints platform-specific: ⌘ on macOS and Ctrl on Windows/Linux, with matching homepage and onboarding shortcuts.
- Unified the Logo across NewTab, popup, toolbar, extension management, notifications, and documentation using the tilted rounded-square outline.
- Migrated builds to WXT with Chrome/Edge and Firefox MV3 packages, automated tests, and release-version validation.
- Prepared the first Firefox 140+ submission with a stable extension ID and optional MQTT data consent; connections require authorization and stop when it is revoked.
