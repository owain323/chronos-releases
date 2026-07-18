import * as db from "../../../db";
import { contextHeader, footer } from "./_utils";

export async function handleCost(
  projectId: number,
  userId: number,
  args: string
): Promise<string> {
  const parts = args.split("|||");
  const ctx = await contextHeader(projectId, userId);
  if (parts.length < 2)
    return `${ctx}\n\n❌ 用法：/成本 <金额> <名称>\n示例：/成本 500 买服务器`;

  const amount = parts[0];
  const name = parts[1];
  await db.createCostEntry({
    projectId,
    name,
    amount,
    category: "其他",
    createdBy: userId,
  });
  return `${ctx}\n\n💰 已录入：${name} ¥${amount}\n${footer(["/成本 统计", "/报表"])}`;
}

export async function handleCostStats(
  projectId: number,
  userId: number
): Promise<string> {
  const costs = await db.getCostEntriesByProjectId(projectId);
  const ctx = await contextHeader(projectId, userId);
  if (!costs.length)
    return `${ctx}\n\n📊 还没有成本数据。/成本 <金额> <名称> 录入第一笔。`;

  const total = costs.reduce((s, c) => s + c.amount, 0);
  const byCategory: Record<string, number> = {};
  costs.forEach(c => {
    byCategory[c.category] = (byCategory[c.category] || 0) + c.amount;
  });

  const lines: string[] = [
    ctx,
    "",
    "💰 **成本统计**",
    `总计：¥${total.toFixed(2)}（${costs.length} 笔）\n`,
  ];
  if (Object.keys(byCategory).length > 0) {
    lines.push("按类别：");
    Object.entries(byCategory)
      .sort((a, b) => b[1] - a[1])
      .forEach(([cat, amt]) => lines.push(`  ${cat}: ¥${amt.toFixed(2)}`));
  }
  lines.push(footer(["/成本 <金额> <名称>", "/报表"]));
  return lines.join("\n");
}
