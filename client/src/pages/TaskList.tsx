import { useParams, useSearch } from "wouter";
import { useEffect } from "react";
import { ChronosLayout } from "@/components/ChronosLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { TableSkeleton } from "@/components/feedback/LoadingSkeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DataTableColumnHeader } from "@/components/data-table/column-header";
import { DataTablePagination } from "@/components/data-table/pagination";
import { DataTableToolbar } from "@/components/data-table/toolbar";
import { DataTableFacetedFilter } from "@/components/data-table/faceted-filter";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";
import { useState, useMemo } from "react";
import { toast } from "sonner";
import {
  Plus,
  MoreHorizontal,
  Upload,
  Trash2,
  Edit,
  Download,
} from "lucide-react";
import {
  useReactTable,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  getFacetedUniqueValues,
  type ColumnDef,
  type SortingState,
  type ColumnFiltersState,
  type VisibilityState,
} from "@tanstack/react-table";

const PRIORITY_MAP: Record<
  string,
  { label: string; color: string; icon: string }
> = {
  urgent: {
    label: "紧急",
    color: "text-red-600 bg-red-50 border-red-200",
    icon: "⬆",
  },
  high: {
    label: "高",
    color: "text-orange-600 bg-orange-50 border-orange-200",
    icon: "⬆",
  },
  medium: {
    label: "中",
    color: "text-blue-600 bg-blue-50 border-blue-200",
    icon: "➡",
  },
  low: {
    label: "低",
    color: "text-gray-600 bg-gray-50 border-gray-200",
    icon: "⬇",
  },
};
const STATUS_MAP: Record<string, { label: string; color: string }> = {
  待办: { label: "待办", color: "text-sky-600 bg-sky-50 border-sky-200" },
  进行中: {
    label: "进行中",
    color: "text-amber-600 bg-amber-50 border-amber-200",
  },
  已完成: {
    label: "已完成",
    color: "text-green-600 bg-green-50 border-green-200",
  },
};

