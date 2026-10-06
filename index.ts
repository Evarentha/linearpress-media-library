/*
 * Media Library Plugin Entry Point
 *
 * Cordis plugin providing media upload, browsing, deletion, and file serving.
 *
 * Authors:
 * MoyuZJ <moyuzj@moyuzj.cn> @LinearTeam - Made in China with ♥
 * worryzu <worryzu@gmail.com> @LinearTeam
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
class InvalidUpload extends Error {}
const wrapJson = (fn: (req: Request, res: Response) => Promise<unknown> | unknown): RequestHandler => (req, res) => {
  void Promise.resolve().then(() => fn(req, res)).catch((error) => {
    if (!res.headersSent && !res.destroyed) {
      // Do not leave an oversized/incomplete request draining forever after its error response.
      if (error instanceof InvalidUpload && !req.complete) {
        res.setHeader('Connection', 'close');
        res.once('finish', () => {
          if (!req.complete && !req.socket.destroyed) {
            req.socket.end(); // Flush the 400 before closing; an immediate destroy can discard it on Windows.
            const timer = setTimeout(() => req.socket.destroy(), 1000);
            timer.unref();
            req.socket.once('close', () => clearTimeout(timer));
          }
        });
      }
      json(res, error instanceof InvalidUpload ? 400 : 500, { ok: false, message: messageOf(error) });
    }
  });
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
  return new Promise((resolve, reject) => {
    let size = 0; let settled = false; const chunks: Buffer[] = [];
    const cleanup = () => { req.off('data', onData); req.off('end', onEnd); req.off('aborted', onAbort); };
    const cleanupAll = () => { cleanup(); req.off('error', onError); req.off('close', onClose); req.socket.off('close', onSocketClose); };
    const fail = (message: string) => {
      if (settled) return;
      settled = true; cleanup(); chunks.length = 0;
      // Drain oversized requests without destroying the socket: the client must receive JSON 400.
      if (!req.destroyed) req.resume();
      reject(new InvalidUpload(message));
    };
    const onData = (chunk: Buffer | string) => {
      const part = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      size += part.length;
      if (size > MAX_UPLOAD) return fail('文件不能超过 256MB');
      chunks.push(part);
    };
    const onEnd = () => {
      if (!req.complete) return fail('上传请求不完整');
      settled = true; cleanupAll(); resolve(Buffer.concat(chunks, size)); chunks.length = 0;
    };
    const onAbort = () => fail('上传请求已中断');
    const onError = () => fail('上传请求已中断');
    const onClose = () => { if (!settled) fail('上传请求不完整'); cleanupAll(); };
    const onSocketClose = () => { if (!settled) fail('上传连接已关闭'); cleanupAll(); };
    req.socket.once('close', onSocketClose);
    req.on('data', onData); req.once('end', onEnd); req.once('aborted', onAbort);
    // An aborted stream emits error before close. Consume it, then remove every listener on close.
    req.on('error', onError); req.once('close', onClose);
    if (req.aborted || req.destroyed) onClose();
    else if (Number(req.headers['content-length']) > MAX_UPLOAD) fail('文件不能超过 256MB');
  });
}
/** Parameter names are case-insensitive; quoted semicolons/escaped characters are not separators. */
function parseHeader(value: string): { type: string; attributes: Map<string, string> } {
  const head = /^([^;]+)(.*)$/.exec(value);
  if (!head || /[\x00-\x1f\x7f]/.test(head[1])) throw new InvalidUpload('上传表单头部非法');
  const attributes = new Map<string, string>();
  let rest = head[2];
  while (rest) {
    const attribute = /^;[ \t]*([!#$%&'*+.^_`|~0-9A-Za-z-]+)[ \t]*=[ \t]*(?:"((?:[^"\\\x00-\x1f\x7f]|\\[\x20-\x7e])*)"|([!#$%&'*+.^_`|~0-9A-Za-z-]+))[ \t]*/.exec(rest);
    if (!attribute || attributes.has(attribute[1].toLowerCase())) throw new InvalidUpload('上传字段参数非法');
    // Browsers send a basename, never a quoted filesystem path. Do not unescape path separators away.
    if (attribute[1].toLowerCase() === 'filename' && attribute[2]?.includes('\\')) throw new InvalidUpload('文件名非法');
    attributes.set(attribute[1].toLowerCase(), attribute[2] !== undefined ? attribute[2].replace(/\\([\x20-\x7e])/g, '$1') : attribute[3]);
    rest = rest.slice(attribute[0].length);
  }
  return { type: head[1].trim().toLowerCase(), attributes };
}
/** Only CRLF-delimited boundaries with a legal suffix separate parts. Never decode file bytes. */
function parseMultipart(body: Buffer, contentType: string): UploadPart {
  const content = parseHeader(contentType);
  if (content.type !== 'multipart/form-data') throw new InvalidUpload('上传请求必须为 multipart/form-data');
  const value = content.attributes.get('boundary') || '';
  if (!/^[0-9A-Za-z'()+_,.\/:=? -]{1,70}$/.test(value) || value.endsWith(' ')) throw new InvalidUpload('上传请求缺少合法 multipart boundary');
  const first = Buffer.from(`--${value}\r\n`);
  const delimiter = Buffer.from(`\r\n--${value}`);
  if (!body.subarray(0, first.length).equals(first)) throw new InvalidUpload('上传表单格式非法');
  let cursor = first.length; let count = 0; let found: UploadPart | undefined;
  for (;;) {
    if (++count > 16) throw new InvalidUpload('表单字段过多');
    const headerEnd = body.indexOf('\r\n\r\n', cursor);
    if (headerEnd < cursor || headerEnd - cursor > 8192) throw new InvalidUpload('上传表单头部非法');
    const headers = new Map<string, string>();
    for (const line of body.subarray(cursor, headerEnd).toString('utf8').split('\r\n')) {
      const header = /^([A-Za-z0-9-]+):[ \t]*([^\r\n\x00]+)$/.exec(line);
      if (!header || headers.has(header[1].toLowerCase())) throw new InvalidUpload('上传表单头部非法');
      headers.set(header[1].toLowerCase(), header[2].trim());
    }
    const disposition = parseHeader(headers.get('content-disposition') || '');
    const attributes = disposition.attributes;
    if (disposition.type !== 'form-data' || attributes.has('filename*')) throw new InvalidUpload('上传字段格式非法');
    if (!attributes.get('name')) throw new InvalidUpload('上传字段缺少名称');
    const start = headerEnd + 4;
    let next = body.indexOf(delimiter, start);
    let closing = false;
    for (;;) {
      if (next === -1) throw new InvalidUpload('上传表单缺少关闭边界');
      const suffix = next + delimiter.length;
      const ending = body.subarray(suffix, suffix + 2);
      if (ending.equals(Buffer.from('\r\n'))) break;
      if (ending.equals(Buffer.from('--')) && (suffix + 2 === body.length || body.subarray(suffix + 2, suffix + 4).equals(Buffer.from('\r\n')))) { closing = true; break; }
      next = body.indexOf(delimiter, next + delimiter.length);
    }
    const data = body.subarray(start, next);
    if (attributes.has('filename')) {
      const filename = attributes.get('filename')!;
      if (found || attributes.get('name') !== 'file') throw new InvalidUpload('每次仅允许上传一个文件');
      if (!filename || filename === '.' || filename === '..' || /[/\\:\x00-\x1f\x7f]/.test(filename)) throw new InvalidUpload('文件名非法');
      if (!data.length) throw new InvalidUpload('请选择一个文件');
      const mimeType = parseHeader(headers.get('content-type') || 'application/octet-stream').type;
      if (!/^[!#$%&'*+.^_`|~0-9a-z-]+\/[!#$%&'*+.^_`|~0-9a-z-]+$/.test(mimeType) || mimeType.length > 150) throw new InvalidUpload('文件 MIME 类型非法');
      found = { filename, mimeType, data };
    } else if (data.length > 64 * 1024) throw new InvalidUpload('表单字段过大');
    cursor = next + delimiter.length + 2;
    if (closing) {
      if (cursor !== body.length && !(cursor + 2 === body.length && body.subarray(cursor).equals(Buffer.from('\r\n')))) throw new InvalidUpload('关闭边界后存在非法内容');
      break;
    }
  }
  if (!found) throw new InvalidUpload('请选择一个文件');
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
  try {
    await database((req as Request & { mediaContext?: Context }).mediaContext!).run('INSERT INTO media_library(id,kind,original_name,filename,url,mime_type,size,created_at) VALUES(?,?,?,?,?,?,?,?)', item.id, item.kind, item.original_name, item.filename, item.url, item.mime_type, item.size, item.created_at);
  } catch (error) { await fs.remove(filePath); throw error; }
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
  web.register('get', '/api/media-library', requireAuth, checkPermission('media:upload'), wrapJson(async (req, res) => {
    const requestedKind = Array.isArray(req.query.kind) ? req.query.kind[0] : req.query.kind;
    const kind = mediaKind(requestedKind); const limit = 60; const where = kind ? ' WHERE kind=?' : ''; const params = kind ? [kind] : [];
    const total = Number((await dbService().get<{ count: number }>(`SELECT COUNT(*) AS count FROM media_library${where}`, ...params))?.count || 0);
    const requestedPage = Math.floor(Number(req.query.page));
    const page = Math.min(Math.max(1, Math.ceil(total / limit)), Number.isSafeInteger(requestedPage) ? Math.max(1, requestedPage) : 1);
    const items = await dbService().all<MediaRow>(`SELECT id,kind,original_name,filename,url,mime_type,size,created_at FROM media_library${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`, ...params, limit, (page - 1) * limit);
    res.json({ ok: true, items, total, page, limit });
  }));
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
    const filePath = (segments as string[]).join(path.sep); res.sendFile(filePath, { root: UPLOAD_ROOT }, (error) => { if (!error || res.headersSent) return; const status = (error as Error & { statusCode?: number }).statusCode; res.status(status || 404).end(); });
  });
  context.logger.info('activated');
}
