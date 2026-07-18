import bcrypt from "bcryptjs";
import * as db from "../../../db";
import { config } from "../../../config";

/** 机器人注册：/注册 用户名 密码 */
export async function handleRegister(args: string): Promise<string> {
  const [name, password] = args.split("|||");
  if (!name || !password || password.length < 6)
    return "❌ 格式：/注册 用户名 密码（密码至少6位）\n示例：/注册 张三 mypass123";

  const existing = await db.getUserByName(name);
  if (existing) return `❌ 用户名「${name}」已被占用，请换一个。`;

  const hash = await bcrypt.hash(password, config.auth.bcryptRounds);
  await db.createUserWithPassword(name, hash);

  // 不回显密码
  return `✅ 注册成功！\n\n用户名：${name}\n密码：***（你刚输入的）\n\n输入 /登录 ${name} *** 即可绑定机器人。`;
}
