import { marked } from 'marked';

interface Message {
  role: 'assistant' | 'user';
  content: string;
}

interface ExportData {
  genre: string;
  style: string;
  totalScenes: number;
  messages: Message[];
  createdAt?: string;
  title?: string | null;
}

interface BuildOptions {
  expandAll?: boolean;
}

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function md(s: string): string {
  return marked.parse(s, { async: false }) as string;
}

/** 解析末尾数字编号选项，与 Game.tsx 同步 */
function parseScene(text: string): { narrative: string; choices: string[] } {
  if (!text) return { narrative: '', choices: [] };
  const lines = text.split('\n');
  const choices: { num: number; content: string; lineIdx: number }[] = [];
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].trim();
    if (!line) continue;
    const m = line.match(/^(\d+)[\.、\)]\s*(.+)$/);
    if (m) choices.unshift({ num: Number(m[1]), content: m[2], lineIdx: i });
    else if (choices.length > 0) break;
  }
  if (choices.length < 2) return { narrative: text, choices: [] };
  const expected = choices.map((_, i) => i + 1).join(',');
  const actual = choices.map((c) => c.num).join(',');
  if (expected !== actual) return { narrative: text, choices: [] };
  const firstIdx = choices[0].lineIdx;
  return { narrative: lines.slice(0, firstIdx).join('\n').trim(), choices: choices.map((c) => c.content) };
}

