import { useParams, useSearch } from "wouter";
import { useEffect, useRef } from "react";
import { ChronosLayout } from "@/components/ChronosLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, TrendingUp, Download } from "lucide-react";
import { useState } from "react";
import { exportCostsToExcel } from "@/lib/exportUtils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { toast } from "sonner";

export default function CostManagement() {
  const params = useParams();
  const projectId = parseInt(params.projectId || "0", 10);

  const {
    data: costs,
    isLoading,
    refetch,
  } = trpc.costs.getByProject.useQuery(
    { projectId },
    { enabled: projectId > 0 }
  );

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { data: costSummary } = trpc.analytics.getCostSummary.useQuery(
    { projectId },
    { enabled: projectId > 0 }
  );

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    amount: "",
    category: "",
    notes: "",
  });

  const createCostMutation = trpc.costs.create.useMutation({
    onSuccess: () => {
      toast.success("成本条目添加成功");
      setFormData({ name: "", amount: "", category: "", notes: "" });
      setIsDialogOpen(false);
      refetch();
    },
    onError: error => {
      toast.error(error.message || "添加成本条目失败");
    },
  });

  const handleCreateCost = () => {
    if (
      !formData.name.trim() ||
      !formData.amount.trim() ||
      !formData.category.trim()
    ) {
      toast.error("请填写所有必填项");
      return;
    }

    createCostMutation.mutate({
      projectId,
      name: formData.name,
      amount: formData.amount,
      category: formData.category,
      notes: formData.notes,
    });
  };

  const totalCost =
    costs?.reduce((sum, cost) => {
      return sum + (Number(cost.amount) || 0);
    }, 0) || 0;

  const costByCategory =
    costs?.reduce((acc: Record<string, number>, cost) => {
      const category = cost.category;
      acc[category] = (acc[category] || 0) + (Number(cost.amount) || 0);
      return acc;
    }, {}) || {};

  // 搜索结果高亮定位
  const search = useSearch();
  const searchParams = new URLSearchParams(search);
  const highlightId = searchParams.get("highlight");
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const tableRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (highlightId && costs?.length) {
      const timer = setTimeout(() => {
        const el = document.querySelector(`[data-highlight="${highlightId}"]`);
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "center" });
          el.classList.add("search-highlight");
          setTimeout(() => el.classList.remove("search-highlight"), 2100);
        }
      }, 300); // wait for render
      return () => clearTimeout(timer);
    }
  }, [highlightId, costs]);

  return (
    <ChronosLayout title="成本核算">
      <div className="space-y-6">
        <Breadcrumb className="mb-1">
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink href="/dashboard">仪表盘</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink href={`/projects/${projectId}`}>
                项目
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>成本管理</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground">成本管理</h1>
            <p className="text-muted-foreground mt-1">
              管理项目的所有成本和费用 · 合计 ¥
              {costs
                ?.reduce(
                  (sum: number, c: any) => sum + (Number(c.amount) || 0),
                  0
                )
                .toFixed(2) || "0.00"}
            </p>
          </div>
          <div className="flex gap-2">
            {costs && costs.length > 0 && (
              <Button
                variant="outline"
                className="gap-2"
                onClick={() => exportCostsToExcel(costs, `项目 #${projectId}`)}
              >
                <Download className="w-4 h-4" /> 导出 Excel
              </Button>
            )}
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
              <DialogTrigger asChild>
                <Button className="gap-2 bg-sky-600 hover:bg-sky-700 text-white">
                  <Plus className="w-4 h-4" /> 添加成本
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>添加成本条目</DialogTitle>
                  <DialogDescription>记录项目的新费用</DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="cost-name">费用名称</Label>
                    <Input
                      id="cost-name"
                      placeholder="例如：办公用品采购"
                      value={formData.name}
                      onChange={e =>
                        setFormData({ ...formData, name: e.target.value })
                      }
                    />
                  </div>
                  <div>
                    <Label htmlFor="cost-amount">金额 (¥)</Label>
                    <Input
                      id="cost-amount"
                      type="number"
                      step="0.01"
                      placeholder="0.00"
                      value={formData.amount}
                      onChange={e =>
                        setFormData({ ...formData, amount: e.target.value })
                      }
                    />
                  </div>
                  <div>
                    <Label htmlFor="cost-category">类别</Label>
                    <Input
                      id="cost-category"
                      placeholder="例如：物料、人工、运输等"
                      value={formData.category}
                      onChange={e =>
                        setFormData({ ...formData, category: e.target.value })
                      }
                    />
                  </div>
                  <div>
                    <Label htmlFor="cost-notes">备注</Label>
                    <Textarea
                      id="cost-notes"
                      placeholder="其他说明"
                      value={formData.notes}
                      onChange={e =>
                        setFormData({ ...formData, notes: e.target.value })
                      }
                    />
                  </div>
                  <Button
                    onClick={handleCreateCost}
                    disabled={createCostMutation.isPending}
                    className="w-full bg-sky-600 hover:bg-sky-700 text-white"
                  >
                    {createCostMutation.isPending ? "添加中..." : "添加成本"}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="bg-gradient-to-br from-sky-50 to-sky-100">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-sky-700">
                总成本
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-sky-900">
                ¥{totalCost.toFixed(2)}
              </div>
              <p className="text-xs text-sky-600 mt-1">
                {costs?.length || 0} 个条目
              </p>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-coral-50 to-coral-100">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-coral-700">
                成本类别
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-coral-900">
                {Object.keys(costByCategory).length}
              </div>
              <p className="text-xs text-coral-600 mt-1">不同的费用类型</p>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-cool-50 to-cool-100">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-cool-700 flex items-center gap-2">
                <TrendingUp className="w-4 h-4" />
                平均成本
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-cool-900">
                ¥
                {costs && costs.length > 0
                  ? (totalCost / costs.length).toFixed(2)
                  : "0.00"}
              </div>
              <p className="text-xs text-cool-600 mt-1">每项平均费用</p>
            </CardContent>
          </Card>
        </div>

        {/* Cost Table */}
        <Card>
          <CardHeader>
            <CardTitle>成本清单</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-2">
                {[1, 2, 3].map(i => (
                  <Skeleton key={i} className="h-12 w-full rounded" />
                ))}
              </div>
            ) : costs && costs.length > 0 ? (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>费用名称</TableHead>
                      <TableHead>金额</TableHead>
                      <TableHead>类别</TableHead>
                      <TableHead>日期</TableHead>
                      <TableHead>备注</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {costs.map(cost => (
                      <TableRow key={cost.id} data-highlight={cost.id}>
                        <TableCell className="font-medium">
                          {cost.name}
                        </TableCell>
                        <TableCell className="text-sky-600 font-semibold">
                          ¥{(Number(cost.amount) || 0).toFixed(2)}
                        </TableCell>
                        <TableCell>
                          <span className="px-2 py-1 bg-muted rounded text-xs">
                            {cost.category}
                          </span>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {new Date(cost.date).toLocaleDateString("zh-CN")}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {cost.notes || "-"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <div className="text-center py-12">
                <p className="text-muted-foreground mb-4">暂无成本条目</p>
                <Button
                  variant="outline"
                  onClick={() => setIsDialogOpen(true)}
                  className="gap-2"
                >
                  <Plus className="w-4 h-4" />
                  添加第一个成本
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Category Summary */}
        {Object.keys(costByCategory).length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>按类别统计</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {Object.entries(costByCategory).map(([category, amount]) => (
                  <div
                    key={category}
                    className="p-4 bg-muted rounded-lg flex items-center justify-between"
                  >
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        {category}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {costs?.filter(c => c.category === category).length ||
                          0}{" "}
                        项
                      </p>
                    </div>
                    <p className="text-lg font-bold text-sky-600">
                      ¥{(amount as number).toFixed(2)}
                    </p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </ChronosLayout>
  );
}
