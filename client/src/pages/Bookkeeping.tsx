import { useParams } from "wouter";
import { ChronosLayout } from "@/components/ChronosLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";
import { Skeleton } from "@/components/ui/skeleton";
import { BookOpen, ArrowRightLeft } from "lucide-react";
import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";

const ACCOUNT_TYPES: Record<string, string> = {
  asset: "资产",
  liability: "负债",
  equity: "权益",
  income: "收入",
  expense: "费用",
};

export default function Bookkeeping() {
  const params = useParams();
  const projectId = parseInt(params.projectId || "0", 10);

  const {
    data: accounts,
    isLoading: acctsLoading,
    refetch: refetchAccts,
  } = trpc.accounting.getAccounts.useQuery(
    { projectId },
    { enabled: projectId > 0 }
  );

  const {
    data: entries,
    isLoading: entriesLoading,
    refetch: refetchEntries,
  } = trpc.accounting.getEntries.useQuery(
    { projectId },
    { enabled: projectId > 0 }
  );

  const seedMutation = trpc.accounting.seedAccounts.useMutation({
    onSuccess: () => {
      toast.success("科目已初始化");
      refetchAccts();
    },
  });

  const [isEntryDialog, setIsEntryDialog] = useState(false);
  const [entryForm, setEntryForm] = useState({
    date: new Date().toISOString().slice(0, 10),
    description: "",
    debitAccountId: 0,
    debitAmount: "",
    creditAccountId: 0,
    creditAmount: "",
  });

  const createEntryMutation = trpc.accounting.createEntry.useMutation({
    onSuccess: () => {
      toast.success("分录已保存");
      setEntryForm({
        date: new Date().toISOString().slice(0, 10),
        description: "",
        debitAccountId: 0,
        debitAmount: "",
        creditAccountId: 0,
        creditAmount: "",
      });
      setIsEntryDialog(false);
      refetchEntries();
      refetchAccts();
    },
  });

  const handleCreateEntry = () => {
    if (!entryForm.debitAccountId || !entryForm.creditAccountId) {
      toast.error("请选择借贷科目");
      return;
    }
    if (entryForm.debitAccountId === entryForm.creditAccountId) {
      toast.error("借贷科目不能相同");
      return;
    }
    const debitAmt = parseFloat(entryForm.debitAmount);
    const creditAmt = parseFloat(entryForm.creditAmount);
    if (
      isNaN(debitAmt) ||
      isNaN(creditAmt) ||
      debitAmt <= 0 ||
      creditAmt <= 0
    ) {
      toast.error("请输入有效金额");
      return;
    }
    // 复式记账核心约束：借贷必须平衡
    if (Math.abs(debitAmt - creditAmt) > 0.01) {
      toast.error("借贷金额必须相等（复式记账平衡约束）");
      return;
    }
    createEntryMutation.mutate({
      projectId,
      date: entryForm.date,
      description: entryForm.description || "无摘要",
      debitAccountId: entryForm.debitAccountId,
      debitAmount: debitAmt,
      creditAccountId: entryForm.creditAccountId,
      creditAmount: creditAmt,
    });
  };

  useEffect(() => {
    if (accounts && accounts.length === 0 && projectId > 0) {
      seedMutation.mutate({ projectId });
    }
  }, [accounts, projectId, seedMutation]);

  // Calculate totals
  const totalDebit =
    entries?.reduce((s, e) => s + (e.debitAmount || 0), 0) || 0;
  const totalCredit =
    entries?.reduce((s, e) => s + (e.creditAmount || 0), 0) || 0;

  const groupedAccounts =
    accounts?.reduce((acc: Record<string, typeof accounts>, a) => {
      if (!acc[a.type]) acc[a.type] = [];
      acc[a.type].push(a);
      return acc;
    }, {}) || {};

  return (
    <ChronosLayout title="复式记账">
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground">复式记账</h1>
            <p className="text-muted-foreground mt-1">
              借贷记账、科目管理与分录记录
            </p>
          </div>
          <div className="flex gap-2">
            {(!accounts || accounts.length === 0) && (
              <Button
                variant="outline"
                className="gap-2"
                onClick={() => seedMutation.mutate({ projectId })}
              >
                <BookOpen className="w-4 h-4" />
                初始化科目表
              </Button>
            )}
            <Dialog open={isEntryDialog} onOpenChange={setIsEntryDialog}>
              <DialogTrigger asChild>
                <Button className="gap-2 bg-sky-600 hover:bg-sky-700 text-white">
                  <ArrowRightLeft className="w-4 h-4" />
                  录入分录
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-md">
                <DialogHeader>
                  <DialogTitle>录入记账分录</DialogTitle>
                  <DialogDescription>
                    借：贷方科目金额 = 贷：贷方科目金额
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <Label>日期</Label>
                    <Input
                      type="date"
                      value={entryForm.date}
                      onChange={e =>
                        setEntryForm({ ...entryForm, date: e.target.value })
                      }
                    />
                  </div>
                  <div>
                    <Label>摘要</Label>
                    <Input
                      placeholder="业务描述"
                      value={entryForm.description}
                      onChange={e =>
                        setEntryForm({
                          ...entryForm,
                          description: e.target.value,
                        })
                      }
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4 bg-red-50 p-3 rounded-lg border border-red-100">
                    <div>
                      <Label className="text-red-700">借方科目</Label>
                      <Select
                        value={
                          entryForm.debitAccountId
                            ? String(entryForm.debitAccountId)
                            : ""
                        }
                        onValueChange={v =>
                          setEntryForm({
                            ...entryForm,
                            debitAccountId: parseInt(v, 10),
                          })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="选择科目" />
                        </SelectTrigger>
                        <SelectContent>
                          {accounts?.map(a => (
                            <SelectItem key={a.id} value={String(a.id)}>
                              {a.code} {a.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-red-700">借方金额</Label>
                      <Input
                        type="number"
                        step="0.01"
                        placeholder="¥0.00"
                        value={entryForm.debitAmount}
                        onChange={e =>
                          setEntryForm({
                            ...entryForm,
                            debitAmount: e.target.value,
                          })
                        }
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4 bg-green-50 p-3 rounded-lg border border-green-100">
                    <div>
                      <Label className="text-green-700">贷方科目</Label>
                      <Select
                        value={
                          entryForm.creditAccountId
                            ? String(entryForm.creditAccountId)
                            : ""
                        }
                        onValueChange={v =>
                          setEntryForm({
                            ...entryForm,
                            creditAccountId: parseInt(v, 10),
                          })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="选择科目" />
                        </SelectTrigger>
                        <SelectContent>
                          {accounts?.map(a => (
                            <SelectItem key={a.id} value={String(a.id)}>
                              {a.code} {a.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-green-700">贷方金额</Label>
                      <Input
                        type="number"
                        step="0.01"
                        placeholder="¥0.00"
                        value={entryForm.creditAmount}
                        onChange={e =>
                          setEntryForm({
                            ...entryForm,
                            creditAmount: e.target.value,
                          })
                        }
                      />
                    </div>
                  </div>
                  <Button
                    className="w-full bg-sky-600 hover:bg-sky-700 text-white"
                    onClick={handleCreateEntry}
                    disabled={createEntryMutation.isPending}
                  >
                    {createEntryMutation.isPending ? "保存中..." : "保存分录"}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* Summary */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card className="bg-gradient-to-br from-red-50 to-red-100">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-red-700">借方合计</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-900">
                ¥{totalDebit.toFixed(2)}
              </div>
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-br from-green-50 to-green-100">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-green-700">贷方合计</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-900">
                ¥{totalCredit.toFixed(2)}
              </div>
            </CardContent>
          </Card>
          <Card
            className={`bg-gradient-to-br ${Math.abs(totalDebit - totalCredit) < 0.01 ? "from-sky-50 to-sky-100" : "from-yellow-50 to-yellow-100"}`}
          >
            <CardHeader className="pb-2">
              <CardTitle
                className={`text-sm ${Math.abs(totalDebit - totalCredit) < 0.01 ? "text-sky-700" : "text-yellow-700"}`}
              >
                借贷平衡
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div
                className={`text-2xl font-bold ${Math.abs(totalDebit - totalCredit) < 0.01 ? "text-sky-900" : "text-yellow-900"}`}
              >
                {Math.abs(totalDebit - totalCredit) < 0.01
                  ? "✓ 平衡"
                  : `差额 ¥${Math.abs(totalDebit - totalCredit).toFixed(2)}`}
              </div>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="entries">
          <TabsList>
            <TabsTrigger value="entries">分录记录</TabsTrigger>
            <TabsTrigger value="accounts">科目表</TabsTrigger>
          </TabsList>

          <TabsContent value="entries" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle>记账分录</CardTitle>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                {entriesLoading ? (
                  <div className="space-y-2">
                    {[1, 2, 3].map(i => (
                      <Skeleton key={i} className="h-12 rounded" />
                    ))}
                  </div>
                ) : entries && entries.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>日期</TableHead>
                        <TableHead>摘要</TableHead>
                        <TableHead>借方科目</TableHead>
                        <TableHead className="text-right">借方金额</TableHead>
                        <TableHead>贷方科目</TableHead>
                        <TableHead className="text-right">贷方金额</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {entries.map(e => {
                        const debitAcct = accounts?.find(
                          a => a.id === e.debitAccountId
                        );
                        const creditAcct = accounts?.find(
                          a => a.id === e.creditAccountId
                        );
                        return (
                          <TableRow key={e.id}>
                            <TableCell className="text-sm">{e.date}</TableCell>
                            <TableCell className="font-medium">
                              {e.description}
                            </TableCell>
                            <TableCell className="text-sm">
                              {debitAcct
                                ? `${debitAcct.code} ${debitAcct.name}`
                                : "-"}
                            </TableCell>
                            <TableCell className="text-right text-red-600 font-semibold">
                              ¥{e.debitAmount.toFixed(2)}
                            </TableCell>
                            <TableCell className="text-sm">
                              {creditAcct
                                ? `${creditAcct.code} ${creditAcct.name}`
                                : "-"}
                            </TableCell>
                            <TableCell className="text-right text-green-600 font-semibold">
                              ¥{e.creditAmount.toFixed(2)}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                ) : (
                  <div className="text-center py-12 text-muted-foreground">
                    <p className="mb-2">暂无分录记录</p>
                    <p className="text-sm">使用上方表单录入第一笔记账分录</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="accounts" className="mt-4">
            {acctsLoading ? (
              <Skeleton className="h-64 rounded-lg" />
            ) : accounts && accounts.length > 0 ? (
              <div className="space-y-4">
                {Object.entries(groupedAccounts).map(([type, accts]) => (
                  <Card key={type}>
                    <CardHeader>
                      <CardTitle className="text-base">
                        {ACCOUNT_TYPES[type] || type}类
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>编码</TableHead>
                            <TableHead>科目名称</TableHead>
                            <TableHead className="text-right">余额</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {accts.map((a: any) => (
                            <TableRow key={a.id}>
                              <TableCell className="text-sm text-muted-foreground">
                                {a.code}
                              </TableCell>
                              <TableCell className="font-medium">
                                {a.name}
                              </TableCell>
                              <TableCell
                                className={`text-right font-semibold ${(a.balance || 0) >= 0 ? "text-sky-600" : "text-red-600"}`}
                              >
                                ¥{(a.balance || 0).toFixed(2)}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <Card>
                <CardContent className="py-12 text-center text-muted-foreground">
                  暂无科目，请点击"初始化科目表"
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </ChronosLayout>
  );
}