export function buildStoryHtml(data: ExportData, opts: BuildOptions = {}): string {
  const expandAll = opts.expandAll ?? false;
  const dateStr = new Date(data.createdAt ?? Date.now()).toLocaleString('zh-CN');
  const title = data.title || `${data.genre} · ${data.style}`;

  const scenes: { sceneNum: number; narrative: string; choices: string[]; action?: string; isEnding: boolean }[] = [];
  let sceneNum = 0;
  let pendingAction: string | undefined;
  const assistantMsgs = data.messages.filter((m) => m.role === 'assistant');
  let aiIdx = 0;
  for (const m of data.messages) {
    if (m.role === 'user') {
      pendingAction = m.content;
    } else {
      sceneNum += 1;
      const p = parseScene(m.content);
      const isEnding = aiIdx === assistantMsgs.length - 1 && p.choices.length === 0;
      scenes.push({ sceneNum, narrative: p.narrative || m.content, choices: p.choices, action: pendingAction, isEnding });
      pendingAction = undefined;
      aiIdx += 1;
    }
  }

  const sceneBlocks = scenes.map((s) => `
    <section class="scene${s.isEnding ? ' scene--ending' : ''}">
      <div class="scene-head">
        <span class="scene-tag">第 ${s.sceneNum} 幕</span>
        ${s.isEnding ? '<span class="scene-badge">🎬 结局</span>' : ''}
      </div>
      ${s.action ? `<div class="action">▸ ${esc(s.action)}</div>` : ''}
      <div class="scene-body md">${md(s.narrative)}</div>
      ${s.choices.length > 0 ? `
        <details class="choices"${expandAll ? ' open' : ''}>
          <summary>📋 当时的选项</summary>
          <ol>${s.choices.map((c) => `<li>${esc(c)}</li>`).join('')}</ol>
        </details>` : ''}
    </section>
  `).join('');

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${esc(title)}</title>
<style>
  *, *::before, *::after { box-sizing: border-box; }
  body {
    margin: 0;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', serif;
    line-height: 1.85;
    color: #1e293b;
    background: #f8fafc;
    padding: 40px 20px;
  }
  .container {
    max-width: 780px;
    margin: 0 auto;
    background: #fff;
    border-radius: 16px;
    box-shadow: 0 4px 24px rgba(15, 23, 42, 0.06);
    overflow: hidden;
  }
  .header {
    background: linear-gradient(135deg, #10b981 0%, #06b6d4 100%);
    color: #fff;
    padding: 36px 40px;
  }
  .header h1 { margin: 0 0 8px; font-size: 26px; font-weight: 700; }
  .header .meta { font-size: 13px; opacity: 0.9; display: flex; gap: 16px; flex-wrap: wrap; }
  .header .meta span::before { content: '·'; margin-right: 8px; opacity: 0.5; }
  .header .meta span:first-child::before { content: ''; margin: 0; }

  .scene-list { padding: 20px 40px 40px; }
  .scene {
    padding: 28px 0;
    border-bottom: 1px dashed #e2e8f0;
  }
  .scene:last-child { border-bottom: none; }
  .scene-head {
    display: flex; align-items: center; gap: 10px; margin-bottom: 12px;
  }
  .scene-tag {
    display: inline-flex; align-items: center; justify-content: center;
    padding: 4px 12px; border-radius: 999px;
    background: #ecfdf5; color: #047857;
    font-size: 12px; font-weight: 600;
  }
  .scene-badge {
    padding: 4px 10px; border-radius: 999px;
    background: linear-gradient(135deg, #fde68a, #fbbf24);
    color: #78350f; font-size: 12px; font-weight: 600;
  }
  .action {
    margin-bottom: 14px; padding: 10px 14px;
    background: #f1f5f9; border-left: 3px solid #94a3b8;
    border-radius: 0 8px 8px 0;
    color: #475569; font-size: 14px;
  }
  .scene-body { font-size: 16px; color: #1e293b; }
  .scene--ending .scene-body {
    background: linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%);
    padding: 20px 24px; border-radius: 12px;
    border: 1px solid #fde68a;
  }
  .choices {
    margin-top: 14px; padding: 12px 16px;
    background: #f8fafc; border: 1px solid #e2e8f0;
    border-radius: 8px; font-size: 13px;
  }
  .choices summary { cursor: pointer; font-weight: 600; color: #475569; }
  .choices ol { margin: 10px 0 0; padding-left: 1.6em; color: #64748b; }
  .choices li { margin: 4px 0; }

  /* Markdown 样式 */
  .md p { margin: 0.7em 0; }
  .md h1, .md h2, .md h3 { margin: 1.2em 0 0.6em; font-weight: 600; color: #0f172a; }
  .md h2 { font-size: 18px; }
  .md h3 { font-size: 16px; }
  .md strong { color: #0f172a; }
  .md em { color: #0d9488; font-style: italic; }
  .md ul, .md ol { padding-left: 1.6em; }
  .md blockquote {
    border-left: 4px solid #10b981;
    padding: 6px 16px; margin: 12px 0;
    color: #475569; background: #f0fdfa;
    font-style: italic;
  }

  .footer { text-align: center; color: #94a3b8; font-size: 12px; padding: 20px 0; }

  @media print {
    body { background: #fff; padding: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .container { box-shadow: none; border-radius: 0; }
    .header { border-radius: 0; }
    .scene { page-break-inside: avoid; break-inside: avoid; }
    details { display: block; }
    details > summary { display: block; }
    details[open] > *, details > * { display: revert; }
    @page { margin: 14mm 12mm; }
  }
</style>
</head>
<body>
  <div class="container">
    <header class="header">
      <h1>📖 ${esc(title)}</h1>
      <div class="meta">
        <span>类型：${esc(data.genre)}</span>
        <span>风格：${esc(data.style)}</span>
        <span>共 ${data.totalScenes} 幕</span>
        <span>生成时间：${esc(dateStr)}</span>
      </div>
    </header>
    <div class="scene-list">${sceneBlocks}</div>
    <div class="footer">本故事由 ndzy-brainstorming 互动小说生成</div>
  </div>
</body>
</html>`;
}

export function downloadStoryHtml(data: ExportData) {
  const html = buildStoryHtml(data, { expandAll: false });
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `互动小说-${data.genre}-${data.style}-${new Date().toISOString().slice(0, 10)}.html`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function printStoryPdf(data: ExportData) {
  const html = buildStoryHtml(data, { expandAll: true });
  const win = window.open('', '_blank');
  if (!win) { alert('浏览器拦截了弹窗，请允许后重试'); return; }
  win.document.write(html);
  win.document.close();
  win.onload = () => { setTimeout(() => { win.focus(); win.print(); }, 300); };
}
