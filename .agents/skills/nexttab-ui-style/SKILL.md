---
name: nexttab-ui-style
description: Apply NextTab UI style and responsive layout conventions when editing dialogs, lists, cards, search, spacing, or visible component layouts in this repository. Use for crowded or clipped UI and desktop/narrow-window adaptation.
---

# NextTab UI 样式规范

保留本项目简洁、轻量的视觉方向。响应式不仅意味着不溢出，也意味着宽屏有足够的阅读空间、窄屏能看清主要信息。按实际内容决定尺寸和布局，避免为了塞下内容一味缩小字号或间距。

## 修改前定位

- 先检查组件、外层布局、弹窗根节点和共享组件的尺寸约束。修改内部宽度不能突破父容器的 max-width。
- 本项目的共享组件在 `components/shared/ui/`；排版组件在 `components/shared/custom/typography.tsx`；全局弹窗在 `entrypoints/newtab/components/global-dialog.tsx` 和对应 provider。
- `globalDialog.show` 的第 4 个参数作用于外层 `DialogContent`，弹窗尺寸应在这一层设置；内部内容用 `w-full min-w-0`。
- 共享组件的默认尺寸不能代表所有业务场景。给数据列表弹窗选择合适的宽度；确认框、短表单可以继续使用紧凑尺寸。

## 尺寸与信息层级

- 桌面数据列表通常可从 48–56rem 的最大宽度起步，按内容调整；保持居中，保留视口边距。不要把桌面列表默认压到约 384px。
- 小窗口用可用宽度并保留约 1rem 边距。优先调整布局，移走次要列；长标题应占主要宽度，时间、计数和操作不能把标题挤成几个字。
- 行布局可用 `grid-cols-[auto_minmax(0,1fr)_auto]`；窄屏改成两列，次要元数据移到正文列下方。断点应由内容能否舒适排下决定；组件可能放进狭窄容器时考虑容器查询。
- 长标题、URL 所在的 flex/grid 子项用 `min-w-0`。为有意截断的文字保留完整内容的查看途径，例如已有 tooltip 或 `title`；不要隐藏无法辨认的关键信息。
- 弹窗高度考虑短窗口及浏览器缩放后的有效视口，使用 `dvh` 和有边距的最大高度。避免固定 min-height 超过可用高度。
- 搜索、标题和必要操作保持可见，长列表在内部滚动。给可滚动的 flex 子项 `min-h-0`，避免整个弹窗溢出或产生两层滚动。

## 留白和视觉一致性

- 从现有间距体系选择值：内容分组可从 16–24px、弹窗内边距从 20–24px、列表行上下内边距从 12–14px 起步，再按信息密度调整。这些是起点，不是全局固定值。
- 保持标题、正文、URL、辅助信息的层级。复用 Text 和语义颜色，如 `bg-popover`、`bg-muted`、`text-foreground`、`text-muted-foreground`；同时检查浅色和深色主题。
- 尽量在业务组件设置布局，不为一个弹窗改变所有共享组件的默认外观。
- 避免宽泛后代选择器覆盖子组件的 display、尺寸或定位。尤其不要把滚动容器下所有 div 强制成 block；必要时定位到具体的 data-slot。

## 交互与验证

- 布局变化后保留搜索焦点、方向键选择、Enter 打开、Escape 关闭和现有修饰键行为。选中项应可辨认，并滚入可见区域。
- 针对改动查看代表性的桌面、窄屏和短窗口，例如 1440×1000、768×700、390×700、320×600、900×360；根据组件的实际使用环境缩减或补充。查看断点两侧，不能只测宽屏。
- 用长标题、长 URL、多条记录及较长的本地化时间/计数检查信息分配。必要时验证空结果、加载和错误状态。
- 布局修改要查看截图或浏览器实际渲染，检查拥挤、过早截断、对齐、边界、滚动区域和关闭按钮位置。测试通过不能替代视觉检查。
- 对会复发的布局问题，在现有 Playwright 测试中验证可见结果，如桌面阅读宽度、窄屏列位置、无横向溢出、短窗口内控制可达；避免只检查 class 字符串。仅文档或轻微留白修改不必新增测试。

## 与现有技能配合

项目已有 `web-design-guidelines` 可用于通用界面审查，`building-components` 可用于组件结构和可访问性交互。需要这些工作时再读取相应技能；本规范补充 NextTab 的布局约定，不要求每次样式修改都执行完整审查。
