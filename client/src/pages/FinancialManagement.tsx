import { useParams, useSearch } from "wouter";
import { useLocation } from "wouter";
import { ChronosLayout } from "@/components/ChronosLayout";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/feedback/EmptyState";
import { BarChart3, Calculator } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  TrendingUp,
  TrendingDown,
  Wallet,
  PiggyBank,
  Plus,
  Trash2,
  Pencil,
} from "lucide-react";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "../../../server/routers";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";

type RouterOutputs = inferRouterOutputs<AppRouter>;
type FinanceSummary = RouterOutputs["finance"]["getSummary"];

/** 收入/成本/费用三类记录共享的表格行结构（drizzle schema 三表同构） */
interface FinanceRow {
  id: number;
  name: string;
  amount: number;
  category: string;
  notes: string | null;
  date: string | null;
}

interface FinanceFormData {
  name: string;
  amount: string;
  category: string;
  notes: string;
  date: string;
}

const REVENUE_CATEGORIES = ["销售收入", "服务费", "其他收入"];
const EXPENSE_CATEGORIES = ["办公", "差旅", "工资", "租金", "其他费用"];
const PIE_COLORS = [
  "#0ea5e9",
  "#06b6d4",
  "#14b8a6",
  "#f97316",
  "#ec4899",
  "#8b5cf6",
];

