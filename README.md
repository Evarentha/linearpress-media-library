<!--
  Author: MoyuZJ
  Team: LinearTeam
  Contact: linearteam@foxmail.com
  Made by MoyuZJ in China with ♥
-->

# 媒体库（media-library）

LinearPress 的 **WordPress 风格后台媒体库**，支持图片、音频和视频：上传、浏览、插入编辑器区块，
文件本体存放在站点 `uploads/` 目录，元数据跟随业务数据库保存。

> 本仓库是 LinearPress 插件 **media-library** 的独立开发仓库。插件即 Cordis 插件函数，即插即用、可停用可卸载。

## 插件化的优势

- **编辑器两侧兼容**：同时适配 Base 原版编辑器（`window.LinearPressEditor`）与现代编辑器（`window.LinearPressModernEditor`），不用改编辑器代码。
- **存储中立**：文件在 `uploads/`，元数据在 `media_library` 表——启用 `mysql-plugin` 后媒体记录自动跟随 MySQL 业务库；换数据库不带迁移成本。
- **即装即用**：放入 `src/plugins/` 或 ZIP 安装，重启后后台出现「媒体库」；停用只影响入口，不触碰已上传文件。

## 功能

- WordPress 风格媒体库：图片、音频、视频网格/列表管理
- 编辑器兼容：媒体区块中的「媒体库」按钮替换地址；工具栏「媒体库」按钮选取并插入媒体区块；弹窗内可直接上传
- 权限：`media:upload`（查看/上传）、`media:delete`（删除记录及文件），可在「权限组」按组授权
- 限制：单文件最大 256MB；常见格式（JPG/PNG/GIF/WebP/SVG/AVIF/MP4/WebM/MOV/OGG/MP3/WAV/M4A/AAC/FLAC/Opus 等）

## 文件存储

```text
uploads/<images|videos|audios>/yyyy/MM/dd/upload-HH-mm-ss.ms.<extension>
```

例如 `uploads/images/2026/08/23/upload-14-05-09.027.jpg`。

## 安装

```bash
cp -r Plugins/media-library base/src/plugins/media-library   # 工作区方式
# 或
git clone <本仓库地址> base/src/plugins/media-library        # 拉取方式（目录名必须等于插件 id）
```

重启 LinearPress，后台导航出现「媒体库」；也可压缩为 ZIP 用插件管理页安装。

## 本地开发：怎么拉 / 怎么改 / 怎么跑

```bash
git clone <本仓库地址> LinearPress/Plugins/media-library
cd LinearPress/base
npm install && npm run db:init
sh scripts/sync-plugins.sh media-library
npm run dev
```

## 目录结构

```text
media-library/
├── plugin.json            # Manifest（permissions: media:upload / media:delete）
├── index.ts               # 入口：媒体库路由、上传/删除、编辑器按钮注入
├── views/admin/           # 媒体库页面模板
├── public/                # 前端脚本与样式（编辑器按钮、弹窗）
└── uploads/               # 站点运行目录（非仓库内容）
```

## 贡献与发布

- conventional commits；提交前 `cd base && npm run typecheck`
- 版本：`git tag v1.0.0 && git push --tags`
- License：MIT（见仓库 LICENSE）