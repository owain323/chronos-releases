// migrate-all.cjs — SQLite → PG 全量数据迁移
const sqlite = require("better-sqlite3")("chronos.db");
const { Pool } = require("pg");
const DB_URL = process.env.DATABASE_URL || "postgres://localhost:5432/chronos";
const pool = new Pool({connectionString: DB_URL});

async function main(){
  const pg = await pool.connect();
  const tables = sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all().map(r => r.name);
  
  for (const table of tables) {
    try {
      const rows = sqlite.prepare("SELECT * FROM \"" + table + "\"").all();
      if (rows.length === 0) { console.log(table + ": 0 rows"); continue; }
      
      const vals = Object.keys(rows[0]);
      const cols = vals.map(c => c === "order" ? "order_col" : c.toLowerCase());
      const ph = vals.map(function(_,i){ return "$" + (i+1); }).join(",");
      const ins = "INSERT INTO \"" + table + "\" (" + cols.join(",") + ") VALUES (" + ph + ") ON CONFLICT DO NOTHING";
      
      let n = 0;
      for (const row of rows) {
        try {
          await pg.query(ins, vals.map(function(c){ return row[c]; }));
          n++;
        } catch(e) { /* skip */ }
      }
      console.log(table + ": " + n + "/" + rows.length + " rows");
    } catch(e) {
      console.log(table + ": SKIP - " + e.message.slice(0,60));
    }
  }
  
  pg.release(); pool.end();
  console.log("DONE");
}
main();
