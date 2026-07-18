// Backfill fileSnapshots for orphan uploads (pre-v3.9 files)
import Database from "better-sqlite3";
import fs from "fs";
import path from "path";

const db = new Database("chronos.db");
const dir = "uploads";
const files = fs.readdirSync(dir);

const firstProject = db
  .prepare("SELECT id FROM projects ORDER BY id LIMIT 1")
  .get();
const projectId = firstProject?.id ?? 1;
const owner =
  db.prepare("SELECT id FROM users ORDER BY id LIMIT 1").get()?.id ?? 1;

let backfilled = 0;
for (const f of files) {
  const url = `/uploads/${f}`;
  const exists = db
    .prepare("SELECT id FROM fileSnapshots WHERE fileUrl = ?")
    .get(url);
  if (exists) continue;
  const stat = fs.statSync(path.join(dir, f));
  const ext = path.extname(f).toLowerCase();
  const mime =
    ext === ".pdf"
      ? "application/pdf"
      : ext === ".png"
        ? "image/png"
        : ext === ".jpg" || ext === ".jpeg"
          ? "image/jpeg"
          : ext === ".txt"
            ? "text/plain"
            : ext === ".docx"
              ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              : "application/octet-stream";
  db.prepare(
    `INSERT INTO fileSnapshots (projectId, fileName, fileKey, fileUrl, fileSize, mimeType, uploadedBy, version, createdAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)`
  ).run(projectId, f, f, url, stat.size, mime, owner, new Date().toISOString());
  backfilled++;
}
console.log(
  `backfilled ${backfilled} orphan files, total ${files.length} files, ${files.length - backfilled} already had records`
);
