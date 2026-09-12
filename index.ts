/*
 * Media Library Plugin Entry Point
 *
 * Cordis plugin providing media upload, browsing, deletion, and file serving.
 *
 * Authors:
 * MoyuZJ <moyuzj@moyuzj.cn> @LinearTeam - Made in China with ♥
 *
 * Copyright (C) 2026 Evarentha
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

/**
 * Entry point of the media-library plugin.
 *
 * <p>Registers the media_library schema and the admin page, then exposes a JSON API
 * (paginated listing with kind filter, multipart upload up to 256MB, and delete with
 * path-safe file removal) plus the /media-library/files/... static file route. Only common
 * image / audio / video formats are accepted; SVG is rejected because it can embed scripts
 * and cause stored XSS under same-origin hosting.</p>
 *
 * @since 1.0.0
 */

import fs from 'fs-extra';
import path from 'node:path';
import crypto from 'node:crypto';
import { Context } from 'cordis';
import type { Request, RequestHandler, Response } from 'express';
import { checkPermission, requireAuth } from '../../services/permission.service.js';
import type { DatabaseService } from '../../types/services.js';

const PLUGIN_ID = 'media-library';
const UPLOAD_ROOT = path.join(process.cwd(), 'uploads');
const MEDIA_PATH = '/media-library/files';
const MAX_UPLOAD = 256 * 1024 * 1024;
const EXTENSIONS: Record<string, Set<string>> = {
  // 不允许 .svg：SVG 可内嵌脚本，同源托管会造成存储型 XSS。
  image: new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.avif', '.bmp', '.ico']),
  video: new Set(['.mp4', '.webm', '.mov', '.m4v', '.ogv', '.avi', '.mkv']),
  audio: new Set(['.mp3', '.wav', '.ogg', '.oga', '.m4a', '.aac', '.flac', '.opus'])
};
const MIME_PREFIX: Record<string, string> = { image: 'image/', video: 'video/', audio: 'audio/' };

type MediaKind = 'image' | 'video' | 'audio';
interface MediaRow { id: string; kind: MediaKind; original_name: string; filename: string; url: string; mime_type: string; size: number; created_at: string; }
interface UploadPart { filename: string; mimeType: string; data: Buffer; }

function database(context: Context): DatabaseService { return context.databaseService as unknown as DatabaseService; }
function messageOf(error: unknown): string { return error instanceof Error ? error.message : '操作失败'; }
function json(res: Response, status: number, payload: unknown): void { res.status(status).json(payload); }
/** JSON API 处理器包装：失败时返回 { ok:false }（与 Base JSON 约定一致）。 */
const wrapJson = (fn: (req: Request, res: Response) => Promise<unknown> | unknown): RequestHandler => (req, res) => {
  void Promise.resolve(fn(req, res)).catch((error) => json(res, 500, { ok: false, message: messageOf(error) }));
};
function param(value: string | string[]): string { return Array.isArray(value) ? value[0] ?? '' : value; }
function mediaKind(value: unknown): MediaKind | undefined { return value === 'image' || value === 'video' || value === 'audio' ? value : undefined; }
function safeName(value: string): string { return path.basename(value).replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 160) || 'upload'; }
function extensionFor(filename: string, mimeType: string): string { return path.extname(filename).toLowerCase() || ({ 'image/jpeg': '.jpg', 'image/png': '.png', 'image/gif': '.gif', 'video/mp4': '.mp4', 'audio/mpeg': '.mp3' } as Record<string, string>)[mimeType] || ''; }
function inferKind(filename: string, mimeType: string): MediaKind | undefined {
  const ext = extensionFor(filename, mimeType);
  return (Object.keys(EXTENSIONS) as MediaKind[]).find((kind) => EXTENSIONS[kind].has(ext) && mimeType.startsWith(MIME_PREFIX[kind]));
}
function dateParts(now = new Date()): { year: string; month: string; day: string; stamp: string } {
  const pad = (value: number, size = 2) => String(value).padStart(size, '0');
  return { year: String(now.getFullYear()), month: pad(now.getMonth() + 1), day: pad(now.getDate()), stamp: `upload-${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}.${pad(now.getMilliseconds(), 3)}` };
}

async function readBody(req: Request): Promise<Buffer> {
  let size = 0; const chunks: Buffer[] = [];
  for await (const chunk of req) { const part = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk); size += part.length; if (size > MAX_UPLOAD) throw new Error('文件不能超过 256MB'); chunks.push(part); }
  return Buffer.concat(chunks);
}
function parseMultipart(body: Buffer, contentType: string): UploadPart {
  const boundaryMatch = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i);
  if (!boundaryMatch) throw new Error('上传请求缺少 multipart boundary');
  const boundary = Buffer.from(`--${boundaryMatch[1] || boundaryMatch[2]}`);
  let cursor = body.indexOf(boundary); let found: UploadPart | undefined;
  while (cursor !== -1) {
    const start = cursor + boundary.length;
    const next = body.indexOf(boundary, start);
    if (next === -1) break;
    const part = body.subarray(start, next);
    const headerEnd = part.indexOf(Buffer.from('\r\n\r\n'));
    if (headerEnd !== -1) {
      const headers = part.subarray(0, headerEnd).toString('utf8');
      const content = part.subarray(headerEnd + 4, part.length - 2);
      const disposition = headers.match(/content-disposition:[^\r\n]*name="[^"]+"[^\r\n]*filename="([^"]*)"/i);
      const type = headers.match(/content-type:\s*([^\r\n]+)/i)?.[1]?.trim() || 'application/octet-stream';
      if (disposition?.[1]) found = { filename: disposition[1], mimeType: type, data: content };
    }
    cursor = next;
  }
  if (!found || !found.data.length) throw new Error('请选择一个文件');
  return found;
}

