import bcrypt from "bcryptjs";
import * as db from "../../../db";

/** 机器人用户名密码登录：/登录 用户名 密码 */
export async function handleLoginPassword(
  args: string
): Promise<{ reply: string; chronosUserId?: number }> {
  const [name, password] = args.split("|||");
  if (!name || !password)
    return { reply: "❌ 格式：/登录 用户名 密码\n示例：/登录 张三 mypass123" };

  const user = await db.getUserByName(name);
  if (!user)
    return {
      reply: `❌ 用户「${name}」不存在。\n\n输入 /注册 ${name} 密码 创建账号。`,
    };

  if (!user.passwordHash)
    return { reply: "❌ 该账号未设置密码。请先设置密码后再试。" };

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) return { reply: "❌ 密码错误。" };

  await db.updateUserLastSignIn(user.id);

  return {
    reply: `✅ 登录成功！\n\n欢迎回来，${user.name}！\n\n现在你可以用 /任务 查看项目进度了。`,
    chronosUserId: user.id,
  };
}
