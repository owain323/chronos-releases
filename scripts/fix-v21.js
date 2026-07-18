const fs = require("fs");
const path = require("path");

// Remove local onError toast calls that duplicate the global handler in main.tsx
// Only remove trivial onError: (e) => toast.error(...), 
// keep onError that do something else (like setError, refetch, etc)

function walk(dir) {
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f);
    if (fs.statSync(p).isDirectory()) {
      if (f !== "node_modules") walk(p);
      continue;
    }
    if (!/\.tsx$/.test(f)) continue;
    let c = fs.readFileSync(p, "utf8");
    const orig = c;

    // Pattern: onError: (e: any) => toast.error(e.message),
    c = c.replace(/\s*onError:\s*\(e:\s*any\)\s*=>\s*toast\.error\(e\.message\),/g, "");

    // Pattern: onError: (e: unknown) => toast.error(...)
    c = c.replace(/,\s*onError:\s*\(e:\s*unknown\)\s*=>\s*toast\.error\(e instanceof Error \? e\.message : String\(e\)\)/g, "");

    // Pattern: onError: err => toast.error(err.message),
    c = c.replace(/\s*onError:\s*err\s*=>\s*toast\.error\(err\.message\),/g, "");

    // Pattern: onError: (e) => toast.error(e.message),
    c = c.replace(/\s*onError:\s*\(e\)\s*=>\s*toast\.error\(e\.message\),/g, "");

    // Pattern: onError: e => toast.error(e.message),
    c = c.replace(/\s*onError:\s*e\s*=>\s*toast\.error\(e\.message\),/g, "");

    // onError: e => toast.error(e.message || "xxx"),
    c = c.replace(/\s*onError:\s*e\s*=>\s*toast\.error\(e\.message \|\| [^)]+\),/g, "");

    if (c !== orig) {
      fs.writeFileSync(p, c);
      console.log("Cleaned:", path.relative(".", p));
    }
  }
}

walk("client/src");
console.log("V-21 done");
