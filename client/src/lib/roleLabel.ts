/** 统一角色标签 — 全局唯一词表, 消除三套不同标签 */
export function roleLabel(role: string): string {
  const map: Record<string, string> = {
    owner: "负责人",
    admin: "管理员",
    manager: "经理",
    member: "成员",
    bot: "机器人",
    viewer: "观察者",
    user: "普通用户",
  };
  return map[role] || role;
}