const upload = wrapJson(async (req: Request, res: Response) => {
  const part = parseMultipart(await readBody(req), String(req.headers['content-type'] || ''));
  const kind = inferKind(part.filename, part.mimeType);
  if (!kind) return json(res, 400, { ok: false, message: '仅支持常见的图片、音频或视频格式' });
  const ext = extensionFor(part.filename, part.mimeType);
  const now = new Date(); const date = dateParts(now);
  const folder = path.join(UPLOAD_ROOT, `${kind}s`, date.year, date.month, date.day);
  await fs.ensureDir(folder);
  let stamp = date.stamp; let filePath = path.join(folder, `${stamp}${ext}`);
  while (await fs.pathExists(filePath)) { now.setMilliseconds(now.getMilliseconds() + 1); stamp = dateParts(now).stamp; filePath = path.join(folder, `${stamp}${ext}`); }
  await fs.writeFile(filePath, part.data, { flag: 'wx' });
  const url = `${MEDIA_PATH}/${kind}s/${date.year}/${date.month}/${date.day}/${stamp}${ext}`;
  const item: MediaRow = { id: crypto.randomUUID(), kind, original_name: safeName(part.filename), filename: `${stamp}${ext}`, url, mime_type: part.mimeType, size: part.data.length, created_at: new Date().toISOString() };
  await database((req as Request & { mediaContext?: Context }).mediaContext!).run('INSERT INTO media_library(id,kind,original_name,filename,url,mime_type,size,created_at) VALUES(?,?,?,?,?,?,?,?)', item.id, item.kind, item.original_name, item.filename, item.url, item.mime_type, item.size, item.created_at);
  json(res, 201, { ok: true, item });
});

export default async function mediaLibrary(context: Context) {
  const db = database(context);
  const { web } = context.linearpress;
  await db.exec(`CREATE TABLE IF NOT EXISTS media_library (id VARCHAR(64) PRIMARY KEY, kind VARCHAR(16) NOT NULL, original_name VARCHAR(255) NOT NULL, filename VARCHAR(255) NOT NULL, url VARCHAR(1024) NOT NULL, mime_type VARCHAR(150) NOT NULL, size BIGINT NOT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`);
  await fs.ensureDir(UPLOAD_ROOT);
  const withContext = (handler: RequestHandler): RequestHandler => (req, res, next) => { (req as Request & { mediaContext?: typeof context }).mediaContext = context; return handler(req, res, next); };
  const dbService = () => database(context);
  const admin = [requireAuth, checkPermission('media:upload')];
  context.linearpress.hooks.on('admin:menu', (menu) => [...menu, { title: '媒体库', link: '/admin/media-library' }]);
  web.register('get', '/admin/media-library', requireAuth, checkPermission('media:upload'), async (_req, res) => res.render('admin/media-library', { title: '媒体库' }));
  web.register('get', '/api/media-library', requireAuth, checkPermission('media:upload'), async (req, res) => {
    const requestedKind = Array.isArray(req.query.kind) ? req.query.kind[0] : req.query.kind;
    const kind = mediaKind(requestedKind); const page = Math.max(1, Number(req.query.page) || 1); const limit = 60; const where = kind ? ' WHERE kind=?' : ''; const params = kind ? [kind] : [];
    const items = await dbService().all<MediaRow>(`SELECT id,kind,original_name,filename,url,mime_type,size,created_at FROM media_library${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`, ...params, limit, (page - 1) * limit);
    const total = await dbService().get<{ count: number }>(`SELECT COUNT(*) AS count FROM media_library${where}`, ...params);
    res.json({ ok: true, items, total: Number(total?.count || 0), page, limit });
  });
  web.register('post', '/api/media-library/upload', ...admin, withContext(upload));
  web.register('post', '/api/media-library/:id/delete', requireAuth, checkPermission('media:delete'), async (req, res) => {
    const item = await dbService().get<MediaRow>('SELECT * FROM media_library WHERE id=?', param(req.params.id));
    if (!item) return json(res, 404, { ok: false, message: '媒体不存在' });
    const relative = item.url.replace(`${MEDIA_PATH}/`, ''); const filePath = path.resolve(UPLOAD_ROOT, relative);
    if (!filePath.startsWith(path.resolve(UPLOAD_ROOT) + path.sep)) return json(res, 400, { ok: false, message: '文件路径非法' });
    await fs.remove(filePath); await dbService().run('DELETE FROM media_library WHERE id=?', item.id); res.json({ ok: true });
  });
  web.register('get', '/media-library/files/:kind/:year/:month/:day/:filename', async (req, res) => {
    const kind = mediaKind(`${param(req.params.kind).replace(/s$/, '')}`); const segments = [kind && `${kind}s`, param(req.params.year), param(req.params.month), param(req.params.day), param(req.params.filename)];
    if (!kind || segments.some((value) => !value || value.includes('..') || value.includes('/') || value.includes('\\'))) return res.status(404).end();
    const filePath = path.join(UPLOAD_ROOT, ...segments as string[]); res.sendFile(filePath, (error) => { if (!error || res.headersSent) return; const status = (error as Error & { statusCode?: number }).statusCode; res.status(status || 404).end(); });
  });
  context.logger.info('activated');
}
