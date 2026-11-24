#!/usr/bin/env node
/*
 * 產生知識庫 Dashboard
 *   讀 _dashboard/topics.json → 掃描各主題的來源 → 依 outputs 產生自足的 HTML
 *
 *   node _dashboard/build.js            產生全部 outputs（本機用：本機版 + 公開版預覽）
 *   node _dashboard/build.js --public   只產生 scope=public 的 outputs（GitHub Actions 用）
 *
 * 來源類型（topics.json 的 sources，路徑相對於 repo 根目錄）：
 *   { "type": "files",      "dir": "Stock" }                              資料夾第一層的 .html，每個檔案一篇
 *   { "type": "file",       "path": "xxx.html" }                          單一檔案
 *   { "type": "subfolders", "dir": "../旅遊計畫", "entry": "行程規劃.html" } 每個子資料夾一篇；同名 .pdf/.md 附連結
 *
 * 主題的 "public": true 才會出現在公開版；來源加 "localOnly": true 則該來源的文章只出現在本機版。
 * 公開版只能引用 repo 內的檔案（否則直接報錯中止）。
 */
'use strict';
const fs = require('fs');
const path = require('path');

const HERE = __dirname;
const ROOT = path.resolve(HERE, '..');                 // repo 根目錄
const cfg = JSON.parse(fs.readFileSync(path.join(HERE, 'topics.json'), 'utf8'));
const ONLY_PUBLIC = process.argv.includes('--public');
// CI 上 checkout 會把檔案修改時間全部改成部署當下，所以改用 git 最後一次 commit 的時間
const GIT_DATES = process.argv.includes('--git-dates');
const { execFileSync } = require('child_process');
function lastCommitMs(abs) {
  try {
    const s = execFileSync('git', ['log', '-1', '--format=%ct', '--', abs], { cwd: ROOT, encoding: 'utf8' }).trim();
    return s ? Number(s) * 1000 : null;
  } catch { return null; }
}