export default function TaskList() {
  const params = useParams();
  const projectId = parseInt(params.projectId || "0", 10);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [editTask, setEditTask] = useState<any>(null);
  const [formData, setFormData] = useState({
    title: "",
    description: "",
    priority: "medium",
  });
  const [importText, setImportText] = useState("");
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const [rowSelection, setRowSelection] = useState({});

  const {
    data: tasks,
    isLoading,
    refetch,
  } = trpc.tasks.getByProject.useQuery(
    { projectId },
    { enabled: projectId > 0 }
  );
  const { data: columns } = trpc.kanban.getColumns.useQuery(
    { projectId },
    { enabled: projectId > 0 }
  );
  const columnMap = useMemo(() => {
    const m: Record<number, string> = {};
    columns?.forEach(c => {
      m[c.id] = c.name;
    });
    return m;
  }, [columns]);

  // 搜索结果高亮定位（必须在所有条件 return 之前调用）
  const search = useSearch();
  const searchParams = new URLSearchParams(search);
  const highlightId = searchParams.get("highlight");

  useEffect(() => {
    if (highlightId && tasks?.length) {
      const timer = setTimeout(() => {
        const el = document.querySelector(`[data-highlight="${highlightId}"]`);
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "center" });
          el.classList.add("search-highlight");
          setTimeout(() => el.classList.remove("search-highlight"), 2100);
        }
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [highlightId, tasks]);

  const createMutation = trpc.tasks.create.useMutation({
    onSuccess: () => {
      toast.success("任务创建成功");
      setIsCreateOpen(false);
      setFormData({ title: "", description: "", priority: "medium" });
      setEditTask(null);
      refetch();
    },
  });
  const updateMutation = trpc.tasks.update.useMutation({
    onSuccess: () => {
      toast.success("任务已更新");
      setIsCreateOpen(false);
      setEditTask(null);
      setFormData({ title: "", description: "", priority: "medium" });
      refetch();
    },
  });
  const deleteMutation = trpc.tasks.delete.useMutation({
    onSuccess: () => {
      toast.success("任务已删除");
      refetch();
    },
  });

  const firstColumnId = columns?.[0]?.id || 0;

  const tableColumns = useMemo<ColumnDef<any>[]>(
    () => [
      {
        id: "select",
        header: ({ table }) => (
          <Checkbox
            checked={table.getIsAllPageRowsSelected()}
            onCheckedChange={value => table.toggleAllPageRowsSelected(!!value)}
            aria-label="全选"
          />
        ),
        cell: ({ row }) => (
          <Checkbox
            checked={row.getIsSelected()}
            onCheckedChange={value => row.toggleSelected(!!value)}
            aria-label="选择行"
          />
        ),
        enableSorting: false,
        enableHiding: false,
        size: 40,
      },
      {
        accessorKey: "id",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="编号" />
        ),
        cell: ({ row }) => (
          <span className="font-mono text-xs text-muted-foreground">
            任务-{row.original.id}
          </span>
        ),
        size: 70,
      },
      {
        accessorKey: "title",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="标题" />
        ),
        cell: ({ row }) => (
          <div>
            <div className="font-medium text-sm">{row.original.title}</div>
            {row.original.description && (
              <div className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                {row.original.description}
              </div>
            )}
          </div>
        ),
      },
      {
        accessorKey: "status",
        header: "状态",
        cell: ({ row }) => {
          const n = columnMap[row.original.columnId] || "";
          const s = STATUS_MAP[n] || { label: n || "未知", color: "bg-muted" };
          return (
            <Badge variant="outline" className={`text-xs ${s.color}`}>
              {s.label}
            </Badge>
          );
        },
        filterFn: (row, id, value) => {
          const n = columnMap[row.original.columnId] || "";
          return !value?.length || value.includes(n);
        },
        size: 90,
      },
      {
        accessorKey: "priority",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="优先级" />
        ),
        cell: ({ row }) => {
          const p = PRIORITY_MAP[row.original.priority || "medium"];
          return (
            <span
              className={`inline-flex items-center gap-0.5 text-xs px-1.5 py-0.5 rounded border ${p.color}`}
            >
              {p.icon} {p.label}
            </span>
          );
        },
        filterFn: (row, id, value) =>
          !value?.length || value.includes(row.original.priority),
        size: 70,
      },
      {
        accessorKey: "updatedAt",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="更新" />
        ),
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground">
            {row.original.updatedAt
              ? new Date(row.original.updatedAt).toLocaleDateString("zh-CN")
              : ""}
          </span>
        ),
        size: 110,
      },
      {
        id: "actions",
        cell: ({ row }) => (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <MoreHorizontal className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>任务操作</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => {
                  setEditTask(row.original);
                  setFormData({
                    title: row.original.title,
                    description: row.original.description || "",
                    priority: row.original.priority || "medium",
                  });
                  setIsCreateOpen(true);
                }}
              >
                <Edit className="w-4 h-4 mr-2" /> 编辑
              </DropdownMenuItem>
              <DropdownMenuItem
                className="text-destructive"
                onClick={() => {
                  if (confirm(`确认删除任务「${row.original.title}」？`))
                    deleteMutation.mutate({ taskId: row.original.id });
                }}
              >
                <Trash2 className="w-4 h-4 mr-2" /> 删除
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ),
        enableSorting: false,
        enableHiding: false,
        size: 50,
      },
    ],
    [columnMap, deleteMutation]
  );

  const table = useReactTable({
    data: tasks || [],
    columns: tableColumns,
    state: { sorting, columnFilters, columnVisibility, rowSelection },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    onRowSelectionChange: setRowSelection,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getFacetedUniqueValues: getFacetedUniqueValues(),
    initialState: { pagination: { pageSize: 10 } },
  });

  const handleSave = () => {
    if (!formData.title.trim()) return;
    if (editTask)
      updateMutation.mutate({
        taskId: editTask.id,
        title: formData.title,
        description: formData.description,
        priority: formData.priority as "low" | "medium" | "high" | "urgent",
      });
    else
      createMutation.mutate({
        projectId,
        columnId: firstColumnId,
        title: formData.title,
        description: formData.description,
        priority: formData.priority as any,
        order: (tasks?.length || 0) + 1,
      });
  };
  const handleBulkDelete = () => {
    const ids = table.getSelectedRowModel().rows.map(r => r.original.id);
    if (!ids.length) return;
    if (!confirm(`确认删除选中的 ${ids.length} 个任务？`)) return;
    ids.forEach(id => deleteMutation.mutate({ taskId: id }));
    toast.success(`已删除 ${ids.length} 个任务`);
    setRowSelection({});
    setTimeout(refetch, 500);
  };
  const csvEscape = (v: any): string => {
    const s = String(v ?? "");
    // v4.2: CSV公式注入防护 — =,+,−,@ 开头加单引号前缀
    const safe = /^[=+\-@]/.test(s) ? "'" + s : s;
    if (safe.includes(",") || safe.includes('"') || safe.includes("\n")) {
      return '"' + safe.replace(/"/g, '""') + '"';
    }
    return safe;
  };
  const handleExportCSV = () => {
    const data = table.getFilteredRowModel().rows;
    if (!data.length) {
      toast.info("没有可导出的任务");
      return;
    }
    const header = "ID,标题,描述,状态,优先级,最后更新\n";
    const rows = data
      .map(
        row =>
          `${row.original.id},${row.original.title},${csvEscape(row.original.description)},${columnMap[row.original.columnId] || ""},${PRIORITY_MAP[row.original.priority || "medium"]?.label || ""},${row.original.updatedAt}`
      )
      .join("\n");
    const blob = new Blob([header + rows], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `任务列表_${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("CSV 已下载");
  };
  const handleImportCSV = () => {
    const lines = importText.trim().split("\n");
    if (lines.length < 2) {
      toast.error("CSV 至少需要标题行 + 一行数据");
      return;
    }
    // RFC 4180 CSV parser
    const csvParse = (line: string): string[] => {
      const r: string[] = [];
      let field = "";
      let quoted = false;
      for (let j = 0; j < line.length; j++) {
        const c = line[j];
        if (quoted) {
          if (c === '"') {
            if (j + 1 < line.length && line[j + 1] === '"') {
              field += '"';
              j++;
            } else quoted = false;
          } else field += c;
        } else {
          if (c === '"') quoted = true;
          else if (c === ",") {
            r.push(field.trim());
            field = "";
          } else field += c;
        }
      }
      r.push(field.trim());
      return r;
    };
    const headers = csvParse(lines[0]);
    let count = 0;
    for (let i = 1; i < lines.length; i++) {
      const vals = csvParse(lines[i]);
      const row: Record<string, string> = {};
      headers.forEach((h, j) => {
        row[h] = vals[j] || "";
      });
      const title = row["标题"] || row["title"] || "";
      if (!title) continue;
      createMutation.mutate({
        projectId,
        columnId: firstColumnId,
        title,
        description: row["描述"] || row["description"] || "",
        priority: ["urgent", "high", "medium", "low"].includes(
          row["优先级"] || row["priority"] || ""
        )
          ? ((row["优先级"] || row["priority"]) as any)
          : "medium",
        order: (tasks?.length || 0) + count + 1,
      });
      count++;
    }
    toast.success(`已导入 ${count} 条任务`);
    setIsImportOpen(false);
    setImportText("");
    setTimeout(refetch, 500);
  };

  const statusOptions =
    columns?.map(c => ({ label: c.name, value: c.name })) || [];
  const priorityOptions = Object.entries(PRIORITY_MAP).map(
    ([value, { label }]) => ({ label, value })
  );

  if (isLoading)
    return (
      <ChronosLayout title="任务列表">
        <div className="p-6">
          <TableSkeleton rows={8} columns={6} />
        </div>
      </ChronosLayout>
    );

  return (
    <ChronosLayout title="任务列表">
      <div className="space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h1 className="text-3xl font-bold text-foreground">任务列表</h1>
            <p className="text-muted-foreground text-sm mt-1">
              共 {table.getFilteredRowModel().rows.length} 条任务
            </p>
          </div>
          <div className="flex gap-2">
            <Dialog open={isImportOpen} onOpenChange={setIsImportOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm" className="gap-1">
                  <Upload className="w-3.5 h-3.5" /> 导入
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>CSV 导入任务</DialogTitle>
                  <DialogDescription>
                    粘贴 CSV 内容。格式：标题,描述,优先级（每行一条）
                  </DialogDescription>
                </DialogHeader>
                <Textarea
                  className="min-h-32 font-mono text-xs"
                  placeholder="标题,描述,优先级&#10;设计首页,完成线框图,medium"
                  value={importText}
                  onChange={e => setImportText(e.target.value)}
                />
                <Button onClick={handleImportCSV}>批量导入</Button>
              </DialogContent>
            </Dialog>
            <Button
              variant="outline"
              size="sm"
              className="gap-1"
              onClick={handleExportCSV}
            >
              <Download className="w-3.5 h-3.5" /> 导出
            </Button>
            <Dialog
              open={isCreateOpen}
              onOpenChange={v => {
                setIsCreateOpen(v);
                if (!v) {
                  setEditTask(null);
                  setFormData({
                    title: "",
                    description: "",
                    priority: "medium",
                  });
                }
              }}
            >
              <DialogTrigger asChild>
                <Button
                  size="sm"
                  className="gap-1 bg-sky-600 hover:bg-sky-700 text-white"
                >
                  <Plus className="w-3.5 h-3.5" /> 创建任务
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>
                    {editTask ? "编辑任务" : "创建任务"}
                  </DialogTitle>
                </DialogHeader>
                <div className="space-y-3 pt-2">
                  <div>
                    <Label>标题</Label>
                    <Input
                      value={formData.title}
                      onChange={e =>
                        setFormData({ ...formData, title: e.target.value })
                      }
                      placeholder="任务标题"
                    />
                  </div>
                  <div>
                    <Label>描述</Label>
                    <Textarea
                      value={formData.description}
                      onChange={e =>
                        setFormData({
                          ...formData,
                          description: e.target.value,
                        })
                      }
                      placeholder="任务描述（可选）"
                    />
                  </div>
                  <div>
                    <Label>优先级</Label>
                    <Select
                      value={formData.priority}
                      onValueChange={v =>
                        setFormData({ ...formData, priority: v })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="low">低</SelectItem>
                        <SelectItem value="medium">中</SelectItem>
                        <SelectItem value="high">高</SelectItem>
                        <SelectItem value="urgent">紧急</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Button
                    className="w-full"
                    onClick={handleSave}
                    disabled={createMutation.isPending}
                  >
                    {createMutation.isPending
                      ? "保存中..."
                      : editTask
                        ? "保存修改"
                        : "创建任务"}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        <DataTableToolbar
          table={table}
          searchPlaceholder="搜索标题..."
          searchColumn="title"
        >
          {statusOptions.length > 0 && (
            <DataTableFacetedFilter
              column={table.getColumn("status")}
              title="状态"
              options={statusOptions}
            />
          )}
          <DataTableFacetedFilter
            column={table.getColumn("priority")}
            title="优先级"
            options={priorityOptions}
          />
        </DataTableToolbar>

        {Object.keys(rowSelection).length > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">
              已选 {Object.keys(rowSelection).length} 项
            </span>
            <Button variant="destructive" size="sm" onClick={handleBulkDelete}>
              <Trash2 className="w-3.5 h-3.5 mr-1" /> 批量删除
            </Button>
          </div>
        )}

        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <Table>
              <TableHeader>
                {table.getHeaderGroups().map(hg => (
                  <TableRow key={hg.id}>
                    {hg.headers.map(header => (
                      <TableHead
                        key={header.id}
                        style={{
                          width:
                            header.getSize() !== 150
                              ? header.getSize()
                              : undefined,
                        }}
                      >
                        {header.isPlaceholder
                          ? null
                          : typeof header.column.columnDef.header === "function"
                            ? (header.column.columnDef.header as any)(
                                header.getContext()
                              )
                            : header.column.columnDef.header}
                      </TableHead>
                    ))}
                  </TableRow>
                ))}
              </TableHeader>
              <TableBody>
                {table.getRowModel().rows?.length ? (
                  table.getRowModel().rows.map(row => (
                    <TableRow
                      key={row.id}
                      data-highlight={row.original.id}
                      data-state={row.getIsSelected() && "selected"}
                    >
                      {row.getVisibleCells().map(cell => (
                        <TableCell key={cell.id}>
                          {typeof cell.column.columnDef.cell === "function"
                            ? (cell.column.columnDef.cell as any)(
                                cell.getContext()
                              )
                            : cell.column.columnDef.cell}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell
                      colSpan={7}
                      className="h-32 text-center text-muted-foreground"
                    >
                      暂无任务，点击「创建任务」开始
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
        <DataTablePagination table={table} />
      </div>
    </ChronosLayout>
  );
}
