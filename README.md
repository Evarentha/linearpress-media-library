<!--
  Author: MoyuZJ
  Team: LinearTeam
  Contact: linearteam@foxmail.com
  Made by MoyuZJ in China with ♥
-->

# 媒体库 · Media Library

A **WordPress-style admin media library** for LinearPress: images, audio and video. Upload, browse and insert as editor blocks; files live in `uploads/`, metadata follows the business database.

LinearPress 的 **WordPress 风格后台媒体库**：支持图片、音频和视频。上传、浏览、插入编辑器区块；文件本体在站点 `uploads/` 目录，元数据跟随业务数据库保存。

> Independent plugin repository for LinearPress **media-library**. A plugin is a Cordis plugin function — install on demand, disable/uninstall cleanly.
> 本仓库是 LinearPress 插件 **media-library** 的独立仓库。

## Why Plugins? / 插件化的优势

- **Compatible with both editors** —— works with the base editor（`window.LinearPressEditor`）and modern-editor（`window.LinearPressModernEditor`）without touching editor code.
  **编辑器两侧兼容**——同时适配原版与现代编辑器，不用改编辑器代码。
- **Neutral storage** —— files in `uploads/`, metadata in `media_library`; enabling `mysql-plugin` moves metadata to MySQL automatically — no migration cost.
  **存储中立**——文件在 `uploads/`、元数据在表中；换数据库不带迁移成本。
- **Install on demand** —— drop into `src/plugins/` or ZIP install, restart, and the media library appears.
  **即装即用**——放入 `src/plugins/` 或 ZIP 安装，重启即出现「媒体库」。

## Features / 功能

- WordPress-style grid/list library for images, audio & video
- Editor integration：replace media block URLs, insert media from toolbar, upload inside the dialog
- Permissions：`media:upload`（view/upload）、`media:delete`（delete record & file），assignable per group
- Limits：single file up to 256MB；common formats（JPG/PNG/GIF/WebP/SVG/AVIF/MP4/WebM/MOV/OGG/MP3/WAV/M4A/AAC/FLAC/Opus…）

## File Layout / 文件存储

```text
uploads/<images|videos|audios>/yyyy/MM/dd/upload-HH-mm-ss.ms.<extension>
```

e.g. / 例如 `uploads/images/2026/08/23/upload-14-05-09.027.jpg`.

## Install / 安装

```bash
cp -r Plugins/media-library base/src/plugins/media-library   # workspace / 工作区方式
# or / 或
git clone https://github.com/Evarentha/linearpress-media-library base/src/plugins/media-library
```

Restart，then「媒体库」appears in admin nav；or ZIP install. / 重启后后台出现「媒体库」；也可 ZIP 安装。

## Local Development / 本地开发：怎么拉 / 怎么改 / 怎么跑

```bash
git clone https://github.com/Evarentha/linearpress-media-library LinearPress/Plugins/media-library
cd LinearPress/base
npm install && npm run db:init
sh scripts/sync-plugins.sh media-library
npm run dev
```

## Directory / 目录结构

```text
media-library/
├── plugin.json            # Manifest（permissions: media:upload / media:delete）
├── index.ts               # entry：media routes, upload/delete, editor button injection
├── views/admin/           # media library page templates
└── public/                # front-end scripts & styles（editor buttons, dialog）
```

## Contribute & Release / 贡献与发布

- conventional commits；`cd base && npm run typecheck` before commit
- Version：`git tag v1.0.0 && git push --tags`
- License：MIT（LICENSE）