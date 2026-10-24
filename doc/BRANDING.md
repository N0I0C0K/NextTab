# NextTab Logo

`public/icon.svg` 是图标导出的图形源文件：逆时针倾斜 12° 的粗边圆角方框。新标签页和 Popup 复用 `components/shared/custom/brand-mark.tsx` 中相同几何图形的内联 SVG，按各自尺寸等比缩放，颜色跟随当前主题。修改图形时同步两处定义，保留共享组件及现有布局。

扩展图标在同一图形外添加浅色圆角底和细边界，使它在明暗工具栏上都能辨认。`public/icon-128.png` 同时用于扩展安装、商店图标和通知。图标尺寸与格式遵循 [Chrome 扩展图标文档](https://developer.chrome.com/docs/extensions/reference/manifest/icons) 和 [工具栏图标文档](https://developer.chrome.com/docs/extensions/reference/api/action#icon)。

修改源文件后重新生成衍生资源：

```bash
pnpm exec playwright install chromium # 首次生成时安装浏览器
pnpm icons:generate
```

生成内容：

- `public/icon-{16,24,32,48,128,256,512}.png`：实际像素尺寸与文件名一致，直接从矢量渲染。
- `public/icon-256.svg`：带底色的图标矢量版。
- `public/images/logo_{horizontal,vertical}{,_dark}.svg`：横版、竖版以及供深色背景使用的浅色字标。

PNG 和字标提交到仓库，正常构建无需安装或启动 Chromium。不要单独编辑衍生资源。发布前检查 16px 和 32px 的空心区域、倾斜轮廓，以及明暗背景下的对比度。
