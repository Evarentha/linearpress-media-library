# 媒体库（media-library）

[![LinearPress](https://img.shields.io/badge/LinearPress-plugin-7C3AED.svg)](https://www.npmjs.com/package/@evarentha/linearpress) [![npm](https://img.shields.io/npm/v/@evarentha/linearpress-media-library.svg)](https://www.npmjs.com/package/@evarentha/linearpress-media-library) [![Node.js](https://img.shields.io/badge/node-%3E%3D22-green.svg)](https://nodejs.org) [![TypeScript](https://img.shields.io/badge/TypeScript-strict-blue.svg)](https://www.typescriptlang.org) [![License: GPL-3.0-or-later](https://img.shields.io/badge/License-GPL--3.0--or--later-blue.svg)](LICENSE)

[English](README.md) | **简体中文**

为 LinearPress 提供 WordPress 风格的媒体库：上传图片、音频、视频，按类型浏览，删除不再需要的内容，并将文件插入任一编辑器。两个编辑器为此未修改任何代码：按钮由 MutationObserver 注入，块通过编辑器的公开 API 追加。

使用媒体库的用户需要 `media:upload` 权限（打开页面、上传），执行删除需要 `media:delete` 权限；均可在后台按权限组授予。

## 安装

```bash
git clone https://github.com/Evarentha/linearpress-media-library.git src/plugins/media-library
```

目录名必须与插件 id 一致，安装后需重启 LinearPress。也可以在 `base` 检出中执行 `sh scripts/sync-plugins.sh media-library`，或在后台插件页上传 ZIP、填写 npm 包名。安装后后台菜单出现「媒体库」，指向 `/admin/media-library`。本插件无设置页，安装即可用。

## 上传与存储

单个文件上限 256 MB，每次上传均通过白名单校验，扩展名与 MIME 类型必须指向同一类型：图片（jpg、jpeg、png、gif、webp、avif、bmp、ico），视频（mp4、webm、mov、m4v、ogv、avi、mkv），音频（mp3、wav、ogg、oga、m4a、aac、flac、opus）。SVG 被有意拒收：SVG 可内嵌脚本，同源托管等同于将上传转化为存储型 XSS。

文件存储于 `uploads/<kind>s/YYYY/MM/DD/`，例如 `uploads/images/2026/08/23/upload-14-05-09.027.jpg`。重名通过时间戳错开，写入采用 `wx` 标志，已存在的文件不会被静默覆盖。记录存储于 `media_library` 表，建表与查询均经由数据库服务执行普通 SQL，因此 mysql-plugin 接管站点后，该表及全部查询自动落于 MySQL，本插件无须任何修改。

删除操作同时清除文件与记录。对外服务经由 `GET /media-library/files/:kind/:year/:month/:day/:filename`，路径段中出现 `..`、`/`、`\` 一律返回 404，路径穿越由此封堵。

## 使用

管理页提供类型标签（全部 / 图片 / 视频 / 音频）与每页 60 条的分页，页面与选择弹窗均配备上一页 / 下一页控件，弹窗内亦可直接上传，无须离开编辑器。

在编辑器中，内置编辑器的 `.lp-block-image` / `-audio` / `-video` 块与 modern-editor 的 `.modern-block-*` 块内均会出现「媒体库」按钮，从媒体库选择文件并填入媒体地址；工具栏按钮则经 `window.LinearPressModernEditor || window.LinearPressEditor` 追加对应的媒体块。

其他脚本亦可调用相同接口：`window.LinearPressMediaLibrary.open({ kind, onSelect })` 打开选择弹窗，`.upload(file)` 上传文件并返回新条目。JSON API（需会话）包括 `GET /api/media-library?kind=&page=`（返回 `{ items, total, page, limit }`，每页 60 条）、`POST /api/media-library/upload`（multipart）、`POST /api/media-library/:id/delete`。

## 许可证

本项目以 GPL-3.0-or-later 许可发布，Copyright (C) 2026 Evarentha，完整文本见 [LICENSE](LICENSE)。
