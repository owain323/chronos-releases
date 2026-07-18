// change-pwd.mjs - 直接修改DB中用户密码
import Database from "better-sqlite3";
import bcrypt from "bcryptjs";
const db = new Database("/opt/CHRONOS/chronos.db");
const hash = bcrypt.hashSync("ZwXmKp9r!qa", 10);
const r = db
  .prepare("UPDATE users SET passwordHash=? WHERE email=?")
  .run(hash, "czj17751@qq.com");
console.log("Updated:", r.changes);
db.close();
