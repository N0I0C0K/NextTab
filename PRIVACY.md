# NextTab 隐私说明 / Privacy notice

适用版本：1.5.0 · 更新日期：2026-10-11

## 简体中文

NextTab 的历史访问、标签页、书签、前台使用记录、推荐偏好、快捷链接和设置用于在当前浏览器内提供搜索与推荐。前台日志保留近 10 天，最多 2 MiB。扩展不上传这些浏览记录，不包含分析埋点或广告追踪。

联网功能由用户选择：

- 搜索网页或打开链接时，浏览器访问用户选择的网站或搜索引擎。
- 授予 GitHub API 访问权限后，「关于」页面向 `api.github.com` 查询本项目最新 Release。请求不会附带历史、书签、标签列表或使用日志。
- MQTT 默认关闭。授权并连接后，所选 MQTT 服务及同频道设备会收到显示名称、作为主题前缀的频道密钥、消息 ID、时间戳、连接心跳和喝水提醒。默认服务是 EMQX 公共 MQTT 服务；它可看到频道及消息内容，频道密钥不提供端到端加密。当前版本不通过 MQTT 同步快捷链接、历史或设置。

Firefox 中，MQTT 的身份／认证信息和技术／交互数据需要另行授予可选数据权限；拒绝不影响本地功能，撤销后扩展断开连接。用户可以关闭 MQTT 或取消相关权限，关闭首页「回到页面」停止新增前台使用记录。卸载会移除扩展的本地存储；浏览器自身的历史与书签不因此删除。

导出文件保存在用户选择的本地位置，可能包含 MQTT 频道密钥和显示名称；扩展不会自动上传该文件。用户自行分享时应先移除不想分享的信息。

问题反馈：[NextTab GitHub Issues](https://github.com/N0I0C0K/NextTab/issues)。

## English

Version 1.5.0 · Updated 2026-10-11

NextTab uses history, tabs, bookmarks, foreground events, preferences, quick links, and settings locally for search and recommendations. Foreground logs retain ten days, up to 2 MiB. These browsing records are not uploaded. The extension contains no analytics or advertising trackers.

Network features are user-selected:

- Web search and links open the selected websites or search engines in the browser.
- After GitHub host authorization, About requests this project's latest release from `api.github.com`, without attaching browsing records.
- MQTT is off by default. Once authorized and connected, the selected broker and devices in the same channel receive the display name, channel key as a topic prefix, message IDs, timestamps, heartbeats, and drink-water reminders. The default broker is EMQX's public service and can read topics and messages. The channel key does not provide end-to-end encryption. This version does not sync quick links, history, or settings over MQTT.

Firefox requires optional identity/authentication and technical/interaction data consent for MQTT. Declining leaves local features available; revoking disconnects it. Users can disable MQTT or revoke permissions, and disable Return to a Page to stop recording new foreground events. Uninstalling removes extension storage, leaving browser history and bookmarks intact.

Local export files may contain the channel key and display name. NextTab does not upload them automatically; remove private information before sharing.

Contact: [NextTab GitHub Issues](https://github.com/N0I0C0K/NextTab/issues).