export default function FinancialManagement() {
  const params = useParams();
  const projectId = parseInt(params.projectId || "0", 10);
  const [, navigate] = useLocation();

  const { data: summary, isLoading: summaryLoading } =
    trpc.finance.getSummary.useQuery({ projectId }, { enabled: projectId > 0 });

  // 搜索结果高亮定位
  const search = useSearch();
  const searchParams = new URLSearchParams(search);
  const highlightId = searchParams.get("highlight");

  useEffect(() => {
    if (highlightId) {
      const timer = setTimeout(() => {
        const el = document.querySelector(`[data-highlight="${highlightId}"]`);
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "center" });
          el.classList.add("search-highlight");
          setTimeout(() => el.classList.remove("search-highlight"), 2100);
        }
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [highlightId]);

  return (
    <ChronosLayout title="财务管理">
      <div className="space-y-6">
        <PageHeader
          title="财务管理"
          description="收入 · 成本 · 费用 · 利润"
          breadcrumbs={[
            { label: "仪表盘", href: "/dashboard" },
            { label: "项目", href: `/projects/${projectId}` },
            { label: "财务管理" },
          ]}
          actions={
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="gap-2 bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100"
                onClick={() => navigate(`/projects/${projectId}/bookkeeping`)}
              >
                <Calculator className="w-4 h-4" />
                记账录入
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="gap-2 bg-blue-50 border-blue-200 text-blue-700 hover:bg-blue-100"
                onClick={() =>
                  navigate(`/projects/${projectId}/financial-reports`)
                }
              >
                <BarChart3 className="w-4 h-4" />
                高级报表
              </Button>
            </div>
          }
        />

        {/* Summary Cards */}
        {summaryLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map(i => (
              <Skeleton key={i} className="h-28 rounded-lg" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <SummaryCard
              title="总收入"
              value={summary?.totalRevenue || 0}
              icon={<TrendingUp className="w-5 h-5" />}
              color="green"
              subtitle={`${summary?.revenueCount || 0} 笔`}
            />
            <SummaryCard
              title="总成本"
              value={summary?.totalCost || 0}
              icon={<TrendingDown className="w-5 h-5" />}
              color="coral"
              subtitle={`${summary?.costCount || 0} 笔`}
            />
            <SummaryCard
              title="总费用"
              value={summary?.totalExpense || 0}
              icon={<Wallet className="w-5 h-5" />}
              color="amber"
              subtitle={`${summary?.expenseCount || 0} 笔`}
            />
            <SummaryCard
              title="利润"
              value={summary?.profit || 0}
              icon={<PiggyBank className="w-5 h-5" />}
              color={(summary?.profit ?? 0) >= 0 ? "blue" : "red"}
              subtitle={`利润率 ${(summary?.margin ?? 0).toFixed(1)}%`}
            />
          </div>
        )}

        <Tabs defaultValue="revenue" className="w-full">
          <TabsList className="grid w-full grid-cols-2 sm:grid-cols-4 max-w-md">
            <TabsTrigger value="revenue" className="gap-1">
              <TrendingUp className="w-3.5 h-3.5" /> 收入
            </TabsTrigger>
            <TabsTrigger value="cost" className="gap-1">
              <TrendingDown className="w-3.5 h-3.5" /> 成本
            </TabsTrigger>
            <TabsTrigger value="expense" className="gap-1">
              <Wallet className="w-3.5 h-3.5" /> 费用
            </TabsTrigger>
            <TabsTrigger value="profit" className="gap-1">
              <PiggyBank className="w-3.5 h-3.5" /> 利润看板
            </TabsTrigger>
          </TabsList>

          <TabsContent value="revenue" className="mt-4">
            <RevenueTab projectId={projectId} />
          </TabsContent>
          <TabsContent value="cost" className="mt-4">
            <CostTab projectId={projectId} />
          </TabsContent>
          <TabsContent value="expense" className="mt-4">
            <ExpenseTab projectId={projectId} />
          </TabsContent>
          <TabsContent value="profit" className="mt-4">
            <ProfitDashboard summary={summary} loading={summaryLoading} />
          </TabsContent>
        </Tabs>
      </div>
    </ChronosLayout>
  );
}

function SummaryCard({
  title,
  value,
  icon,
  color,
  subtitle,
}: {
  title: string;
  value: number;
  icon: React.ReactNode;
  color: "green" | "coral" | "amber" | "blue" | "red";
  subtitle?: string;
}) {
  const colorMap = {
    green: "from-green-50 to-green-100 text-green-700 border-green-200",
    coral: "from-orange-50 to-orange-100 text-orange-700 border-orange-200",
    amber: "from-amber-50 to-amber-100 text-amber-700 border-amber-200",
    blue: "from-sky-50 to-sky-100 text-sky-700 border-sky-200",
    red: "from-red-50 to-red-100 text-red-700 border-red-200",
  };
  return (
    <Card className={`bg-gradient-to-br ${colorMap[color]} border`}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium">{title}</CardTitle>
          {icon}
        </div>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">
          ¥
          {value.toLocaleString("zh-CN", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}
        </div>
        {subtitle && <p className="text-xs mt-1 opacity-70">{subtitle}</p>}
      </CardContent>
    </Card>
  );
}

// ===== Revenue Tab =====
function RevenueTab({ projectId }: { projectId: number }) {
  const {
    data: revenues,
    isLoading,
    refetch,
  } = trpc.revenues.getByProject.useQuery(
    { projectId },
    { enabled: projectId > 0 }
  );
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    amount: "",
    category: "销售收入",
    notes: "",
    date: "",
  });

  const createMutation = trpc.revenues.create.useMutation({
    onSuccess: () => {
      toast.success("收入记录已添加");
      resetForm();
      refetch();
    },
  });
  const updateMutation = trpc.revenues.update.useMutation({
    onSuccess: () => {
      toast.success("收入已更新");
      resetForm();
      refetch();
    },
  });
  const deleteMutation = trpc.revenues.delete.useMutation({
    onSuccess: () => {
      toast.success("已删除");
      refetch();
    },
  });

  const resetForm = () => {
    setFormData({
      name: "",
      amount: "",
      category: "销售收入",
      notes: "",
      date: "",
    });
    setEditingId(null);
    setIsDialogOpen(false);
  };
  const total = revenues?.reduce((s, r) => s + r.amount, 0) || 0;

  return (
    <FinanceCard
      title={`收入记录 (${revenues?.length || 0})`}
      total={total}
      totalColor="text-green-600"
      isDialogOpen={isDialogOpen}
      setIsDialogOpen={v => {
        setIsDialogOpen(v);
        if (!v) resetForm();
      }}
      dialogTitle={editingId ? "编辑收入记录" : "添加收入记录"}
      addLabel="添加收入"
      addColor="bg-green-600 hover:bg-green-700"
      isLoading={isLoading}
      rows={revenues}
      onEdit={row => {
        setEditingId(row.id);
        setFormData({
          name: row.name,
          amount: String(row.amount),
          category: row.category,
          notes: row.notes || "",
          date: row.date ? row.date.split("T")[0] : "",
        });
        setIsDialogOpen(true);
      }}
      onDelete={id => deleteMutation.mutate({ id })}
      highlightPrefix="rev-"
    >
      <FinanceForm
        formData={formData}
        setFormData={setFormData}
        categories={REVENUE_CATEGORIES}
        onSubmit={() => {
          if (!formData.name.trim() || !formData.amount) {
            toast.error("请填写名称和金额");
            return;
          }
          if (editingId) {
            updateMutation.mutate({ id: editingId, ...formData });
          } else {
            createMutation.mutate({ projectId, ...formData });
          }
        }}
        pending={createMutation.isPending || updateMutation.isPending}
        submitLabel={editingId ? "保存修改" : "添加收入"}
      />
    </FinanceCard>
  );
}

// ===== Cost Tab =====
function CostTab({ projectId }: { projectId: number }) {
  const {
    data: costs,
    isLoading,
    refetch,
  } = trpc.costs.getByProject.useQuery(
    { projectId },
    { enabled: projectId > 0 }
  );
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    amount: "",
    category: "采购",
    notes: "",
    date: "",
  });

  const createMutation = trpc.costs.create.useMutation({
    onSuccess: () => {
      toast.success("成本记录已添加");
      resetForm();
      refetch();
    },
  });
  const updateMutation = trpc.costs.update.useMutation({
    onSuccess: () => {
      toast.success("成本已更新");
      resetForm();
      refetch();
    },
  });

  const resetForm = () => {
    setFormData({
      name: "",
      amount: "",
      category: "采购",
      notes: "",
      date: "",
    });
    setEditingId(null);
    setIsDialogOpen(false);
  };
  const total = costs?.reduce((s, c) => s + c.amount, 0) || 0;

  return (
    <FinanceCard
      title={`成本记录 (${costs?.length || 0})`}
      total={total}
      totalColor="text-orange-600"
      isDialogOpen={isDialogOpen}
      setIsDialogOpen={v => {
        setIsDialogOpen(v);
        if (!v) resetForm();
      }}
      dialogTitle={editingId ? "编辑成本记录" : "添加成本记录"}
      addLabel="添加成本"
      addColor="bg-orange-600 hover:bg-orange-700"
      isLoading={isLoading}
      rows={costs}
      onEdit={row => {
        setEditingId(row.id);
        setFormData({
          name: row.name,
          amount: String(row.amount),
          category: row.category,
          notes: row.notes || "",
          date: row.date ? row.date.split("T")[0] : "",
        });
        setIsDialogOpen(true);
      }}
      onDelete={() => {}}
    >
      <FinanceForm
        formData={formData}
        setFormData={setFormData}
        categories={["采购", "物流", "人工", "材料", "其他成本"]}
        onSubmit={() => {
          if (!formData.name.trim() || !formData.amount) {
            toast.error("请填写名称和金额");
            return;
          }
          if (editingId) {
            updateMutation.mutate({ id: editingId, ...formData });
          } else {
            createMutation.mutate({ projectId, ...formData });
          }
        }}
        pending={createMutation.isPending || updateMutation.isPending}
        submitLabel={editingId ? "保存修改" : "添加成本"}
      />
    </FinanceCard>
  );
}

