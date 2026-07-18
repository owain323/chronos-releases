import React, { useState, useEffect } from "react";
import { useLocation, useSearch } from "wouter";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";
import {
  Folder,
  Users,
  Briefcase,
  AlertCircle,
  DollarSign,
  Contact,
  ArrowRight,
  TrendingUp,
  Receipt,
  FileText,
} from "lucide-react";
import { EmptyState } from "@/components/feedback/EmptyState";
import { TableSkeleton } from "@/components/feedback/LoadingSkeleton";
import { ChronosLayout } from "@/components/ChronosLayout";

export default function SearchResults() {
  const [, navigate] = useLocation();
  const search = useSearch();
  const params = new URLSearchParams(search);

  const [keyword, setKeyword] = useState(params.get("keyword") || "");
  const [startDate, setStartDate] = useState<Date | null>(
    params.get("startDate") ? new Date(params.get("startDate")!) : null
  );
  const [endDate, setEndDate] = useState<Date | null>(
    params.get("endDate") ? new Date(params.get("endDate")!) : null
  );

  const searchQuery = trpc.search.global.useQuery(
    {
      keyword: keyword || undefined,
      startDate: startDate || undefined,
      endDate: endDate || undefined,
      limit: 100,
    },
    {
      enabled: keyword.length > 0 || startDate !== null || endDate !== null,
    }
  );

  useEffect(() => {
    const p = new URLSearchParams(search);
    setKeyword(p.get("keyword") || "");
    setStartDate(p.get("startDate") ? new Date(p.get("startDate")!) : null);
    setEndDate(p.get("endDate") ? new Date(p.get("endDate")!) : null);
  }, [search]);

  const results = searchQuery.data || {
    tasks: [],
    projects: [],
    files: [],
    vendors: [],
    customers: [],
    contacts: [],
    costs: [],
    revenues: [],
    expenses: [],
  };

  const totalResults =
    (results.tasks?.length || 0) +
    (results.projects?.length || 0) +
    (results.files?.length || 0) +
    (results.vendors?.length || 0) +
    (results.customers?.length || 0) +
    (results.contacts?.length || 0) +
    (results.costs?.length || 0) +
    (results.revenues?.length || 0) +
    (results.expenses?.length || 0);

  const goTo = (path: string) => navigate(path);

  const renderSection = <T extends Record<string, unknown>>(
    title: string,
    icon: React.ElementType,
    items: T[],
    onClick: (item: T) => string,
    keyFn?: (item: T) => string
  ) => {
    if (!items || items.length === 0) return null;
    const Icon = icon;
    return (
      <div className="mb-8">
        <h2 className="text-xl font-bold mb-3 flex items-center gap-2">
          <Icon className="w-5 h-5 text-sky-600" />
          {title} ({items.length})
          {items.length > 50 ? (
            <span className="text-xs text-amber-600 ml-2">仅显示前 50 条</span>
          ) : null}
        </h2>
        <div className="grid gap-3 md:grid-cols-2">
          {items.map((item: any) => (
            <Card
              key={keyFn ? keyFn(item) : item.id}
              className="p-4 hover:shadow-md transition-shadow cursor-pointer border-gray-200"
              onClick={() => goTo(onClick(item))}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-base truncate">
                    {item.name || item.title}
                  </h3>
                  {(item.description || item.notes) && (
                    <p className="text-muted-foreground text-sm line-clamp-2 mt-1">
                      {item.description || item.notes}
                    </p>
                  )}
                  {item.amount !== undefined && (
                    <p className="text-sm font-medium text-sky-600 mt-1">
                      ¥{item.amount.toFixed(2)} · {item.category}
                    </p>
                  )}
                  {item.dueDate && (
                    <p className="text-xs text-muted-foreground mt-1">
                      截止日期：
                      {new Date(item.dueDate).toLocaleDateString("zh-CN")}
                    </p>
                  )}
                  {item.date && (
                    <p className="text-xs text-muted-foreground mt-1">
                      日期：
                      {new Date(item.date).toLocaleDateString("zh-CN")}
                    </p>
                  )}
                  {item.phone && (
                    <p className="text-xs text-muted-foreground mt-1">
                      {item.phone} · {item.entityName}
                    </p>
                  )}
                </div>
                <Button variant="ghost" size="icon" className="ml-2 shrink-0">
                  <ArrowRight className="w-4 h-4" />
                </Button>
              </div>
            </Card>
          ))}
        </div>
      </div>
    );
  };

  return (
    <ChronosLayout title="搜索结果">
      <div>
        <div className="max-w-6xl mx-auto">
          <div className="mb-8">
            <h1 className="text-3xl font-bold mb-2">搜索结果</h1>
            <p className="text-muted-foreground">
              {keyword
                ? `「${keyword}」的搜索结果`
                : "找到与您的查询匹配的内容"}
            </p>
          </div>

          <Card className="p-6 mb-8 border-gray-200">
            <div className="flex gap-4 flex-wrap">
              <div className="flex-1 min-w-64">
                <label className="block text-sm font-medium mb-2">关键字</label>
                <Input
                  type="text"
                  placeholder="输入关键字..."
                  value={keyword}
                  onChange={e => setKeyword(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && searchQuery.refetch()}
                />
              </div>
              <div className="min-w-48">
                <label className="block text-sm font-medium mb-2">
                  开始日期
                </label>
                <input
                  type="date"
                  value={startDate ? startDate.toISOString().split("T")[0] : ""}
                  onChange={e =>
                    setStartDate(
                      e.target.value ? new Date(e.target.value) : null
                    )
                  }
                  className="w-full px-3 py-2 border border-gray-200 rounded-md"
                />
              </div>
              <div className="min-w-48">
                <label className="block text-sm font-medium mb-2">
                  结束日期
                </label>
                <input
                  type="date"
                  value={endDate ? endDate.toISOString().split("T")[0] : ""}
                  onChange={e =>
                    setEndDate(e.target.value ? new Date(e.target.value) : null)
                  }
                  className="w-full px-3 py-2 border border-gray-200 rounded-md"
                />
              </div>
              <div className="flex items-end">
                <Button
                  onClick={() => searchQuery.refetch()}
                  className="bg-sky-600 hover:bg-sky-700 text-white"
                >
                  搜索
                </Button>
              </div>
            </div>
          </Card>

          {searchQuery.isLoading ? (
            <TableSkeleton rows={6} columns={4} />
          ) : totalResults === 0 ? (
            <EmptyState
              icon={AlertCircle}
              title="未找到结果"
              description="请尝试调整搜索条件或关键字"
            />
          ) : (
            <div>
              {renderSection(
                "成本",
                DollarSign,
                results.costs,
                (cost: any) =>
                  `/projects/${cost.projectId}/costs?highlight=${cost.id}`
              )}
              {renderSection(
                "收入",
                TrendingUp,
                results.revenues,
                (rev: any) =>
                  `/projects/${rev.projectId}/finance?highlight=rev-${rev.id}`
              )}
              {renderSection(
                "费用",
                Receipt,
                results.expenses,
                (exp: any) =>
                  `/projects/${exp.projectId}/finance?highlight=exp-${exp.id}`
              )}
              {renderSection(
                "任务",
                Briefcase,
                results.tasks,
                (task: any) => `/projects/${task.projectId}/tasks`
              )}
              {renderSection(
                "文件",
                FileText,
                results.files,
                (file: any) => `/projects/${file.projectId}/files`
              )}
              {renderSection(
                "项目",
                Folder,
                results.projects,
                (project: any) => `/projects/${project.id}`
              )}
              {renderSection(
                "供应方",
                Users,
                results.vendors,
                (vendor: any) => `/projects/${vendor.projectId}/vendors`
              )}
              {renderSection(
                "销售方",
                Users,
                results.customers,
                (customer: any) => `/projects/${customer.projectId}/sales`
              )}
              {renderSection(
                "联系人",
                Contact,
                results.contacts,
                (contact: any) =>
                  contact.entityType === "vendor"
                    ? `/projects/${contact.entityId}/vendors`
                    : `/projects/${contact.entityId}/sales`,
                (contact: any) => `${contact.entityType}-${contact.id}`
              )}
            </div>
          )}
        </div>
      </div>
    </ChronosLayout>
  );
}
