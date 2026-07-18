/**
 * EmailService — SMTP 邮件通知
 * 未配置 SMTP_* 环境变量时静默跳过，不影响主流程
 */
import { createTransport } from "nodemailer";

const transporter = process.env.SMTP_HOST
  ? createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT) || 587,
      secure: false,
      auth: process.env.SMTP_USER
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
        : undefined,
    })
  : null;

export async function sendEmail(opts: {
  to: string;
  subject: string;
  text: string;
}) {
  if (!transporter) return false; // SMTP 未配置，静默跳过
  try {
    await transporter.sendMail({
      from: process.env.SMTP_FROM || "noreply@chronos.dev",
      ...opts,
    });
    return true;
  } catch (err) {
    console.error("[email] send failed:", (err as Error).message);
    return false;
  }
}

/** 根据 userId 查邮箱并发送通知 */
export async function notifyByEmail(
  userId: number,
  subject: string,
  text: string
) {
  if (!transporter) return;
  try {
    const { db } = await import("../db/connection");
    const { users } = await import("../../drizzle/schema");
    const { eq } = await import("drizzle-orm");
    const user = db
      .select({ email: users.email })
      .from(users)
      .where(eq(users.id, userId))
      .get();
    if (user?.email) {
      await sendEmail({ to: user.email, subject, text });
    }
  } catch (err) {
    console.error("[email] notifyByEmail failed:", (err as Error).message);
  }
}
