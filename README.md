# LinearPress 媒体库插件

`media-library` 提供 WordPress 风格的后台媒体库，支持图片、音频和视频。

## 安装

将本目录复制到宿主站点：

```bash
cp -r Plugins/media-library base/src/plugins/media-library
```

然后重启 LinearPress，后台导航会出现「媒体库」。插件也可以压缩为 ZIP 后通过插件管理页安装。


## Cordis 运行时

插件使用 `runtime: "cordis"` 和默认导出入口。数据库服务从 `ctx.databaseService` 获取，Express 路由通过 `ctx.linearpress.web` 注册，Fiber 销毁时会清理插件资源。

文件本体保存在站点工作目录下：

```text
uploads/<images|videos|audios>/yyyy/MM/dd/upload-HH-mm-ss.ms.<extension>
```

例如：

```text
uploads/images/2026/08/23/upload-14-05-09.027.jpg
```

媒体元数据保存在 `media_library` 表中，插件通过 `ctx.databaseService` 的 SQL 接口访问数据库。因此启用 `linearpress-mysql-plugin` 后，媒体记录会跟随 MySQL 业务数据库保存；文件本体仍保存在站点的 `uploads` 目录。

## 编辑器兼容

插件脚本会兼容：

- Base 原版编辑器的 `window.LinearPressEditor`
- `linearpress-modern-editor` 的 `window.LinearPressModernEditor`
- 原版和现代编辑器的 `image`、`audio`、`video` 区块

媒体区块中的「媒体库」按钮可以替换地址；编辑器工具栏中的「媒体库」按钮可以直接选取并插入一个媒体区块。弹窗内也可以上传新文件。

## 权限

Manifest 声明了：

- `media:upload`：访问媒体库、查看媒体和上传文件
- `media:delete`：删除媒体记录及对应文件

默认管理员拥有全部权限。需要让普通编辑用户使用媒体库时，请把上述权限分配给其权限组。

## 限制

单个文件最大 256MB。允许的扩展名包括常见的 JPG、PNG、GIF、WebP、SVG、AVIF、MP4、WebM、MOV、OGG、MP3、WAV、M4A、AAC、FLAC 和 Opus 等格式。
