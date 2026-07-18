import * as db from "../../../db";
import { createShareCode } from "../file-share";
import { createShortLink } from "../short-link";

/** 搜索返回数据结构 */
export interface SearchReply {
  /** 文本摘要（放 news 文章第一条） */
  summary: string;
  /** 文件列表（每条一个 news article） */
  articles: Array<{
    title: string;
    url: string;
    icon: string;
  }>;
  showMore: number;
  isSearch: true;
}

/** 判断是否为搜索回复 */
export function isSearchReply(reply: any): reply is SearchReply {
  return reply && (reply as SearchReply).isSearch === true;
}

export function handleSearch(
  projectId: number,
  keyword: string
): SearchReply | Promise<SearchReply> {
  if (!keyword || keyword.length < 1)
    return {
      summary: "❌ 请输入搜索关键词。\n用法：/搜索 <关键词>",
      articles: [],
      showMore: 0,
      isSearch: true,
    };

  return (async () => {
    const tasks = await db.getTasksByProjectId(projectId);
    const files = await db.getFileSnapshotsByProjectId(projectId);

    const kw = keyword.toLowerCase();
    const matchedTasks = tasks.filter(t => t.title?.toLowerCase().includes(kw));
    const matchedFiles = files.filter(
      f =>
        f.fileName?.toLowerCase().includes(kw) ||
        (f.notes || "").toLowerCase().includes(kw)
    );

    if (!matchedTasks.length && !matchedFiles.length)
      return {
        summary: `🔍 没有找到包含「${keyword}」的任务或文件。`,
        articles: [],
        showMore: 0,
        isSearch: true,
      };

    const appUrl = process.env.APP_URL || "https://chronos.owain32380.cn";
    const articles: Array<{ title: string; url: string; icon: string }> = [];

    // 先加任务摘要
    let summary = `🔍 搜索「${keyword}」结果：`;
    if (matchedTasks.length > 0) {
      summary += `\n📋 ${matchedTasks.length} 个任务`;
      matchedTasks.slice(0, 3).forEach(t => {
        summary += `\n  #${t.id} ${t.title.slice(0, 30)}`;
      });
    }

    // 文件作为 news articles
    matchedFiles.forEach(f => {
      const code = createShareCode(f.id, f.projectId as number);
      const short = createShortLink(f.id, code);
      articles.push({
        title: `${f.mimeType?.startsWith("image/") ? "🖼" : "📄"} ${f.fileName}`,
        url: `${appUrl}/v/${short}`,
        icon: f.mimeType?.startsWith("image/") ? "🖼" : "📄",
      });
    });

    const showMore = matchedFiles.length > 8 ? matchedFiles.length - 8 : 0;
    return {
      summary,
      articles: articles.slice(0, 8),
      showMore,
      isSearch: true,
    };
  })();
}