// ===== Expense Tab =====
function ExpenseTab({ projectId }: { projectId: number }) {
  const {
    data: expenses,
    isLoading,
    refetch,
  } = trpc.expenses.getByProject.useQuery(
    { projectId },
    { enabled: projectId > 0 }
  );
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    amount: "",
    category: "办公",
    notes: "",
    date: "",
  });

  const createMutation = trpc.expenses.create.useMutation({
    onSuccess: () => {
      toast.success("费用记录已添加");
      resetForm();
      refetch();
    },
  });
  const updateMutation = trpc.expenses.update.useMutation({
    onSuccess: () => {
      toast.success("费用已更新");
      resetForm();
      refetch();
    },
  });
  const deleteMutation = trpc.expenses.delete.useMutation({
    onSuccess: () => {
      toast.success("已删除");
      refetch();
    },
  });

  const resetForm = () => {
    setFormData({
      name: "",
      amount: "",
      category: "办公",
      notes: "",
      date: "",
    });
    setEditingId(null);
    setIsDialogOpen(false);
  };
  const total = expenses?.reduce((s, e) => s + e.amount, 0) || 0;

  return (
    <FinanceCard
      title={`费用记录 (${expenses?.length || 0})`}
      total={total}
      totalColor="text-amber-600"
      isDialogOpen={isDialogOpen}
      setIsDialogOpen={v => {
        setIsDialogOpen(v);
        if (!v) resetForm();
      }}
      dialogTitle={editingId ? "编辑费用记录" : "添加费用记录"}
      addLabel="添加费用"
      addColor="bg-amber-600 hover:bg-amber-700"
      isLoading={isLoading}
      rows={expenses}
      onEdit={row => {
        setEditingId(row.id);
        setFormData({
          name: row.name,
          amount: String(row.amount),
          category: row.category,
          notes: row.notes || "",
          date: row.date ? row.date.split("T")[0] : "",
        });
        setIsDialogOpen(true);
      }}
      onDelete={id => deleteMutation.mutate({ id })}
      highlightPrefix="exp-"
    >
      <FinanceForm
        formData={formData}
        setFormData={setFormData}
        categories={EXPENSE_CATEGORIES}
        onSubmit={() => {
          if (!formData.name.trim() || !formData.amount) {
            toast.error("请填写名称和金额");
            return;
          }
          if (editingId) {
            updateMutation.mutate({ id: editingId, ...formData });
          } else {
            createMutation.mutate({ projectId, ...formData });
          }
        }}
        pending={createMutation.isPending || updateMutation.isPending}
        submitLabel={editingId ? "保存修改" : "添加费用"}
      />
    </FinanceCard>
  );
}

