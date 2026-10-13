# 更新日志 / Changelog

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
