<div align="center">

<h1>NextTab</h1>
<p>An efficiency-focused browser start page, clean and modern</p>

[![](https://img.shields.io/badge/React-61DAFB?style=flat-square&logo=react&logoColor=black)](https://react.dev/)
[![](https://img.shields.io/badge/Typescript-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![](https://badges.aleen42.com/src/vitejs.svg)](https://vitejs.dev/)
[![GitHub License](https://img.shields.io/github/license/N0I0C0K/NextTab?style=flat-square)](https://github.com/N0I0C0K/NextTab/blob/main/LICENSE)
[![GitHub Release](https://img.shields.io/github/v/release/N0I0C0K/NextTab?style=flat-square)](https://github.com/N0I0C0K/NextTab/releases)

English | [简体中文](README.md)

</div>

---

## 📖 Table of Contents

- [Introduction](#introduction)
- [Key Features](#-key-features)
- [Feature Showcase](#-feature-showcase)
  - [Quick Links](#quick-links)
  - [Command Palette](#command-palette)
- [Installation](#installation)
- [Development](#development)
- [Browser Support](#browser-support)
- [License](#license)

## Introduction

NextTab is a new tab page extension focused on boosting browser efficiency with a clean and modern design. Find and access your target websites faster, and focus on what truly matters.

![Main Screenshot](doc/images/main-screenshot.png)

## ✨ Key Features

- 🔗 **Efficient Quick Links** - Fast access to frequently used websites with drag-and-drop sorting and a context menu for quick actions
- 🎨 **Personalized Backgrounds** - Custom wallpapers with integrated [Wallhaven](https://wallhaven.cc/) high-quality wallpapers by default
- ⚡ **Powerful Command Palette** - Quick search for tabs, bookmarks, history, and more (continuously being developed)
- ⌨️ **Keyboard First** - Comprehensive keyboard shortcut support for efficient operation
- 📱 **Responsive Design** - Adapts to various screen sizes for a consistent experience
- 🔒 **Privacy Focused** - Runs locally, no user data collection
- 🌐 **Cross-Device Sync** - Sync data across multiple devices via MQTT protocol (optional)

## 📸 Feature Showcase

### Quick Links

Access frequently used websites with one click, easily reorder by dragging:

![Drag and Drop Demo](doc/images/drag-and-drop-demo.gif)

#### Smart Context Menu

Right-click on quick links to quickly access related tabs, bookmarks, and history:

![Context Menu](doc/images/context-menu.png)

#### Quick View Recent History

View recent visit history for a domain directly from the context menu, making it easy to return to previously browsed pages:

![Quick History](doc/images/quick-history-demo.gif)

### Command Palette

Press `Cmd/Ctrl + K` to open the command palette for quick search and actions:

![Command Palette](doc/images/command-palette.png)

**History Search Feature**

![History Search](doc/images/history-search-demo.gif)

### Popup Interface
![Popup Interface](doc/images/popup.jpg)

- Quickly access quick links without going to the New Tab page
- One-click to add the current page to quick links

## Installation

### Install from Store

[Chrome Web Store](https://chromewebstore.google.com/detail/nbeegkbcmmchnnncomjhhmljncmcclfd?utm_source=item-share-cb)

<!-- - [Firefox Add-ons](#) -->

### Manual Installation (Development Build)

Please refer to the [Development Guide](DEVELOPMENT.en.md#quick-start) for instructions on building and installing from source.

## Development

If you want to contribute to development or customize the extension, please see the [Development Guide](DEVELOPMENT.en.md).

The development guide includes:
- Environment setup
- Detailed project structure
- Development workflow
- Code standards
- Build and testing

### Quick Start

```bash
# Clone the project
git clone https://github.com/N0I0C0K/NextTab.git
cd NextTab

# Install dependencies
pnpm install

# Start development mode
pnpm dev
```

For more details, please refer to [DEVELOPMENT.en.md](DEVELOPMENT.en.md).

## Browser Support

- ✅ Chrome/Edge (Recommended)
- ✅ Firefox
- ⚠️ Other Chromium-based browsers (Untested)

## License

This project is licensed under the [MIT License](LICENSE).

---

<div align="center">
  
**If you find this helpful, please give it a ⭐️ Star!**

Made with ❤️ by [N0I0C0K](https://github.com/N0I0C0K). Powered by [chrome-extension-boilerplate-react-vite](https://github.com/Jonghakseo/chrome-extension-boilerplate-react-vite)

</div>