// ===== Profit Dashboard =====
function ProfitDashboard({
  summary,
  loading,
}: {
  summary: FinanceSummary | undefined;
  loading: boolean;
}) {
  if (loading) return <Skeleton className="h-64" />;
  if (!summary)
    return (
      <EmptyState
        icon={BarChart3}
        title="暂无数据"
        description="添加收入、成本或费用记录后，这里会显示利润分析图表。"
      />
    );

  const barData = [
    { name: "收入", amount: summary.totalRevenue, fill: "#22c55e" },
    { name: "成本", amount: summary.totalCost, fill: "#f97316" },
    { name: "费用", amount: summary.totalExpense, fill: "#f59e0b" },
    {
      name: "利润",
      amount: summary.profit,
      fill: (summary.profit ?? 0) >= 0 ? "#0ea5e9" : "#ef4444",
    },
  ];

  const pieData = (obj: Record<string, number>) =>
    Object.entries(obj).map(([name, value]) => ({ name, value }));

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">收支对比</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={barData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis />
              <Tooltip formatter={(v: number) => `¥${v.toFixed(2)}`} />
              <Bar dataKey="amount" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {summary.revenueByCategory &&
          Object.keys(summary.revenueByCategory).length > 0 && (
            <CategoryPie
              title="收入分类"
              data={pieData(summary.revenueByCategory)}
            />
          )}
        {summary.costByCategory &&
          Object.keys(summary.costByCategory).length > 0 && (
            <CategoryPie
              title="成本分类"
              data={pieData(summary.costByCategory)}
            />
          )}
        {summary.expenseByCategory &&
          Object.keys(summary.expenseByCategory).length > 0 && (
            <CategoryPie
              title="费用分类"
              data={pieData(summary.expenseByCategory)}
            />
          )}
      </div>
    </div>
  );
}

