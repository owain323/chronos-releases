/**
 * 文件预览页面生成器
 * 服务端渲染纯 HTML，不依赖 React
 */

/** HTML 实体编码 — 防 XSS（含 javascript: 协议过滤） */
const esc = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

/** URL 安全验证 — 拒绝 javascript: 伪协议 */
const safeUrl = (url: string) => (/^javascript:/i.test(url) ? "#" : url);

export function renderFilePreview(data: {
  fileId: number;
  fileName: string;
  mimeType: string;
  fileUrl: string;
  projectName?: string;
  notes?: string;
  size?: number;
}): string {
  const isImage = data.mimeType?.startsWith("image/");
  const isPdf = data.mimeType?.includes("pdf");
  const ext = data.fileName.split(".").pop()?.toLowerCase() || "";
  const sizeStr = data.size ? `${(data.size / 1024).toFixed(1)} KB` : "未知";
  const projectLabel = data.projectName ? ` · ${esc(data.projectName)}` : "";

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${esc(data.fileName)}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #f8fafc; min-height: 100vh; }
    .header { background: white; border-bottom: 1px solid #e2e8f0; padding: 16px 20px; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px; }
    .header .title { font-size: 16px; font-weight: 600; color: #1e293b; max-width: 70%; word-break: break-all; }
    .header .meta { font-size: 12px; color: #94a3b8; }
    .header .actions { display: flex; gap: 8px; }
    .btn { display: inline-flex; align-items: center; gap: 4px; padding: 8px 16px; border-radius: 8px; font-size: 14px; font-weight: 600; text-decoration: none; border: none; cursor: pointer; }
    .btn-primary { background: #2563eb; color: white; }
    .btn-primary:hover { background: #1d4ed8; }
    .btn-outline { background: white; color: #475569; border: 1px solid #cbd5e1; }
    .btn-outline:hover { background: #f1f5f9; }
    .container { max-width: 900px; margin: 0 auto; padding: 20px; }
    .preview-box { background: white; border-radius: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.06); overflow: hidden; }
    .preview-box img { display: block; max-width: 100%; height: auto; margin: 0 auto; }
    .preview-box iframe { width: 100%; height: 80vh; border: none; }
    .preview-box .fallback { padding: 60px 20px; text-align: center; }
    .fallback .icon { font-size: 64px; margin-bottom: 16px; }
    .fallback p { color: #64748b; margin-bottom: 8px; }
    .fallback .ext { font-size: 18px; font-weight: 700; color: #334155; margin-bottom: 20px; }
    .notes-box { margin-top: 16px; background: white; border-radius: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.06); padding: 16px 20px; }
    .notes-box h3 { font-size: 14px; color: #64748b; margin-bottom: 8px; }
    .notes-box p { font-size: 14px; color: #334155; line-height: 1.6; white-space: pre-wrap; }
    .footer { text-align: center; padding: 24px; font-size: 12px; color: #94a3b8; }
    .footer a { color: #2563eb; }
    @media (max-width: 600px) {
      .header { flex-direction: column; align-items: flex-start; }
      .header .title { max-width: 100%; }
    }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <div class="title">${esc(data.fileName)}</div>
      <div class="meta">${sizeStr} · ${ext.toUpperCase()}${projectLabel}</div>
    </div>
    <div class="actions">
      <a class="btn btn-primary" href="${esc(safeUrl(data.fileUrl))}" download>⬇ 下载</a>
      <button class="btn btn-outline" onclick="history.back()">← 返回</button>
    </div>
  </div>
  <div class="container">
    <div class="preview-box">
      ${
        isImage
          ? `<img src="${esc(safeUrl(data.fileUrl))}" alt="${esc(data.fileName)}" onerror="this.style.display='none';this.nextElementSibling.style.display='block'" loading="lazy"><div style="display:none" class="fallback"><div class="icon">🖼️</div><p>图片加载失败</p><a class="btn btn-primary" href="${esc(safeUrl(data.fileUrl))}" download>⬇ 下载文件</a></div>`
          : isPdf
            ? `<p style="padding:12px;color:#94a3b8;font-size:13px;">PDF 预览（微信内置浏览器可能不支持，请点击上方下载按钮）</p>
             <iframe src="${esc(safeUrl(data.fileUrl))}" onerror="this.style.display='none'"></iframe>`
            : `<div class="fallback">
               <div class="icon">📄</div>
               <div class="ext">.${ext} 文件</div>
               <p>此文件类型不支持在线预览</p>
               <a class="btn btn-primary" href="${esc(safeUrl(data.fileUrl))}" download>⬇ 下载文件</a>
             </div>`
      }
    </div>
    ${data.notes ? `<div class="notes-box"><h3>📝 备注</h3><p>${esc(data.notes)}</p></div>` : ""}
  </div>
  <div class="footer">CHRONOS 文件预览 · <a href="/">返回仪表盘</a></div>
</body>
</html>`;
}
