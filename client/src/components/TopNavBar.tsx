import React, { useState, useRef, useEffect } from "react";
import type { SearchResults } from "../../../server/routers/search";
import {
  Search,
  Moon,
  Sun,
  Calendar,
  X,
  ArrowRight,
  DollarSign,
  Briefcase,
  Folder,
  Users,
  Contact,
  CreditCard,
  Bell,
  TrendingUp,
  Receipt,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useTheme } from "@/contexts/ThemeContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { useLocation } from "wouter";
import { useCurrentWorkspace } from "@/hooks/useCurrentWorkspace";

export default function TopNavBar() {
  const [keyword, setKeyword] = useState("");
  const [startDate, setStartDate] = useState<Date | null>(null);
  const [endDate, setEndDate] = useState<Date | null>(null);
  const [showResults, setShowResults] = useState(false);
  // 当前工作区与 WorkspaceSwitcher 同源（localStorage currentWorkspaceId），
  // 不再取 workspaces[0] 造成两处"当前工作区"真相
  const { current: currentWorkspace } = useCurrentWorkspace();
  const currentWs = currentWorkspace?.name || "默认工作区";
  // 项目上下文：优先 URL，其次当前工作区第一个真实项目（不再硬编码 "1"）
  const { data: projects } = trpc.projects.list.useQuery();
  const [debouncedKeyword, setDebouncedKeyword] = useState("");
  const { theme, toggleTheme } = useTheme();
  const [results, setResults] = useState<SearchResults>({
    tasks: [],
    projects: [],
    files: [],
    vendors: [],
    customers: [],
    contacts: [],
    costs: [],
    revenues: [],
    expenses: [],
  });
  const searchRef = useRef<HTMLDivElement>(null);
  const [, navigate] = useLocation();

  const searchQuery = trpc.search.global.useQuery(
    {
      keyword: debouncedKeyword || undefined,
      startDate: startDate || undefined,
      endDate: endDate || undefined,
      limit: 10,
    },
    {
      enabled: keyword.length > 0 || startDate !== null || endDate !== null,
    }
  );

  // debounce: wait 300ms after last keystroke before querying backend
  useEffect(() => {
    const t = setTimeout(() => setDebouncedKeyword(keyword), 300);
    return () => clearTimeout(t);
  }, [keyword]);

  useEffect(() => {
    if (searchQuery.data) {
      setResults(searchQuery.data);
      setShowResults(true);
    }
  }, [searchQuery.data]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        searchRef.current &&
        !searchRef.current.contains(event.target as Node)
      ) {
        setShowResults(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleClearSearch = () => {
    setKeyword("");
    setStartDate(null);
    setEndDate(null);
    setShowResults(false);
  };

  const handleViewAll = () => {
    const params = new URLSearchParams();
    if (keyword) params.set("keyword", keyword);
    if (startDate)
      params.set("startDate", startDate.toISOString().split("T")[0]);
    if (endDate) params.set("endDate", endDate.toISOString().split("T")[0]);
    navigate(`/search?${params.toString()}`);
    setShowResults(false);
  };

  const goTo = (path: string) => {
    navigate(path);
    setShowResults(false);
  };

  const totalResults =
    (results.tasks?.length || 0) +
    (results.projects?.length || 0) +
    (results.vendors?.length || 0) +
    (results.customers?.length || 0) +
    (results.contacts?.length || 0) +
    (results.costs?.length || 0) +
    (results.revenues?.length || 0) +
    (results.expenses?.length || 0);

  return (
    <div className="border-b border-gray-200 bg-white sticky top-0 z-40 shadow-sm">
      <div className="flex items-center justify-between px-3 sm:px-6 py-3 sm:py-4 gap-2">
        <div className="flex-1 max-w-2xl" ref={searchRef}>
          <div className="relative">
            <div className="flex gap-2 items-center">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
                <Input
                  type="text"
                  placeholder="搜索任务、项目、成本、财务、供应商、客户、联系人..."
                  value={keyword}
                  onChange={e => setKeyword(e.target.value)}
                  onFocus={() => keyword && setShowResults(true)}
                  onKeyDown={e => e.key === "Enter" && handleViewAll()}
                  className="pl-10 pr-8"
                />
                {keyword && (
                  <button
                    onClick={handleClearSearch}
                    className="absolute right-3 top-1/2 transform -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
              <div className="flex gap-2 shrink-0">
                <div className="hidden sm:flex items-center text-xs font-medium bg-sky-50 text-sky-700 px-2 py-1 rounded border border-sky-200">
                  {currentWs}
                </div>
                <button
                  onClick={toggleTheme}
                  className="p-2 rounded-lg hover:bg-gray-100 text-gray-600 transition-colors"
                  title={theme === "dark" ? "切换浅色" : "切换深色"}
                >
                  {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
                </button>
                <input
                  type="date"
                  value={startDate ? startDate.toISOString().split("T")[0] : ""}
                  onChange={e =>
                    setStartDate(
                      e.target.value ? new Date(e.target.value) : null
                    )
                  }
                  className="px-3 py-2 border border-gray-200 rounded-md text-sm"
                  title="开始日期"
                />
                <input
                  type="date"
                  value={endDate ? endDate.toISOString().split("T")[0] : ""}
                  onChange={e =>
                    setEndDate(e.target.value ? new Date(e.target.value) : null)
                  }
                  className="px-3 py-2 border border-gray-200 rounded-md text-sm"
                  title="结束日期"
                />
              </div>
            </div>

            {showResults && (
              <Card className="absolute top-full left-0 right-0 mt-2 max-h-[60vh] sm:max-h-96 overflow-y-auto shadow-lg z-50">
                {searchQuery.isLoading ? (
                  <div className="p-4 text-center text-muted-foreground">
                    搜索中...
                  </div>
                ) : totalResults === 0 ? (
                  <div className="p-4 text-center text-muted-foreground">
                    没有找到相关内容
                  </div>
                ) : (
                  <div>
                    {results.costs && results.costs.length > 0 && (
                      <div className="border-b border-gray-200">
                        <div className="px-4 py-2 bg-gray-100 text-sm font-semibold flex items-center gap-2">
                          <DollarSign className="w-4 h-4" /> 成本 (
                          {results.costs.length})
                        </div>
                        {results.costs.map(cost => (
                          <button
                            key={cost.id}
                            onClick={() =>
                              goTo(
                                `/projects/${cost.projectId}/costs?highlight=${cost.id}`
                              )
                            }
                            className="w-full text-left px-4 py-2 hover:bg-gray-100 transition-colors"
                          >
                            <div className="font-medium text-sm">
                              {cost.name}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              ¥{(cost.amount ?? 0).toFixed(2)} · {cost.category}
                              {cost.date && (
                                <span className="ml-1">
                                  ·{" "}
                                  {new Date(cost.date).toLocaleDateString(
                                    "zh-CN"
                                  )}
                                </span>
                              )}
                            </div>
                          </button>
                        ))}
                      </div>
                    )}

                    {results.revenues.length > 0 && (
                      <div className="border-b border-gray-200">
                        <div className="px-4 py-2 bg-gray-100 text-sm font-semibold flex items-center gap-2">
                          <TrendingUp className="w-4 h-4 text-green-600" /> 收入
                          ({results.revenues.length})
                        </div>
                        {results.revenues.map(rev => (
                          <button
                            key={rev.id}
                            onClick={() =>
                              goTo(
                                `/projects/${rev.projectId}/finance?highlight=rev-${rev.id}`
                              )
                            }
                            className="w-full text-left px-4 py-2 hover:bg-gray-100 transition-colors"
                          >
                            <div className="font-medium text-sm">
                              {rev.name}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              ¥{(rev.amount ?? 0).toFixed(2)} · {rev.category}
                              {rev.date && (
                                <span className="ml-1">
                                  ·{" "}
                                  {new Date(rev.date).toLocaleDateString(
                                    "zh-CN"
                                  )}
                                </span>
                              )}
                            </div>
                          </button>
                        ))}
                      </div>
                    )}

                    {results.expenses.length > 0 && (
                      <div className="border-b border-gray-200">
                        <div className="px-4 py-2 bg-gray-100 text-sm font-semibold flex items-center gap-2">
                          <Receipt className="w-4 h-4 text-amber-600" /> 费用 (
                          {results.expenses.length})
                        </div>
                        {results.expenses.map(exp => (
                          <button
                            key={exp.id}
                            onClick={() =>
                              goTo(
                                `/projects/${exp.projectId}/finance?highlight=exp-${exp.id}`
                              )
                            }
                            className="w-full text-left px-4 py-2 hover:bg-gray-100 transition-colors"
                          >
                            <div className="font-medium text-sm">
                              {exp.name}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              ¥{(exp.amount ?? 0).toFixed(2)} · {exp.category}
                              {exp.date && (
                                <span className="ml-1">
                                  ·{" "}
                                  {new Date(exp.date).toLocaleDateString(
                                    "zh-CN"
                                  )}
                                </span>
                              )}
                            </div>
                          </button>
                        ))}
                      </div>
                    )}

                    {results.tasks.length > 0 && (
                      <div className="border-b border-gray-200">
                        <div className="px-4 py-2 bg-gray-100 text-sm font-semibold flex items-center gap-2">
                          <Briefcase className="w-4 h-4" /> 任务 (
                          {results.tasks.length})
                        </div>
                        {results.tasks.map(task => (
                          <button
                            key={task.id}
                            onClick={() =>
                              goTo(
                                `/projects/${task.projectId}/tasks?highlight=${task.id}`
                              )
                            }
                            className="w-full text-left px-4 py-2 hover:bg-gray-100 transition-colors"
                          >
                            <div className="font-medium text-sm">
                              {task.title}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {task.dueDate &&
                                new Date(task.dueDate).toLocaleDateString(
                                  "zh-CN"
                                )}
                            </div>
                          </button>
                        ))}
                      </div>
                    )}

                    {results.projects.length > 0 && (
                      <div className="border-b border-gray-200">
                        <div className="px-4 py-2 bg-gray-100 text-sm font-semibold flex items-center gap-2">
                          <Folder className="w-4 h-4" /> 项目 (
                          {results.projects.length})
                        </div>
                        {results.projects.map(project => (
                          <button
                            key={project.id}
                            onClick={() => goTo(`/projects/${project.id}`)}
                            className="w-full text-left px-4 py-2 hover:bg-gray-100 transition-colors"
                          >
                            <div className="font-medium text-sm">
                              {project.name}
                            </div>
                          </button>
                        ))}
                      </div>
                    )}

                    {results.vendors.length > 0 && (
                      <div className="border-b border-gray-200">
                        <div className="px-4 py-2 bg-gray-100 text-sm font-semibold flex items-center gap-2">
                          <Users className="w-4 h-4" /> 供应方 (
                          {results.vendors.length})
                        </div>
                        {results.vendors.map(vendor => (
                          <button
                            key={vendor.id}
                            onClick={() =>
                              goTo(
                                `/projects/${vendor.projectId}/vendors?highlight=${vendor.id}`
                              )
                            }
                            className="w-full text-left px-4 py-2 hover:bg-gray-100 transition-colors"
                          >
                            <div className="font-medium text-sm">
                              {vendor.name}
                            </div>
                          </button>
                        ))}
                      </div>
                    )}

                    {results.customers.length > 0 && (
                      <div className="border-b border-gray-200">
                        <div className="px-4 py-2 bg-gray-100 text-sm font-semibold flex items-center gap-2">
                          <CreditCard className="w-4 h-4" /> 销售方 (
                          {results.customers.length})
                        </div>
                        {results.customers.map(customer => (
                          <button
                            key={customer.id}
                            onClick={() =>
                              goTo(
                                `/projects/${customer.projectId}/sales?highlight=${customer.id}`
                              )
                            }
                            className="w-full text-left px-4 py-2 hover:bg-gray-100 transition-colors"
                          >
                            <div className="font-medium text-sm">
                              {customer.name}
                            </div>
                            {customer.description && (
                              <div className="text-xs text-muted-foreground">
                                {customer.description}
                              </div>
                            )}
                          </button>
                        ))}
                      </div>
                    )}

                    {results.contacts.length > 0 && (
                      <div className="border-b border-gray-200">
                        <div className="px-4 py-2 bg-gray-100 text-sm font-semibold flex items-center gap-2">
                          <Contact className="w-4 h-4" /> 联系人 (
                          {results.contacts.length})
                        </div>
                        {results.contacts.map(contact => (
                          <button
                            key={`${contact.entityType}-${contact.id}`}
                            onClick={() =>
                              goTo(
                                contact.entityType === "vendor"
                                  ? `/projects/${contact.entityId}/vendors`
                                  : `/projects/${contact.entityId}/sales`
                              )
                            }
                            className="w-full text-left px-4 py-2 hover:bg-gray-100 transition-colors"
                          >
                            <div className="font-medium text-sm">
                              {contact.name}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {contact.phone} · {contact.entityName}
                            </div>
                          </button>
                        ))}
                      </div>
                    )}

                    <button
                      onClick={handleViewAll}
                      className="w-full text-left px-4 py-2 text-sm text-sky-600 font-medium hover:bg-gray-100 transition-colors flex items-center justify-between"
                    >
                      <span>查看全部搜索结果</span>
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </Card>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-4 ml-2 sm:ml-6 shrink-0">
          <NotificationBell />
          <Button
            variant="ghost"
            size="sm"
            title="成员与伙伴"
            onClick={() => {
              const match = window.location.pathname.match(/\/projects\/(\d+)/);
              const pid = match?.[1] ?? projects?.[0]?.id?.toString();
              if (!pid) return;
              navigate(`/projects/${pid}/members`);
            }}
          >
            <Contact className="w-4 h-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            title="项目日历"
            onClick={() => {
              const match = window.location.pathname.match(/\/projects\/(\d+)/);
              const pid = match?.[1] ?? projects?.[0]?.id?.toString();
              if (!pid) return;
              navigate(`/projects/${pid}/calendar`);
            }}
          >
            <Calendar className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

/** 通知铃铛组件 — workspace 维度：聚合当前工作区下所有项目的通知 */
function NotificationBell() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const [, navigate] = useLocation();
  const { current: currentWorkspace } = useCurrentWorkspace();
  const wsReady = !!currentWorkspace;

  const { data: count, refetch: refetchCount } =
    trpc.notifications.getWorkspaceUnreadCount.useQuery(undefined, {
      enabled: wsReady,
    });
  const { data: items, refetch: refetchItems } =
    trpc.notifications.getByWorkspace.useQuery(undefined, {
      enabled: open && wsReady,
    });

  useEffect(() => {
    function click(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node))
        setOpen(false);
    }
    document.addEventListener("mousedown", click);
    return () => document.removeEventListener("mousedown", click);
  }, []);

  const mark = trpc.notifications.markRead.useMutation({
    onSuccess: () => {
      refetchCount();
      refetchItems();
    },
  });
  const markAll = trpc.notifications.markAllReadByWorkspace.useMutation({
    onSuccess: () => {
      refetchCount();
      refetchItems();
    },
  });

  const unread = count ?? 0;

  return (
    <div ref={ref} className="relative">
      <Button
        variant="ghost"
        size="sm"
        title="通知"
        onClick={() => {
          setOpen(!open);
          if (!open) refetchItems();
        }}
      >
        <Bell className="w-4 h-4" />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 bg-red-500 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center font-bold">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </Button>

      {open && (
        <Card className="absolute right-0 top-full mt-2 w-[calc(100vw-2rem)] sm:w-80 max-h-96 overflow-y-auto shadow-lg z-50">
          <div className="p-3 border-b border-gray-200 flex items-center justify-between">
            <span className="font-semibold text-sm">通知</span>
            {unread > 0 && (
              <button
                className="text-xs text-sky-600 hover:underline"
                onClick={() => markAll.mutate()}
              >
                全部标为已读
              </button>
            )}
          </div>
          {!items || items.length === 0 ? (
            <div className="p-6 text-center text-muted-foreground text-sm">
              暂无通知
            </div>
          ) : (
            items.slice(0, 20).map(n => (
              <button
                key={n.id}
                className={`w-full text-left px-3 py-2.5 border-b border-gray-100 hover:bg-gray-50 transition-colors ${!n.read ? "bg-sky-50" : ""}`}
                onClick={() => {
                  if (!n.read) mark.mutate({ id: n.id });
                  if (n.link) {
                    navigate(n.link);
                    setOpen(false);
                  }
                }}
              >
                <div className="flex items-start gap-2">
                  <div className="flex-1 min-w-0">
                    <span className="text-xs font-semibold block truncate">
                      {n.title}
                    </span>
                    {n.body && (
                      <span className="text-xs text-muted-foreground block truncate">
                        {n.body}
                      </span>
                    )}
                    <span className="text-xs text-gray-400">
                      {new Date(n.createdAt).toLocaleString("zh-CN")}
                    </span>
                  </div>
                  {!n.read && (
                    <div className="w-2 h-2 rounded-full bg-sky-600 mt-1.5 shrink-0" />
                  )}
                </div>
              </button>
            ))
          )}
        </Card>
      )}
    </div>
  );
}
