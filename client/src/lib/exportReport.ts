import { marked } from 'marked';

interface Message {
  role: 'assistant' | 'user';
  content: string;
}

interface ExportData {
  position: string;
  difficulty: string;
  totalQuestions: number;
  messages: Message[];
  /** key 为 assistant 消息在 assistant 列表中的下标 */
  standardAnswers: Record<number, string>;
  createdAt?: string;
}

interface BuildOptions {
  /** true 时所有 details 默认展开（打印场景） */
  expandAll?: boolean;
}

/** HTML 转义，防止 XSS（用户回答里可能有 <script>） */
function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** 把 markdown 安全渲染为 HTML（marked 自带基础转义） */
function md(s: string): string {
  return marked.parse(s, { async: false }) as string;
}

/** 生成完整 standalone HTML 文档 */
export function buildReportHtml(data: ExportData, opts: BuildOptions = {}): string {
  const expandAll = opts.expandAll ?? false;
  const dateStr = new Date(data.createdAt ?? Date.now()).toLocaleString('zh-CN');
  const title = `${data.position} · ${data.difficulty} 面试报告`;

  // 拆分：最后一条 assistant 是综合报告，前面是 Q&A
  const assistantMsgs = data.messages.filter((m) => m.role === 'assistant');
  const reportMsg = assistantMsgs[assistantMsgs.length - 1];
  const isReport = assistantMsgs.length > data.totalQuestions;

  // 构造 Q&A 列表（每个 assistant 问题 + 紧跟的 user 回答）
  const qaBlocks: string[] = [];
  let aiIdx = -1;
  for (let i = 0; i < data.messages.length; i++) {
    const msg = data.messages[i];
    if (msg.role !== 'assistant') continue;
    aiIdx += 1;
    // 最后一条若是 report，跳过
    if (isReport && i === data.messages.length - 1) break;

    const userAnswer = data.messages[i + 1]?.role === 'user' ? data.messages[i + 1].content : null;
    const stdAns = data.standardAnswers[aiIdx];

    qaBlocks.push(`
      <section class="qa">
        <div class="qa-head">
          <span class="qa-tag">Q${aiIdx + 1}</span>
          <span class="qa-role">面试官</span>
        </div>
        <div class="qa-body md">${md(msg.content)}</div>
        ${userAnswer
          ? `<div class="qa-head qa-head--user">
              <span class="qa-tag qa-tag--user">A</span>
              <span class="qa-role">候选人回答</span>
            </div>
            <div class="qa-body qa-body--user">${esc(userAnswer).replace(/\n/g, '<br/>')}</div>`
          : `<div class="qa-empty">（未作答）</div>`}
        ${stdAns
          ? `<details class="std-ans"${expandAll ? ' open' : ''}>
              <summary>📋 标准答案 / 参考要点</summary>
              <div class="md">${md(stdAns)}</div>
            </details>`
          : ''}
      </section>
    `);
  }

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
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif;
    line-height: 1.7;
    color: #1e293b;
    background: #f8fafc;
    padding: 40px 20px;
  }
  .container {
    max-width: 860px;
    margin: 0 auto;
    background: #fff;
    border-radius: 16px;
    box-shadow: 0 4px 24px rgba(15, 23, 42, 0.06);
    overflow: hidden;
  }
  .header {
    background: linear-gradient(135deg, #6366f1 0%, #a855f7 100%);
    color: #fff;
    padding: 36px 40px;
  }
  .header h1 { margin: 0 0 8px; font-size: 24px; font-weight: 700; }
  .header .meta { font-size: 13px; opacity: 0.85; display: flex; gap: 16px; flex-wrap: wrap; }
  .header .meta span::before { content: '·'; margin-right: 8px; opacity: 0.5; }
  .header .meta span:first-child::before { content: ''; margin: 0; }

  .section-title {
    margin: 32px 40px 16px;
    font-size: 13px;
    font-weight: 600;
    color: #64748b;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    border-left: 3px solid #6366f1;
    padding-left: 10px;
  }

  .report {
    margin: 0 40px 24px;
    padding: 24px 28px;
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: 12px;
  }

  .qa-list { padding: 0 40px 40px; }
  .qa {
    padding: 20px 0;
    border-bottom: 1px dashed #e2e8f0;
  }
  .qa:last-child { border-bottom: none; }
  .qa-head {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 8px;
  }
  .qa-head--user { margin-top: 16px; }
  .qa-tag {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 32px;
    height: 24px;
    padding: 0 8px;
    border-radius: 6px;
    background: #6366f1;
    color: #fff;
    font-size: 12px;
    font-weight: 600;
  }
  .qa-tag--user { background: #10b981; }
  .qa-role { font-size: 13px; color: #64748b; font-weight: 500; }
  .qa-body { padding-left: 42px; }
  .qa-body--user {
    background: #ecfdf5;
    border-left: 3px solid #10b981;
    padding: 12px 16px;
    margin-left: 42px;
    border-radius: 0 8px 8px 0;
    font-size: 14px;
    color: #334155;
    white-space: pre-wrap;
  }
  .qa-empty {
    margin-left: 42px;
    padding: 10px 14px;
    background: #fef2f2;
    color: #b91c1c;
    border-radius: 8px;
    font-size: 13px;
  }
  .std-ans {
    margin: 14px 0 0 42px;
    padding: 12px 16px;
    background: #fffbeb;
    border: 1px solid #fde68a;
    border-radius: 8px;
    font-size: 13px;
  }
  .std-ans summary {
    cursor: pointer;
    font-weight: 600;
    color: #b45309;
  }
  .std-ans .md { margin-top: 10px; color: #44403c; }

  /* Markdown 公共样式 */
  .md h1, .md h2, .md h3, .md h4 { margin: 1.2em 0 0.6em; font-weight: 600; color: #0f172a; }
  .md h1 { font-size: 22px; border-bottom: 2px solid #e2e8f0; padding-bottom: 8px; }
  .md h2 { font-size: 18px; border-bottom: 1px solid #e2e8f0; padding-bottom: 6px; }
  .md h3 { font-size: 16px; }
  .md p { margin: 0.6em 0; }
  .md ul, .md ol { padding-left: 1.6em; margin: 0.6em 0; }
  .md li { margin: 0.3em 0; }
  .md strong { color: #0f172a; }
  .md code {
    background: #f1f5f9;
    color: #db2777;
    padding: 1px 6px;
    border-radius: 4px;
    font-family: 'SF Mono', Menlo, Consolas, monospace;
    font-size: 0.92em;
  }
  .md pre {
    background: #0f172a;
    color: #e2e8f0;
    padding: 14px 16px;
    border-radius: 8px;
    overflow-x: auto;
    font-size: 13px;
    line-height: 1.6;
  }
  .md pre code { background: transparent; color: inherit; padding: 0; }
  .md blockquote {
    border-left: 4px solid #cbd5e1;
    padding: 4px 14px;
    margin: 12px 0;
    color: #475569;
    background: #f8fafc;
  }
  .md table {
    border-collapse: collapse;
    margin: 12px 0;
    width: 100%;
  }
  .md th, .md td {
    border: 1px solid #e2e8f0;
    padding: 6px 10px;
    text-align: left;
  }
  .md th { background: #f1f5f9; }

  .footer {
    text-align: center;
    color: #94a3b8;
    font-size: 12px;
    padding: 20px 0 0;
  }

  /* 打印优化 —— 用户用 Ctrl/Cmd+P 即可另存为 PDF */
  @media print {
    body { background: #fff; padding: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .container { box-shadow: none; border-radius: 0; }
    .header { border-radius: 0; }
    /* 仅对短小区块启用避免分页；report 通常长于一页，强行 avoid 会导致首页大片留白 */
    .qa { page-break-inside: avoid; break-inside: avoid; }
    .std-ans { page-break-inside: avoid; break-inside: avoid; }
    /* 让 details 在打印时强制展开 */
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
      <h1>${esc(title)}</h1>
      <div class="meta">
        <span>岗位：${esc(data.position)}</span>
        <span>难度：${esc(data.difficulty)}</span>
        <span>共 ${data.totalQuestions} 题</span>
        <span>生成时间：${esc(dateStr)}</span>
      </div>
    </header>

    ${isReport && reportMsg ? `
      <div class="section-title">综合评价报告</div>
      <div class="report md">${md(reportMsg.content)}</div>
    ` : ''}

    <div class="section-title">问答详情</div>
    <div class="qa-list">${qaBlocks.join('')}</div>

    <div class="footer">本报告由 ndzy-brainstorming AI 面试官生成</div>
  </div>
</body>
</html>`;
}

/** 下载为 .html 文件（默认折叠标准答案） */
export function downloadReportHtml(data: ExportData) {
  const html = buildReportHtml(data, { expandAll: false });
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `面试报告-${data.position}-${data.difficulty}-${new Date()
    .toISOString()
    .slice(0, 10)}.html`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** 打开新窗口并触发打印（用户可选「另存为 PDF」）——全部展开 */
export function printReportPdf(data: ExportData) {
  const html = buildReportHtml(data, { expandAll: true });
  const win = window.open('', '_blank');
  if (!win) {
    alert('浏览器拦截了弹窗，请允许后重试');
    return;
  }
  win.document.write(html);
  win.document.close();
  // 等样式与字体加载
  win.onload = () => {
    setTimeout(() => {
      win.focus();
      win.print();
    }, 300);
  };
}