/* ---------- 文字處理 ---------- */
const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
function decode(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') {
      const n = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : m;
    }
    return ENT[e.toLowerCase()] ?? m;
  });
}
const clean = s => decode(String(s).replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
const clip = (s, n) => (s.length > n ? s.slice(0, n - 1) + '…' : s);

function readMeta(file) {
  let html = '';
  try { html = fs.readFileSync(file, 'utf8'); } catch { return {}; }
  const body = html.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '');
  const pick = re => { const m = body.match(re); return m ? clean(m[1]) : ''; };
  const title = pick(/<title[^>]*>([\s\S]*?)<\/title>/i) || pick(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  let desc = '';
  const meta = html.match(/<meta[^>]+name=["']description["'][^>]*>/i);
  if (meta) { const c = meta[0].match(/content=["']([^"']*)["']/i); if (c) desc = clean(c[1]); }
  if (!desc) desc = pick(/<p[^>]*class=["'][^"']*\bsub\b[^"']*["'][^>]*>([\s\S]*?)<\/p>/i);
  if (!desc) {
    for (const m of body.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)) { const t = clean(m[1]); if (t.length >= 20) { desc = t; break; } }
  }
  const h2 = [...body.matchAll(/<h2[^>]*>([\s\S]*?)<\/h2>/gi)].map(m => clean(m[1])).filter(Boolean);
  return { title, desc: clip(desc, 160), sections: h2.length };
}

/* ---------- 路徑 ---------- */
const ymd = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const isDir = p => { try { return fs.statSync(p).isDirectory(); } catch { return false; } };
const exists = p => { try { fs.accessSync(p); return true; } catch { return false; } };
const relFrom = (dir, abs) => path.relative(dir, abs).split(path.sep).join('/');
const urlFrom = (dir, abs) => relFrom(dir, abs).split('/').map(s => (s === '..' ? s : encodeURIComponent(s))).join('/');
const insideRepo = abs => !path.relative(ROOT, abs).startsWith('..');

function altFiles(abs) {
  const base = abs.replace(/\.html?$/i, '');
  return [['PDF', '.pdf'], ['Markdown', '.md']].filter(([, ext]) => exists(base + ext)).map(([label, ext]) => ({ label, abs: base + ext }));
}
function articleFromFile(abs, extra = {}) {
  const st = fs.statSync(abs);
  const meta = readMeta(abs);
  const ms = (GIT_DATES && lastCommitMs(abs)) || st.mtimeMs;
  return {
    abs,
    title: extra.title || meta.title || path.basename(abs).replace(/\.html?$/i, ''),
    desc: meta.desc || '',
    note: extra.note || '',
    sections: meta.sections || 0,
    alts: altFiles(abs),
    mtime: ms,
    updated: ymd(new Date(ms)),
    eventDate: extra.eventDate || '',
  };
}
function tripDate(name) {
  const m = name.match(/(20\d{2})(\d{2})(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : '';
}
function collect(src) {
  const out = [];
  if (src.type === 'file') {
    const abs = path.resolve(ROOT, src.path);
    if (exists(abs)) out.push(articleFromFile(abs));
    else console.warn(`  ! 找不到檔案：${src.path}（略過）`);
  } else if (src.type === 'files') {
    const dir = path.resolve(ROOT, src.dir);
    if (!isDir(dir)) { console.warn(`  ! 找不到資料夾：${src.dir}（略過）`); return out; }
    for (const f of fs.readdirSync(dir)) {
      if (/\.html?$/i.test(f) && !f.startsWith('.')) out.push(articleFromFile(path.join(dir, f)));
    }
  } else if (src.type === 'subfolders') {
    const dir = path.resolve(ROOT, src.dir);
    if (!isDir(dir)) { console.warn(`  ! 找不到資料夾：${src.dir}（略過）`); return out; }
    for (const d of fs.readdirSync(dir)) {
      if (d.startsWith('.')) continue;
      const entry = path.join(dir, d, src.entry || 'index.html');
      if (!exists(entry)) continue;               // 沒有入口檔的子資料夾（例如程式專案）略過
      const meta = readMeta(entry);
      out.push(articleFromFile(entry, { title: meta.title || d, note: d.replace(/_/g, ' · '), eventDate: tripDate(d) }));
    }
  }
  return out;
}

/* ---------- 掃描 ---------- */
const outputs = (cfg.outputs || [{ file: 'index.html', scope: 'all' }]).filter(o => !ONLY_PUBLIC || o.scope === 'public');
const needAll = outputs.some(o => o.scope !== 'public');
const scanned = cfg.topics
  .filter(t => needAll || t.public === true)          // 只產公開版時，非公開主題連掃都不掃
  .map(t => {
    const seen = new Set();
    const articles = t.sources
      .filter(s => needAll || !s.localOnly)             // 只產公開版時，localOnly 來源也不掃
      .flatMap(s => collect(s).map(a => ({ ...a, localOnly: !!s.localOnly || t.public !== true })))
      .filter(a => !seen.has(a.abs) && seen.add(a.abs));
    articles.sort((a, b) => b.mtime - a.mtime);
    console.log(`  ${t.icon || '•'} ${t.name}${t.public ? '（公開）' : '（僅本機）'}：${articles.length} 篇`);
    return { ...t, articles };
  });

const now = new Date();
const generated = `${ymd(now)} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
const tpl = fs.readFileSync(path.join(HERE, 'template.html'), 'utf8');

/* ---------- 輸出 ---------- */
for (const o of outputs) {
  const outFile = path.resolve(ROOT, o.file);
  const outDir = path.dirname(outFile);
  const isPublic = o.scope === 'public';
  const topics = scanned.filter(t => !isPublic || t.public === true).map(t => {
    const articles = t.articles.filter(a => !isPublic || !a.localOnly).map(a => {
      if (isPublic && !insideRepo(a.abs)) throw new Error(`公開版不能引用 repo 以外的檔案：${a.abs}`);
      return {
        title: a.title, desc: a.desc, note: a.note, sections: a.sections,
        path: relFrom(outDir, a.abs), href: urlFrom(outDir, a.abs),
        alts: a.alts.map(x => ({ label: x.label, href: urlFrom(outDir, x.abs) })),
        mtime: a.mtime, updated: a.updated, eventDate: a.eventDate,
      };
    });
    return { id: t.id, name: t.name, subtitle: t.subtitle || '', icon: t.icon || '📁', color: t.color || '#2a78d6', articles };
  });
  const DATA = { title: cfg.title || '知識庫', subtitle: cfg.subtitle || '', generated, mode: isPublic ? 'public' : 'local', topics };
  const json = JSON.stringify(DATA).replace(/</g, '\\u003c');
  const html = tpl.replace('/*__DATA__*/null', json).replace(/__TITLE__/g, DATA.title.replace(/</g, '&lt;'));
  fs.writeFileSync(outFile, html, 'utf8');
  const n = topics.reduce((s, t) => s + t.articles.length, 0);
  console.log(`已產生 ${path.relative(path.resolve(ROOT, '..'), outFile)}（${isPublic ? '公開版' : '本機版'}，${topics.length} 個主題、${n} 篇，${generated}）`);
}
