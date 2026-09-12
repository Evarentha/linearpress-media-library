# Media Library

[![LinearPress](https://img.shields.io/badge/LinearPress-plugin-7C3AED.svg)](https://www.npmjs.com/package/@evarentha/linearpress) [![npm](https://img.shields.io/npm/v/@evarentha/linearpress-media-library.svg)](https://www.npmjs.com/package/@evarentha/linearpress-media-library) [![Node.js](https://img.shields.io/badge/node-%3E%3D22-green.svg)](https://nodejs.org) [![TypeScript](https://img.shields.io/badge/TypeScript-strict-blue.svg)](https://www.typescriptlang.org) [![License: GPL-3.0-or-later](https://img.shields.io/badge/License-GPL--3.0--or--later-blue.svg)](LICENSE)

**English** | [简体中文](README.zh-CN.md)

A WordPress-style media library for LinearPress. Upload images, audio, and video, browse them by kind, delete what you no longer need, and insert files into either editor. Neither editor was changed to make this work: a MutationObserver injects the picker buttons, and blocks are appended through the editors' public APIs.

Users need `media:upload` to open the library or upload, `media:delete` to remove items; both are granted per group in the admin console.

## Install

```bash
git clone https://github.com/Evarentha/linearpress-media-library.git src/plugins/media-library
```

The directory name must equal the plugin id. Restart afterwards, or sync from the `base` checkout (`sh scripts/sync-plugins.sh media-library`), or upload the ZIP / npm name from the admin Plugins page. The admin menu then shows "媒体库", pointing at `/admin/media-library`. There is no settings page: the plugin works as installed.

## Uploads and storage

Files are capped at 256 MB each, and every upload passes a whitelist where the extension and the MIME type must agree on the same kind: images (jpg, jpeg, png, gif, webp, avif, bmp, ico), video (mp4, webm, mov, m4v, ogv, avi, mkv), audio (mp3, wav, ogg, oga, m4a, aac, flac, opus). SVG is rejected on purpose: an SVG can embed scripts, and hosting it same-origin would turn an upload into stored XSS.

Files land under `uploads/<kind>s/YYYY/MM/DD/`, for example `uploads/images/2026/08/23/upload-14-05-09.027.jpg`. Name collisions are avoided by bumping the timestamp, and the write uses the `wx` flag so an existing file is never silently overwritten. Records sit in the `media_library` table, created and queried through the database service with plain SQL, so when mysql-plugin drives the site, the table is created there and every query runs against MySQL, with no change on this side.

Deleting an item removes the file and its record together. Public serving goes through `GET /media-library/files/:kind/:year/:month/:day/:filename`, where any path segment containing `..`, `/`, or `\` is rejected with a 404, closing the path-traversal route.

## Using it

The admin page offers kind tabs (all, image, video, audio) and pagination at 60 items per page with prev/next controls, in the page itself and in the picker modal alike, and you can upload from inside the modal without leaving the editor.

In the editors, picker buttons appear inside the built-in editor's `.lp-block-image` / `-audio` / `-video` blocks and modern-editor's `.modern-block-*` equivalents, filling the media address from the library. Toolbar buttons append a matching media block through `window.LinearPressModernEditor || window.LinearPressEditor`.

Other scripts can do the same: `window.LinearPressMediaLibrary.open({ kind, onSelect })` opens the picker modal, and `.upload(file)` sends a file and returns the new item. The JSON API (session required) covers `GET /api/media-library?kind=&page=` returning `{ items, total, page, limit }` at 60 per page, `POST /api/media-library/upload` (multipart), and `POST /api/media-library/:id/delete`.

## License

GPL-3.0-or-later, Copyright (C) 2026 Evarentha. See LICENSE.
