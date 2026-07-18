import * as db from "../../../db";
import { createShareCode } from "../file-share";
import { createShortLink } from "../short-link";

export interface FileListReply {
  isFileList: true;
  summary: string;
  articles: Array<{ title: string; url: string }>;
}

export function isFileListReply(r: any): r is FileListReply {
  return r && (r as FileListReply).isFileList === true;
}

function fileType(f: any): string {
  const mime = (f.mimeType || "").toLowerCase();
  const ext = (f.fileName || "").split(".").pop()?.toLowerCase() || "";
  if (mime.startsWith("image/")) return "image";
  if (mime.includes("pdf") || ext === "pdf") return "pdf";
  if (
    mime.includes("excel") ||
    mime.includes("spreadsheet") ||
    ["xls", "xlsx", "csv"].includes(ext)
  )
    return "excel";
  if (
    mime.includes("word") ||
    mime.includes("document") ||
    ["doc", "docx"].includes(ext)
  )
    return "doc";
  return "other";
}

const TYPE_ICON: Record<string, string> = {
  image: "🖼",
  pdf: "📄",
  excel: "📊",
  doc: "📝",
  other: "📦",
};
const TYPE_ORDER = ["image", "pdf", "excel", "doc", "other"];
const TYPE_MAP: Record<string, string> = {
  pdf: "pdf",
  image: "image",
  图片: "image",
  excel: "excel",
  表格: "excel",
  doc: "doc",
  文档: "doc",
  word: "doc",
  other: "other",
  其他: "other",
};

export async function handleFiles(
  projectId: number,
  userId: number,
  typeArg: string
): Promise<string | FileListReply> {
  const stats = await db.getFileStats(projectId);
  if (stats.total === 0) return "📂 还没有文件。\n\n在网页端上传文件后查看。";

  const appUrl = process.env.APP_URL || "https://chronos.owain32380.cn";

  // 按类型分组排序
  const grouped: Record<string, any[]> = {};
  for (const f of stats.files) {
    const t = fileType(f);
    (grouped[t] ??= []).push(f);
  }

  // 类型筛选：/文件 PDF
  if (typeArg) {
    const kw = TYPE_MAP[typeArg.toLowerCase()] || typeArg.toLowerCase();
    const files = grouped[kw];
    if (!files || files.length === 0) return `📂 暂无此类文件。`;
    const articles = files.map(f => {
      const code = createShareCode(f.id, f.projectId);
      const short = createShortLink(f.id, code);
      return {
        title: `${TYPE_ICON[kw]} ${f.fileName}`,
        url: `${appUrl}/v/${short}`,
      };
    });
    return {
      isFileList: true,
      summary: `${TYPE_ICON[kw]} ${typeArg} · ${files.length} 个`,
      articles,
    };
  }

  // 全量：最多 7 条文件卡片
  const MAX_FILES = 7;
  const articles: Array<{ title: string; url: string }> = [];
  let totalCount = 0;
  for (const t of TYPE_ORDER) {
    const files = grouped[t];
    if (!files || files.length === 0) continue;
    totalCount += files.length;
    for (const f of files) {
      if (articles.length >= MAX_FILES) break;
      const code = createShareCode(f.id, f.projectId);
      const short = createShortLink(f.id, code);
      articles.push({
        title: `${TYPE_ICON[t]} ${f.fileName}`,
        url: `${appUrl}/v/${short}`,
      });
    }
    if (articles.length >= MAX_FILES) break;
  }
  return {
    isFileList: true,
    summary: `📂 文件 · ${totalCount} 个（${(stats.totalSize / 1024).toFixed(1)} KB）${totalCount > MAX_FILES ? ` · 显示前 ${MAX_FILES} 条` : ""}`,
    articles,
  };
}

export async function handleFileNotes(
  fileId: number,
  notes: string
): Promise<string> {
  if (!notes || notes.length < 1)
    return "❌ 用法：/文件 备注 #编号 <内容>\n示例：/文件 备注 #1 采购合同";
  await db.updateFileSnapshotNotes(fileId, notes);
  return `✅ 文件 #${fileId} 备注已保存。`;
}
