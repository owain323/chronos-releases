// CaliberHint — 三层口径提示 (v4.4 WO-FE-2, 共享组件)
export function CaliberHint({ standard }: { standard?: string }) {
  if (!standard) return null;
  return <span className="text-xs text-muted-foreground">[{standard}]</span>;
}
