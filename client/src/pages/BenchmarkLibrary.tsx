// BenchmarkLibraryPage — 标杆库列表页 (v4.4 WO-FE-1)
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Link } from "wouter";

export function BenchmarkLibraryPage() {
  const [search, setSearch] = useState("");
  const [industry, setIndustry] = useState("");
  const [market, setMarket] = useState("");

  const { data: entities = [], isLoading } =
    trpc.benchmark.listEntities.useQuery(
      {
        search: search || undefined,
        industry: industry || undefined,
        market: market || undefined,
      },
      { enabled: true }
    );

  const { data: industries = [] } = trpc.benchmark.listIndustries.useQuery();

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <h1 className="text-xl font-bold mb-4">📊 标杆库</h1>

      <div className="flex gap-3 mb-4 flex-wrap">
        <input
          className="border rounded px-3 py-1.5 text-sm w-64"
          placeholder="搜索实体名..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <select
          className="border rounded px-3 py-1.5 text-sm"
          value={industry}
          onChange={e => setIndustry(e.target.value)}
        >
          <option value="">全部行业</option>
          {industries.map((ind: { gicsGroup: string }) => (
            <option key={ind.gicsGroup} value={ind.gicsGroup}>
              {ind.gicsGroup}
            </option>
          ))}
        </select>
        <select
          className="border rounded px-3 py-1.5 text-sm"
          value={market}
          onChange={e => setMarket(e.target.value)}
        >
          <option value="">全部市场</option>
          <option value="A">沪深</option>
          <option value="H">港股</option>
          <option value="US">美股</option>
        </select>
      </div>

      {isLoading && (
        <div className="text-muted-foreground text-sm">加载中...</div>
      )}

      {!isLoading && !entities.length && (
        <div className="text-muted-foreground text-sm">
          暂无数据，请先运行{" "}
          <code className="bg-gray-100 px-1 rounded">
            npm run seed:benchmark
          </code>
        </div>
      )}

      <div className="grid gap-2">
        {entities.map((e: any) => (
          <Link
            key={e.id}
            href={`/benchmark/${e.id}`}
            className="block border rounded-lg p-3 hover:bg-gray-50 transition-colors"
          >
            <div className="font-medium">
              {e.name}
              {e.ticker && (
                <span className="text-muted-foreground ml-2 text-sm">
                  ({e.ticker})
                </span>
              )}
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">
              {e.gicsGroup} {e.market && `· ${e.market}`}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