function CategoryPie({
  title,
  data,
}: {
  title: string;
  data: { name: string; value: number }[];
}) {
  const total = data.reduce((s, d) => s + d.value, 0);

  // 只显示占比 >= 5% 的 label，避免小扇区文字拥挤
  const renderLabel = (entry: { value?: number }) => {
    const value = entry.value ?? 0;
    const pct = total > 0 ? (value / total) * 100 : 0;
    if (pct < 5) return "";
    return `${pct.toFixed(0)}%`;
  };

  return (
    <Card className="flex flex-col">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">{title}</CardTitle>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col">
        <ResponsiveContainer width="100%" height={220}>
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              innerRadius={55}
              outerRadius={80}
              paddingAngle={2}
              label={renderLabel}
              labelLine={false}
            >
              {data.map((_, i) => (
                <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
              ))}
            </Pie>
            <Tooltip
              formatter={(
                v: number,
                _n: string,
                props?: { payload?: { name?: string } }
              ) => {
                const pct = total > 0 ? ((v / total) * 100).toFixed(1) : "0.0";
                return [`¥${v.toFixed(2)} (${pct}%)`, props?.payload?.name];
              }}
            />
          </PieChart>
        </ResponsiveContainer>

        {/* 自定义图例：可控换行/截断，避免 recharts 图例溢出 */}
        <div className="mt-3 space-y-1.5 max-h-[120px] overflow-y-auto">
          {data.map((item, i) => {
            const pct =
              total > 0 ? ((item.value / total) * 100).toFixed(1) : "0.0";
            return (
              <div
                key={item.name}
                className="flex items-center justify-between text-xs"
                title={`${item.name}：¥${item.value.toFixed(2)} (${pct}%)`}
              >
                <div className="flex items-center gap-1.5 min-w-0">
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{
                      backgroundColor: PIE_COLORS[i % PIE_COLORS.length],
                    }}
                  />
                  <span className="truncate text-muted-foreground">
                    {item.name}
                  </span>
                </div>
                <span className="text-foreground font-medium whitespace-nowrap ml-2">
                  {pct}%
                </span>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

// ===== Shared wrapper card =====
function FinanceCard({
  title,
  total,
  totalColor,
  isDialogOpen,
  setIsDialogOpen,
  dialogTitle,
  addLabel,
  addColor,
  isLoading,
  rows,
  onEdit,
  onDelete,
  children,
  highlightPrefix = "",
}: {
  title: string;
  total: number;
  totalColor: string;
  isDialogOpen: boolean;
  setIsDialogOpen: (v: boolean) => void;
  dialogTitle: string;
  addLabel: string;
  addColor: string;
  isLoading: boolean;
  rows: FinanceRow[] | undefined;
  onEdit: (row: FinanceRow) => void;
  onDelete: (id: number) => void;
  children: React.ReactNode;
  highlightPrefix?: string;
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">{title}</CardTitle>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className={`gap-1 text-white ${addColor}`}>
                <Plus className="w-3.5 h-3.5" /> {addLabel}
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{dialogTitle}</DialogTitle>
              </DialogHeader>
              {children}
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-32" />
        ) : rows && rows.length > 0 ? (
          <>
            <div className="mb-3 text-sm text-muted-foreground">
              合计:{" "}
              <span className={`font-bold ${totalColor}`}>
                ¥{total.toFixed(2)}
              </span>
            </div>
            <FinanceTable
              rows={rows}
              onEdit={onEdit}
              onDelete={onDelete}
              highlightPrefix={highlightPrefix}
            />
          </>
        ) : (
          <EmptyState
            title="暂无记录"
            description="点击右上角按钮添加第一条记录。"
          />
        )}
      </CardContent>
    </Card>
  );
}

function FinanceForm({
  formData,
  setFormData,
  categories,
  onSubmit,
  pending,
  submitLabel,
}: {
  formData: FinanceFormData;
  setFormData: React.Dispatch<React.SetStateAction<FinanceFormData>>;
  categories: string[];
  onSubmit: () => void;
  pending: boolean;
  submitLabel: string;
}) {
  return (
    <div className="space-y-4">
      <div>
        <Label>名称</Label>
        <Input
          placeholder="记录名称"
          value={formData.name}
          onChange={e => setFormData({ ...formData, name: e.target.value })}
        />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <Label>金额</Label>
          <Input
            type="number"
            placeholder="0.00"
            value={formData.amount}
            onChange={e => setFormData({ ...formData, amount: e.target.value })}
          />
        </div>
        <div>
          <Label>分类</Label>
          <select
            className="w-full px-3 py-2 border border-gray-200 rounded-md text-sm bg-white"
            value={formData.category}
            onChange={e =>
              setFormData({ ...formData, category: e.target.value })
            }
          >
            {categories.map(c => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label>日期</Label>
          <Input
            type="date"
            value={formData.date}
            onChange={e => setFormData({ ...formData, date: e.target.value })}
          />
        </div>
      </div>
      <div>
        <Label>备注</Label>
        <Textarea
          placeholder="备注（可选）"
          value={formData.notes}
          onChange={e => setFormData({ ...formData, notes: e.target.value })}
        />
      </div>
      <Button
        onClick={onSubmit}
        disabled={pending}
        className="w-full bg-sky-600 hover:bg-sky-700 text-white"
      >
        {pending ? "保存中..." : submitLabel}
      </Button>
    </div>
  );
}

function FinanceTable({
  rows,
  onEdit,
  onDelete,
  highlightPrefix = "",
}: {
  rows: FinanceRow[];
  onEdit: (row: FinanceRow) => void;
  onDelete: (id: number) => void;
  highlightPrefix?: string;
}) {
  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-12">#</TableHead>
            <TableHead>名称</TableHead>
            <TableHead className="w-20">分类</TableHead>
            <TableHead className="w-28 text-right">金额</TableHead>
            <TableHead className="w-28">日期</TableHead>
            <TableHead className="w-20"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map(row => (
            <TableRow
              key={row.id}
              className="group"
              data-highlight={`${highlightPrefix}${row.id}`}
            >
              <TableCell className="font-mono text-xs text-muted-foreground">
                #{row.id}
              </TableCell>
              <TableCell>
                <div className="font-medium text-sm">{row.name}</div>
                {row.notes && (
                  <div className="text-xs text-muted-foreground line-clamp-1">
                    {row.notes}
                  </div>
                )}
              </TableCell>
              <TableCell>
                <span className="text-xs px-1.5 py-0.5 rounded bg-muted">
                  {row.category}
                </span>
              </TableCell>
              <TableCell className="text-right font-mono text-sm">
                ¥{row.amount.toFixed(2)}
              </TableCell>
              <TableCell className="text-xs text-muted-foreground">
                {row.date
                  ? new Date(row.date).toLocaleDateString("zh-CN")
                  : "-"}
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-sky-600"
                    title="编辑"
                    onClick={() => onEdit(row)}
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-red-600"
                    title="删除"
                    onClick={() => {
                      if (confirm("确认删除？")) onDelete(row.id);
                    }}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
