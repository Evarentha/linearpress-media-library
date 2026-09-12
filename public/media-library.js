/*
 * Media Library Front-End Runtime
 *
 * Renders the media admin page, the shared picker modal, and injects library buttons into the editor.
 *
 * Authors:
 * MoyuZJ <moyuzj@moyuzj.cn> @LinearTeam - Made in China with ♥
 *
 * Copyright (C) 2026 Evarentha
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

/**
 * Client-side runtime for the media-library plugin.
 *
 * <p>Drives the admin media page (filterable, paginated card grid with upload and delete) and a
 * shared picker modal exposed as window.LinearPressMediaLibrary. It also injects "媒体库" picker
 * buttons into image/audio/video editor blocks and block toolbars, so any editor can select or
 * upload media without leaving the page.</p>
 *
 * @since 1.0.0
 */

(() => {
  const api = '/api/media-library';
  const state = { pageKind: '', modalKind: '', modalAllowedKind: '', page: 1, total: 0, limit: 60, items: [], callback: null };
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c]));
  const kindLabel = { image: '图片', video: '视频', audio: '音频' };
  const icon = { image: 'IMG', video: 'MOV', audio: 'AUD' };
  function formatSize(value) { const size = Number(value) || 0; if (size < 1024) return `${size} B`; if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`; return `${(size / 1024 / 1024).toFixed(1)} MB`; }
  function ensureModal() {
    let modal = document.querySelector('#media-library-modal'); if (modal) return modal;
    modal = document.createElement('div'); modal.id = 'media-library-modal'; modal.className = 'media-modal'; modal.innerHTML = `<div class="media-modal-backdrop" data-media-close></div><section class="media-modal-panel" role="dialog" aria-modal="true" aria-labelledby="media-modal-title"><header><div><span class="media-kicker">MEDIA LIBRARY</span><h2 id="media-modal-title">选择媒体</h2></div><button type="button" class="media-close" data-media-close aria-label="关闭">×</button></header><div class="media-modal-tools"><div class="media-tabs"><button type="button" class="is-active" data-modal-filter="">全部</button><button type="button" data-modal-filter="image">图片</button><button type="button" data-modal-filter="video">视频</button><button type="button" data-modal-filter="audio">音频</button></div><label class="media-upload-button"><span>上传并使用</span><input id="media-modal-upload" type="file" accept="image/*,audio/*,video/*"></label></div><div id="media-modal-grid" class="media-grid media-grid-modal"></div><div id="media-modal-pager" class="media-pager"></div><p id="media-modal-empty" class="media-empty" hidden>没有匹配的媒体。</p></section>`;
    document.body.append(modal); modal.addEventListener('click', (event) => { if (event.target.closest('[data-media-close]')) close(); }); modal.querySelector('#media-modal-upload').addEventListener('change', async (event) => { const file = event.target.files?.[0]; if (file) { if (state.modalAllowedKind && !file.type.startsWith(`${state.modalAllowedKind}/`)) { alert(`当前区块只支持${kindLabel[state.modalAllowedKind]}文件`); event.target.value = ''; return; } const item = await upload(file); if (item) select(item); event.target.value = ''; } });
    modal.querySelectorAll('[data-modal-filter]').forEach((button) => button.addEventListener('click', () => { if (state.modalAllowedKind && button.dataset.modalFilter !== state.modalAllowedKind) return; modal.querySelectorAll('[data-modal-filter]').forEach((item) => item.classList.toggle('is-active', item === button)); state.modalKind = button.dataset.modalFilter || ''; state.page = 1; load(state.modalKind).then(renderModal); }));
    return modal;
  }
  function card(item, selectable = false) { const preview = item.kind === 'image' ? `<img src="${esc(item.url)}" alt="${esc(item.original_name)}" loading="lazy">` : `<span class="media-type-icon">${icon[item.kind]}</span>`; return `<article class="media-card" data-media-id="${esc(item.id)}" data-selectable="${selectable}"><div class="media-preview">${preview}</div><div class="media-card-copy"><strong title="${esc(item.original_name)}">${esc(item.original_name)}</strong><small>${kindLabel[item.kind]} · ${formatSize(item.size)}</small></div>${selectable ? '<button type="button" class="media-use">选择</button>' : '<button type="button" class="media-delete" title="删除媒体" aria-label="删除媒体">×</button>'}</article>`; }
  function renderGrid(grid, empty, selectable) { grid.innerHTML = state.items.map((item) => card(item, selectable)).join(''); empty.hidden = state.items.length > 0; grid.querySelectorAll('.media-use').forEach((button) => button.addEventListener('click', (event) => { event.stopPropagation(); select(state.items.find((item) => item.id === button.closest('[data-media-id]')?.dataset.mediaId)); })); if (selectable) grid.querySelectorAll('.media-card').forEach((item) => { item.setAttribute('role', 'button'); item.setAttribute('tabindex', '0'); const choose = () => select(state.items.find((media) => media.id === item.dataset.mediaId)); item.addEventListener('click', choose); item.addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); choose(); } }); }); grid.querySelectorAll('.media-delete').forEach((button) => button.addEventListener('click', async (event) => { event.stopPropagation(); const id = button.closest('[data-media-id]')?.dataset.mediaId; if (id && confirm('确定删除这份媒体吗？')) { await fetch(`${api}/${id}/delete`, { method: 'POST' }); await load(); renderPage(); } })); }
  function renderPage() { const grid = document.querySelector('#media-page-grid'); if (!grid) return; renderGrid(grid, document.querySelector('#media-page-empty'), false); const status = document.querySelector('#media-page-status'); if (status) { const start = state.total ? (state.page - 1) * state.limit + 1 : 0; const end = Math.min(state.page * state.limit, state.total); status.textContent = `${start}-${end} / ${state.total} 项媒体`; } renderPager(document.querySelector('#media-pager'), state.pageKind, renderPage); }
  function renderModal() { const modal = ensureModal(); renderGrid(modal.querySelector('#media-modal-grid'), modal.querySelector('#media-modal-empty'), true); renderPager(modal.querySelector('#media-modal-pager'), state.modalKind, renderModal); }
  // 分页控件：服务端按 limit=60 分页，超过一页时展示上一页/下一页（页面与弹窗共用）。
  function renderPager(container, kind, rerender) {
    if (!container) return;
    const pages = Math.max(1, Math.ceil(state.total / state.limit));
    container.innerHTML = '';
    if (state.total <= state.limit) { container.hidden = true; return; }
    container.hidden = false;
    const go = (delta) => { state.page = Math.min(pages, Math.max(1, state.page + delta)); load(kind).then(rerender); };
    const prev = document.createElement('button'); prev.type = 'button'; prev.textContent = '上一页'; prev.disabled = state.page <= 1; prev.addEventListener('click', () => go(-1));
    const next = document.createElement('button'); next.type = 'button'; next.textContent = '下一页'; next.disabled = state.page >= pages; next.addEventListener('click', () => go(1));
    const label = document.createElement('span'); label.className = 'media-pager-label'; label.textContent = `第 ${state.page} / ${pages} 页 · 共 ${state.total} 项`;
    container.append(prev, label, next);
  }
  async function load(kind = state.pageKind) { const response = await fetch(`${api}?kind=${encodeURIComponent(kind)}&page=${state.page}`); const data = await response.json(); state.items = data.ok ? data.items : []; state.total = data.ok ? Number(data.total || 0) : 0; state.limit = Number(data.limit || 60) || 60; return state.items; }
  async function upload(file) { const form = new FormData(); form.append('file', file); const response = await fetch(`${api}/upload`, { method: 'POST', body: form }); const data = await response.json(); if (!data.ok) { alert(data.message || '上传失败'); return null; } await load(); renderPage(); return data.item; }
  function select(item) { if (!item || (state.modalAllowedKind && item.kind !== state.modalAllowedKind)) return; const callback = state.callback; close(); callback?.(item); }
  function close() { document.querySelector('#media-library-modal')?.classList.remove('is-open'); state.callback = null; }
  function open(options = {}) { state.modalAllowedKind = options.kind || ''; state.modalKind = state.modalAllowedKind; state.page = 1; state.callback = options.onSelect; const modal = ensureModal(); const uploadInput = modal.querySelector('#media-modal-upload'); uploadInput.accept = state.modalAllowedKind ? `${state.modalAllowedKind}/*` : 'image/*,audio/*,video/*'; modal.classList.add('is-open'); modal.querySelectorAll('[data-modal-filter]').forEach((button) => { const filter = button.dataset.modalFilter || ''; button.hidden = Boolean(state.modalAllowedKind && filter !== state.modalAllowedKind); button.classList.toggle('is-active', filter === state.modalKind); }); load(state.modalKind).then(renderModal); }
  window.LinearPressMediaLibrary = { open, upload };

  function updateInput(block, item) { const input = block.querySelector('input[type="url"], input[type="text"]'); if (!input) return; input.value = item.url; input.dispatchEvent(new Event('input', { bubbles: true })); input.dispatchEvent(new Event('change', { bubbles: true })); }
  function inject() {
    document.querySelectorAll('.lp-block-image,.lp-block-audio,.lp-block-video,.modern-block-image,.modern-block-audio,.modern-block-video').forEach((block) => { if (block.querySelector('.media-picker-button')) return; const button = document.createElement('button'); button.type = 'button'; button.className = 'media-picker-button'; button.textContent = '媒体库'; button.title = '从媒体库选择'; button.addEventListener('click', () => open({ kind: block.className.includes('image') ? 'image' : block.className.includes('audio') ? 'audio' : 'video', onSelect: (item) => updateInput(block, item) })); (block.querySelector('.lp-block-body,.modern-block-body') || block).append(button); });
    document.querySelectorAll('.lp-toolbar,[data-block-toolbar]').forEach((toolbar) => { if (toolbar.querySelector('.media-toolbar-button')) return; const button = document.createElement('button'); button.type = 'button'; button.className = 'media-toolbar-button'; button.textContent = '媒体库'; button.title = '从媒体库插入媒体'; button.addEventListener('click', () => open({ onSelect: (item) => { const editor = window.LinearPressModernEditor || window.LinearPressEditor; if (!editor) return; const type = item.kind; editor.setBlocks([...editor.getBlocks(), type === 'image' ? { type, src: item.url, alt: item.original_name } : { type, src: item.url }]); } })); toolbar.append(button); });
  }
  function initPage() { const uploadInput = document.querySelector('#media-page-upload'); if (uploadInput) uploadInput.addEventListener('change', async (event) => { for (const file of event.target.files || []) await upload(file); event.target.value = ''; }); document.querySelectorAll('[data-media-filter]').forEach((button) => button.addEventListener('click', () => { document.querySelectorAll('[data-media-filter]').forEach((item) => item.classList.toggle('is-active', item === button)); state.pageKind = button.dataset.mediaFilter || ''; state.page = 1; load(state.pageKind).then(renderPage); })); if (document.querySelector('#media-page-grid')) load(state.pageKind).then(renderPage); inject(); new MutationObserver(inject).observe(document.body, { childList: true, subtree: true }); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initPage); else initPage();
})();
