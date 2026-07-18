import { useParams } from "wouter";
import { useLocation } from "wouter";
import { ChronosLayout } from "@/components/ChronosLayout";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  BarChart3,
  Scale,
  FileText,
  Wallet,
  PieChart as PieIcon,
  Gauge,
  Target,
  Upload,
  Lock,
  Download,
  Sprout,
  ArrowRight,
  CheckCircle2,
  Clock,
  Calculator,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
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
  Legend,
} from "recharts";

const PIE_COLORS = [
  "#0ea5e9",
  "#06b6d4",
  "#14b8a6",
  "#f97316",
  "#ec4899",
  "#8b5cf6",
];

function fmt(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return "—";
  return n.toLocaleString("zh-CN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function downloadCsv(filename: string, csv: string) {
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function FinancialReports() {
  const params = useParams();
  const projectId = parseInt(params.projectId || "0", 10);
  const [, navigate] = useLocation();

  const now = new Date();
  const year = now.getFullYear();
  const [asOf, setAsOf] = useState(`${year}-12-31`);
  const [start, setStart] = useState(`${year}-01-01`);
  const [end, setEnd] = useState(`${year}-12-31`);
  const [period, setPeriod] = useState(`${year}-12`);

  const enabled = projectId > 0;
  const q = { projectId, asOf, start, end };

  const trial = trpc.financialReports.trialBalance.useQuery(q, { enabled });
  const bs = trpc.financialReports.balanceSheet.useQuery(q, { enabled });
  const inc = trpc.financialReports.incomeStatement.useQuery(q, { enabled });
  const cf = trpc.financialReports.cashFlow.useQuery(q, { enabled });
  const eq = trpc.financialReports.equityStatement.useQuery(q, { enabled });
  const ratio = trpc.financialReports.ratios.useQuery(q, { enabled });
  const dash = trpc.financialReports.dashboard.useQuery(q, { enabled });
  const bud = trpc.financialReports.budgetVsActual.useQuery(
    { projectId, asOf },
    { enabled }
  );
  const closings = trpc.financialReports.listClosings.useQuery(
    { projectId },
    { enabled }
  );

  const importAccounts = trpc.financialReports.importAccounts.useMutation();
  const importEntries = trpc.financialReports.importEntries.useMutation();
  const closePeriod = trpc.financialReports.closePeriod.useMutation({
    onSuccess: () => {
      toast.success("期末结转完成");
      closings.refetch();
    },
  });

  const approveClosing = trpc.financialReports.approveClosing.useMutation({
    onSuccess: () => {
      toast.success("已复核");
      closings.refetch();
    },
    onError: (e: any) => toast.error(e?.message || "复核失败"),
  });

  // 一键初始化标准科目表
  const seedAccounts = trpc.accounting.seedAccounts.useMutation({
    onSuccess: () => {
      toast.success("科目表初始化完成！共 23 个标准科目");
      trial.refetch();
      bs.refetch();
      inc.refetch();
      cf.refetch();
      eq.refetch();
      ratio.refetch();
      dash.refetch();
    },
    onError: (e: any) => toast.error(e?.message || "初始化失败"),
  });
  const onSeed = () => {
    if (
      !confirm(
        "将为该项目创建 23 个标准会计科目（含现金/银行/应收/应付/所有者权益/收入/费用等），确认？"
      )
    )
      return;
    seedAccounts.mutate({ projectId });
  };

  const [accountsCsv, setAccountsCsv] = useState("");
  const [entriesCsv, setEntriesCsv] = useState("");

  const onImportAccounts = async () => {
    if (!accountsCsv.trim()) return toast.error("请粘贴科目表 CSV");
    try {
      const r = await importAccounts.mutateAsync({
        projectId,
        csv: accountsCsv,
      });
      toast.success(`导入科目 ${r.imported} 条`);
      setAccountsCsv("");
    } catch (e: any) {
      toast.error(e?.message || "导入失败");
    }
  };
  const onImportEntries = async () => {
    if (!entriesCsv.trim()) return toast.error("请粘贴凭证 CSV");
    try {
      const r = await importEntries.mutateAsync({ projectId, csv: entriesCsv });
      toast.success(`导入凭证 ${r.imported} 条`);
      setEntriesCsv("");
    } catch (e: any) {
      toast.error(e?.message || "导入失败");
    }
  };

  const onClose = async () => {
    if (
      !confirm(`确认结转期间 ${period}？该操作会生成结转凭证并锁定本期损益。`)
    )
      return;
    try {
      await closePeriod.mutateAsync({ projectId, period, asOf });
    } catch (e: any) {
      toast.error(e?.message || "结转失败");
    }
  };

  const onExport = (type: string) => {
    const cell = (v: string | number) =>
      /[",\n]/.test(String(v))
        ? `"${String(v).replace(/"/g, '""')}"`
        : String(v);
    const toCsv = (header: string[], rows: (string | number)[][]) =>
      [
        header.map(cell).join(","),
        ...rows.map(r => r.map(cell).join(",")),
      ].join("\r\n");
    let filename = "report.csv";
    let csv = "";
    if (type === "trialBalance" && trial.data) {
      filename = `试算平衡表_${asOf}.csv`;
      csv = toCsv(
        ["科目编码", "科目名称", "类型", "借方", "贷方", "余额"],
        trial.data.rows.map(r => [
          r.code,
          r.name,
          r.type,
          r.debit,
          r.credit,
          r.balance,
        ])
      );
    } else if (type === "balanceSheet" && bs.data) {
      filename = `资产负债表_${asOf}.csv`;
      csv = toCsv(
        ["类别", "科目编码", "科目名称", "余额"],
        [
          ...bs.data.assetRows.map(x => ["资产", x.code, x.name, x.balance]),
          ...bs.data.liabilityRows.map(x => [
            "负债",
            x.code,
            x.name,
            x.balance,
          ]),
          ...bs.data.equityRows.map(x => ["权益", x.code, x.name, x.balance]),
        ]
      );
    } else if (type === "incomeStatement" && inc.data) {
      filename = `利润表_${start}_${end}.csv`;
      csv = toCsv(
        ["类别", "科目编码", "科目名称", "金额"],
        [
          ...inc.data.incomeRows.map(x => ["收入", x.code, x.name, x.amount]),
          ...inc.data.expenseRows.map(x => ["费用", x.code, x.name, x.amount]),
        ]
      );
    } else if (type === "cashFlow" && cf.data) {
      filename = `现金流量表_${start}_${end}.csv`;
      csv = toCsv(
        ["类别", "对方科目", "金额", "方向"],
        cf.data.rows.map(x => [
          x.category,
          x.accountName,
          x.amount,
          x.direction,
        ])
      );
    } else if (type === "equityStatement" && eq.data) {
      filename = `权益变动表_${start}_${end}.csv`;
      csv = toCsv(
        ["科目编码", "科目名称", "期初", "本期变动", "期末"],
        eq.data.rows.map(x => [x.code, x.name, x.beginning, x.change, x.ending])
      );
    } else if (type === "ratios" && ratio.data) {
      filename = `财务比率_${asOf}.csv`;
      csv = toCsv(
        ["指标", "数值"],
        [
          ["流动比率", ratio.data.currentRatio],
          ["速动比率", ratio.data.quickRatio],
          ["资产负债率", ratio.data.debtRatio],
          ["毛利率", ratio.data.grossMargin],
          ["净利率", ratio.data.netMargin],
          ["净资产收益率", ratio.data.roe],
          ["总资产收益率", ratio.data.roa],
          ["利息保障倍数", ratio.data.interestCoverage ?? "N/A"],
        ]
      );
    } else {
      toast.error("请先等待报表加载完成");
      return;
    }
    downloadCsv(filename, csv);
  };

  return (
    <ChronosLayout>
      <PageHeader
        title="高级财务报表"
        description="试算平衡 · 四大报表 · 财务比率 · 预算管理 · 期末结转"
        breadcrumbs={[
          { label: "项目", href: `/projects/${projectId}` },
          { label: "财务", href: `/projects/${projectId}/finance` },
          { label: "高级报表" },
        ]}
      />

      {/* ──────── 首次访问引导 / 工作流面板 ──────── */}
      {!trial.isPending && (!trial.data || trial.data.rows.length === 0) && (
        <Card className="mb-4 border-2 border-sky-200 bg-gradient-to-br from-sky-50 to-white">
          <CardContent className="p-6">
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-sky-100">
                <Sprout className="h-6 w-6 text-sky-600" />
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-gray-900">
                  欢迎使用财务报表系统
                </h3>
                <p className="mt-1 text-sm text-gray-500">
                  当前项目尚未创建会计科目表，请先初始化再查看报表。
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button
                    onClick={onSeed}
                    disabled={seedAccounts.isPending}
                    className="gap-2 bg-sky-600 hover:bg-sky-700 text-white"
                  >
                    {seedAccounts.isPending ? (
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    ) : (
                      <Sprout className="h-4 w-4" />
                    )}
                    一键初始化科目表
                  </Button>
                  <Button
                    variant="outline"
                    className="gap-2"
                    onClick={() =>
                      navigate(`/projects/${projectId}/bookkeeping`)
                    }
                  >
                    <Calculator className="h-4 w-4" />
                    去记账录入
                  </Button>
                </div>
                <div className="mt-3 flex gap-4 text-xs text-gray-400">
                  <span className="flex items-center gap-1">
                    <CheckCircle2 className="h-3 w-3 text-green-500" />
                    自动创建 23 个标准科目
                  </span>
                  <span className="flex items-center gap-1">
                    <CheckCircle2 className="h-3 w-3 text-green-500" />
                    覆盖资产/负债/权益/收入/费用
                  </span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ──────── 工作流进度 (有数据时显示) ──────── */}
      {!trial.isPending && trial.data && trial.data.rows.length > 0 && (
        <div className="mb-4 flex gap-2 rounded-lg border border-gray-200 bg-gray-50 p-3 text-xs text-gray-600">
          <span className="flex items-center gap-1">
            <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
            科目已就绪
          </span>
          <span className="text-gray-300">|</span>
          <span className="flex items-center gap-1">
            {dash.data ? (
              <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
            ) : (
              <Clock className="h-3.5 w-3.5 text-amber-500" />
            )}
            {dash.data
              ? `本月收入 ${fmt(dash.data.kpis[0]?.value)}`
              : "等待数据"}
          </span>
          <span className="text-gray-300">|</span>
          <span className="flex items-center gap-1">
            {closings.data && closings.data.length > 0 ? (
              <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
            ) : (
              <Clock className="h-3.5 w-3.5 text-amber-500" />
            )}
            {closings.data?.length
              ? `${closings.data.length} 次结转`
              : "未结转"}
          </span>
          <span className="text-gray-300">|</span>
          <Button
            size="sm"
            variant="ghost"
            className="h-auto p-0 text-xs text-sky-600 hover:text-sky-700"
            onClick={() => navigate(`/projects/${projectId}/bookkeeping`)}
          >
            <ArrowRight className="mr-1 h-3 w-3" />
            记账录入
          </Button>
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-end gap-3 rounded-xl border border-gray-200 bg-gray-50 p-3">
        <div>
          <Label className="text-xs">截止日 (asOf)</Label>
          <Input
            type="date"
            value={asOf}
            onChange={e => setAsOf(e.target.value)}
            className="w-44"
          />
        </div>
        <div>
          <Label className="text-xs">期间起</Label>
          <Input
            type="date"
            value={start}
            onChange={e => setStart(e.target.value)}
            className="w-44"
          />
        </div>
        <div>
          <Label className="text-xs">期间止</Label>
          <Input
            type="date"
            value={end}
            onChange={e => setEnd(e.target.value)}
            className="w-44"
          />
        </div>
      </div>

      <Tabs defaultValue="dashboard" className="w-full">
        <TabsList className="mb-4 flex-wrap">
          <TabsTrigger value="dashboard">
            <Gauge className="mr-1 h-4 w-4" />
            仪表盘
          </TabsTrigger>
          <TabsTrigger value="trial">
            <Scale className="mr-1 h-4 w-4" />
            试算平衡
          </TabsTrigger>
          <TabsTrigger value="bs">
            <FileText className="mr-1 h-4 w-4" />
            资产负债表
          </TabsTrigger>
          <TabsTrigger value="income">
            <FileText className="mr-1 h-4 w-4" />
            利润表
          </TabsTrigger>
          <TabsTrigger value="cf">
            <Wallet className="mr-1 h-4 w-4" />
            现金流量表
          </TabsTrigger>
          <TabsTrigger value="equity">
            <PieIcon className="mr-1 h-4 w-4" />
            权益变动
          </TabsTrigger>
          <TabsTrigger value="ratio">
            <Gauge className="mr-1 h-4 w-4" />
            财务比率
          </TabsTrigger>
          <TabsTrigger value="budget">
            <Target className="mr-1 h-4 w-4" />
            预算对比
          </TabsTrigger>
          <TabsTrigger value="import">
            <Upload className="mr-1 h-4 w-4" />
            数据导入
          </TabsTrigger>
          <TabsTrigger value="closing">
            <Lock className="mr-1 h-4 w-4" />
            期末结转
          </TabsTrigger>
        </TabsList>

        {/* ───────── 仪表盘 ───────── */}
        <TabsContent value="dashboard">
          {dash.isPending ? (
            <Skeleton className="h-64 w-full" />
          ) : dash.data ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                {dash.data.kpis.map(k => (
                  <Card key={k.label}>
                    <CardContent className="p-4">
                      <div className="text-xs text-muted-foreground">
                        {k.label}
                      </div>
                      <div
                        className={`text-xl font-semibold ${k.positive === false ? "text-red-500" : ""}`}
                      >
                        {fmt(k.value)}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">收入 vs 费用</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={240}>
                      <BarChart
                        data={[
                          {
                            name: "本期",
                            收入: dash.data.incomeVsExpense.revenue,
                            费用: dash.data.incomeVsExpense.expense,
                          },
                        ]}
                      >
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="name" />
                        <YAxis />
                        <Tooltip />
                        <Legend />
                        <Bar dataKey="收入" fill="#0ea5e9" />
                        <Bar dataKey="费用" fill="#f97316" />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">现金流量结构</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {cf.data ? (
                      <ResponsiveContainer width="100%" height={240}>
                        <PieChart>
                          <Pie
                            data={[
                              {
                                name: "经营",
                                value: Math.abs(cf.data.operating),
                              },
                              {
                                name: "投资",
                                value: Math.abs(cf.data.investing),
                              },
                              {
                                name: "筹资",
                                value: Math.abs(cf.data.financing),
                              },
                            ]}
                            dataKey="value"
                            nameKey="name"
                            outerRadius={80}
                            label
                          >
                            {PIE_COLORS.map(c => (
                              <Cell key={c} fill={c} />
                            ))}
                          </Pie>
                          <Tooltip />
                          <Legend />
                        </PieChart>
                      </ResponsiveContainer>
                    ) : (
                      <Skeleton className="h-56 w-full" />
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>
          ) : (
            <Card className="border-2 border-dashed border-gray-200">
              <CardContent className="flex flex-col items-center justify-center py-16 text-center">
                <BarChart3 className="mb-3 h-12 w-12 text-gray-300" />
                <p className="text-gray-500">暂无财务数据，请先录入记账凭证</p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-3 gap-2"
                  onClick={() => navigate(`/projects/${projectId}/bookkeeping`)}
                >
                  <Calculator className="h-4 w-4" />
                  去记账录入
                </Button>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ───────── 试算平衡 ───────── */}
        <TabsContent value="trial">
          <Card>
            <CardHeader className="flex items-center justify-between">
              <CardTitle className="text-base">
                试算平衡表（截至 {asOf}）
              </CardTitle>
              <Button
                size="sm"
                variant="outline"
                onClick={() => onExport("trialBalance")}
              >
                <Download className="mr-1 h-4 w-4" />
                导出 CSV
              </Button>
            </CardHeader>
            <CardContent>
              {trial.isPending ? (
                <Skeleton className="h-40 w-full" />
              ) : trial.data ? (
                <>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>编码</TableHead>
                        <TableHead>科目</TableHead>
                        <TableHead>类型</TableHead>
                        <TableHead className="text-right">借方</TableHead>
                        <TableHead className="text-right">贷方</TableHead>
                        <TableHead className="text-right">余额</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {trial.data.rows.map(r => (
                        <TableRow key={r.id}>
                          <TableCell>{r.code}</TableCell>
                          <TableCell>{r.name}</TableCell>
                          <TableCell>{r.type}</TableCell>
                          <TableCell className="text-right">
                            {fmt(r.debit)}
                          </TableCell>
                          <TableCell className="text-right">
                            {fmt(r.credit)}
                          </TableCell>
                          <TableCell className="text-right">
                            {fmt(r.balance)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  <div className="mt-3 flex justify-end gap-6 text-sm">
                    <span>
                      借方合计：<b>{fmt(trial.data.totalDebit)}</b>
                    </span>
                    <span>
                      贷方合计：<b>{fmt(trial.data.totalCredit)}</b>
                    </span>
                    <span
                      className={
                        trial.data.balanced ? "text-green-600" : "text-red-600"
                      }
                    >
                      {trial.data.balanced ? "✓ 平衡" : "✗ 不平衡"}
                    </span>
                  </div>
                </>
              ) : null}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ───────── 资产负债表 ───────── */}
        <TabsContent value="bs">
          <Card>
            <CardHeader className="flex items-center justify-between">
              <CardTitle className="text-base">
                资产负债表（截至 {asOf}）
              </CardTitle>
              <Button
                size="sm"
                variant="outline"
                onClick={() => onExport("balanceSheet")}
              >
                <Download className="mr-1 h-4 w-4" />
                导出 CSV
              </Button>
            </CardHeader>
            <CardContent>
              {bs.isPending ? (
                <Skeleton className="h-40 w-full" />
              ) : bs.data ? (
                <div className="grid gap-4 md:grid-cols-3">
                  <div>
                    <div className="mb-2 font-medium">资产</div>
                    <Table>
                      <TableBody>
                        {bs.data.assetRows.map(r => (
                          <TableRow key={r.id}>
                            <TableCell>{r.name}</TableCell>
                            <TableCell className="text-right">
                              {fmt(r.balance)}
                            </TableCell>
                          </TableRow>
                        ))}
                        <TableRow>
                          <TableCell className="font-semibold">
                            资产合计
                          </TableCell>
                          <TableCell className="text-right font-semibold">
                            {fmt(bs.data.assets)}
                          </TableCell>
                        </TableRow>
                      </TableBody>
                    </Table>
                  </div>
                  <div>
                    <div className="mb-2 font-medium">负债</div>
                    <Table>
                      <TableBody>
                        {bs.data.liabilityRows.map(r => (
                          <TableRow key={r.id}>
                            <TableCell>{r.name}</TableCell>
                            <TableCell className="text-right">
                              {fmt(r.balance)}
                            </TableCell>
                          </TableRow>
                        ))}
                        <TableRow>
                          <TableCell className="font-semibold">
                            负债合计
                          </TableCell>
                          <TableCell className="text-right font-semibold">
                            {fmt(bs.data.liabilities)}
                          </TableCell>
                        </TableRow>
                      </TableBody>
                    </Table>
                  </div>
                  <div>
                    <div className="mb-2 font-medium">所有者权益</div>
                    <Table>
                      <TableBody>
                        {bs.data.equityRows.map(r => (
                          <TableRow key={r.id}>
                            <TableCell>{r.name}</TableCell>
                            <TableCell className="text-right">
                              {fmt(r.balance)}
                            </TableCell>
                          </TableRow>
                        ))}
                        <TableRow>
                          <TableCell>本期净利润</TableCell>
                          <TableCell className="text-right">
                            {fmt(bs.data.netIncome)}
                          </TableCell>
                        </TableRow>
                        <TableRow>
                          <TableCell className="font-semibold">
                            权益合计
                          </TableCell>
                          <TableCell className="text-right font-semibold">
                            {fmt(bs.data.totalEquity)}
                          </TableCell>
                        </TableRow>
                      </TableBody>
                    </Table>
                  </div>
                </div>
              ) : null}
              {bs.data && (
                <div
                  className={`mt-3 text-right text-sm ${bs.data.balanced ? "text-green-600" : "text-red-600"}`}
                >
                  资产 {fmt(bs.data.assets)} = 负债+权益{" "}
                  {fmt(bs.data.totalLiabilitiesAndEquity)} ·{" "}
                  {bs.data.balanced ? "✓ 平衡" : "✗ 不平衡"}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ───────── 利润表 ───────── */}
        <TabsContent value="income">
          <Card>
            <CardHeader className="flex items-center justify-between">
              <CardTitle className="text-base">
                利润表（{start} ~ {end}）
              </CardTitle>
              <Button
                size="sm"
                variant="outline"
                onClick={() => onExport("incomeStatement")}
              >
                <Download className="mr-1 h-4 w-4" />
                导出 CSV
              </Button>
            </CardHeader>
            <CardContent>
              {inc.isPending ? (
                <Skeleton className="h-40 w-full" />
              ) : inc.data ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>类别</TableHead>
                      <TableHead>科目</TableHead>
                      <TableHead className="text-right">金额</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {inc.data.incomeRows.map(r => (
                      <TableRow key={r.id}>
                        <TableCell>收入</TableCell>
                        <TableCell>{r.name}</TableCell>
                        <TableCell className="text-right">
                          {fmt(r.amount)}
                        </TableCell>
                      </TableRow>
                    ))}
                    {inc.data.expenseRows.map(r => (
                      <TableRow key={r.id}>
                        <TableCell>费用</TableCell>
                        <TableCell>{r.name}</TableCell>
                        <TableCell className="text-right">
                          {fmt(r.amount)}
                        </TableCell>
                      </TableRow>
                    ))}
                    <TableRow>
                      <TableCell className="font-semibold" colSpan={2}>
                        净利润
                      </TableCell>
                      <TableCell className="text-right font-semibold">
                        {fmt(inc.data.netIncome)}
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              ) : null}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ───────── 现金流量表 ───────── */}
        <TabsContent value="cf">
          <Card>
            <CardHeader className="flex items-center justify-between">
              <CardTitle className="text-base">
                现金流量表（{start} ~ {end}）
              </CardTitle>
              <Button
                size="sm"
                variant="outline"
                onClick={() => onExport("cashFlow")}
              >
                <Download className="mr-1 h-4 w-4" />
                导出 CSV
              </Button>
            </CardHeader>
            <CardContent>
              {cf.isPending ? (
                <Skeleton className="h-40 w-full" />
              ) : cf.data ? (
                <>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>类别</TableHead>
                        <TableHead>对方科目</TableHead>
                        <TableHead>方向</TableHead>
                        <TableHead className="text-right">金额</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {cf.data.rows.map((r, i) => (
                        <TableRow key={i}>
                          <TableCell>{r.category}</TableCell>
                          <TableCell>{r.accountName}</TableCell>
                          <TableCell>
                            {r.direction === "in" ? "流入" : "流出"}
                          </TableCell>
                          <TableCell className="text-right">
                            {fmt(r.amount)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  <div className="mt-3 flex justify-end gap-4 text-sm">
                    <span>
                      经营：<b>{fmt(cf.data.operating)}</b>
                    </span>
                    <span>
                      投资：<b>{fmt(cf.data.investing)}</b>
                    </span>
                    <span>
                      筹资：<b>{fmt(cf.data.financing)}</b>
                    </span>
                    <span className="font-semibold">
                      净额：{fmt(cf.data.net)}
                    </span>
                  </div>
                </>
              ) : null}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ───────── 权益变动 ───────── */}
        <TabsContent value="equity">
          <Card>
            <CardHeader className="flex items-center justify-between">
              <CardTitle className="text-base">
                所有者权益变动表（{start} ~ {end}）
              </CardTitle>
              <Button
                size="sm"
                variant="outline"
                onClick={() => onExport("equityStatement")}
              >
                <Download className="mr-1 h-4 w-4" />
                导出 CSV
              </Button>
            </CardHeader>
            <CardContent>
              {eq.isPending ? (
                <Skeleton className="h-40 w-full" />
              ) : eq.data ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>科目</TableHead>
                      <TableHead className="text-right">期初</TableHead>
                      <TableHead className="text-right">本期变动</TableHead>
                      <TableHead className="text-right">期末</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {eq.data.rows.map(r => (
                      <TableRow key={r.id}>
                        <TableCell>{r.name}</TableCell>
                        <TableCell className="text-right">
                          {fmt(r.beginning)}
                        </TableCell>
                        <TableCell className="text-right">
                          {fmt(r.change)}
                        </TableCell>
                        <TableCell className="text-right">
                          {fmt(r.ending)}
                        </TableCell>
                      </TableRow>
                    ))}
                    <TableRow>
                      <TableCell className="font-semibold" colSpan={3}>
                        期末权益合计
                      </TableCell>
                      <TableCell className="text-right font-semibold">
                        {fmt(eq.data.ending)}
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              ) : null}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ───────── 财务比率 ───────── */}
        <TabsContent value="ratio">
          <Card>
            <CardHeader className="flex items-center justify-between">
              <CardTitle className="text-base">
                财务比率（截至 {asOf}）
              </CardTitle>
              <Button
                size="sm"
                variant="outline"
                onClick={() => onExport("ratios")}
              >
                <Download className="mr-1 h-4 w-4" />
                导出 CSV
              </Button>
            </CardHeader>
            <CardContent>
              {ratio.isPending ? (
                <Skeleton className="h-40 w-full" />
              ) : ratio.data ? (
                <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                  <RatioCard label="流动比率" value={ratio.data.currentRatio} />
                  <RatioCard label="速动比率" value={ratio.data.quickRatio} />
                  <RatioCard
                    label="资产负债率"
                    value={ratio.data.debtRatio}
                    pct
                  />
                  <RatioCard
                    label="毛利率"
                    value={ratio.data.grossMargin}
                    pct
                  />
                  <RatioCard label="净利率" value={ratio.data.netMargin} pct />
                  <RatioCard label="ROE" value={ratio.data.roe} pct />
                  <RatioCard label="ROA" value={ratio.data.roa} pct />
                  <RatioCard
                    label="利息保障倍数"
                    value={ratio.data.interestCoverage}
                  />
                </div>
              ) : null}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ───────── 预算对比 ───────── */}
        <TabsContent value="budget">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                预算 vs 实际（截至 {asOf}）
              </CardTitle>
            </CardHeader>
            <CardContent>
              {bud.isPending ? (
                <Skeleton className="h-40 w-full" />
              ) : bud.data ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>科目</TableHead>
                      <TableHead className="text-right">预算</TableHead>
                      <TableHead className="text-right">实际</TableHead>
                      <TableHead className="text-right">差异</TableHead>
                      <TableHead className="text-right">偏差%</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {bud.data.rows.map(r => (
                      <TableRow key={r.id}>
                        <TableCell>{r.name}</TableCell>
                        <TableCell className="text-right">
                          {fmt(r.budget)}
                        </TableCell>
                        <TableCell className="text-right">
                          {fmt(r.actual)}
                        </TableCell>
                        <TableCell className="text-right">
                          {fmt(r.variance)}
                        </TableCell>
                        <TableCell className="text-right">
                          {(r.pct * 100).toFixed(1)}%
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : null}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ───────── 数据导入 ───────── */}
        <TabsContent value="import">
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">导入科目表 (CSV)</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <p className="text-xs text-muted-foreground">
                  表头：code,name,type[,cashFlowCategory]。type ∈
                  asset/liability/equity/income/expense
                </p>
                <textarea
                  className="h-40 w-full rounded-md border border-gray-300 bg-white p-2 font-mono text-xs"
                  value={accountsCsv}
                  onChange={e => setAccountsCsv(e.target.value)}
                  placeholder={
                    "code,name,type\n1001,库存现金,asset\n2202,应付账款,liability"
                  }
                />
                <Button
                  onClick={onImportAccounts}
                  disabled={importAccounts.isPending}
                >
                  <Upload className="mr-1 h-4 w-4" />
                  导入科目
                </Button>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">导入记账凭证 (CSV)</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <p className="text-xs text-muted-foreground">
                  表头：date,description,debitCode,debitAmount,creditCode,creditAmount
                </p>
                <textarea
                  className="h-40 w-full rounded-md border border-gray-300 bg-white p-2 font-mono text-xs"
                  value={entriesCsv}
                  onChange={e => setEntriesCsv(e.target.value)}
                  placeholder={
                    "date,description,debitCode,debitAmount,creditCode,creditAmount\n2025-01-05,注资,1002,500000,3001,500000"
                  }
                />
                <Button
                  onClick={onImportEntries}
                  disabled={importEntries.isPending}
                >
                  <Upload className="mr-1 h-4 w-4" />
                  导入凭证
                </Button>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ───────── 期末结转 ───────── */}
        <TabsContent value="closing">
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">执行期末结转</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <Label className="text-xs">结转期间 (YYYY-MM)</Label>
                  <Input
                    value={period}
                    onChange={e => setPeriod(e.target.value)}
                    className="w-44"
                  />
                </div>
                <div>
                  <Label className="text-xs">结转截止日 (asOf)</Label>
                  <Input
                    type="date"
                    value={asOf}
                    onChange={e => setAsOf(e.target.value)}
                    className="w-44"
                  />
                </div>
                <Button
                  onClick={onClose}
                  disabled={closePeriod.isPending}
                  variant="destructive"
                >
                  <Lock className="mr-1 h-4 w-4" />
                  结转本期损益
                </Button>
                <p className="text-xs text-muted-foreground">
                  结转将把所有收入/费用科目余额清零，差额转入「利润分配/留存收益」科目，并写入结转记录。
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">结转历史</CardTitle>
              </CardHeader>
              <CardContent>
                {closings.isPending ? (
                  <Skeleton className="h-20 w-full" />
                ) : closings.data && closings.data.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>期间</TableHead>
                        <TableHead className="text-right">净利润</TableHead>
                        <TableHead className="text-right">凭证数</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {closings.data.map((c: any) => (
                        <TableRow key={c.id}>
                          <TableCell>{c.period}</TableCell>
                          <TableCell className="text-right">
                            {fmt(c.netIncome)}
                          </TableCell>
                          <TableCell className="text-right">
                            {c.entryCount}
                          </TableCell>
                          <TableCell className="text-right">
                            {c.approvedBy ? (
                              <span className="text-green-600 text-xs">
                                <CheckCircle2 className="h-3 w-3 inline mr-0.5" />
                                已复核
                              </span>
                            ) : (
                              <Button
                                size="sm"
                                variant="outline"
                                className="text-xs h-7"
                                onClick={() =>
                                  approveClosing.mutate({
                                    closingId: c.id,
                                    projectId,
                                  })
                                }
                              >
                                复核
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <p className="text-sm text-muted-foreground">暂无结转记录</p>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </ChronosLayout>
  );
}

function RatioCard({
  label,
  value,
  pct,
}: {
  label: string;
  value: number | null;
  pct?: boolean;
}) {
  const display =
    value == null
      ? "N/A"
      : pct
        ? `${(value * 100).toFixed(1)}%`
        : value.toFixed(2);
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="text-xl font-semibold">{display}</div>
      </CardContent>
    </Card>
  );
}
