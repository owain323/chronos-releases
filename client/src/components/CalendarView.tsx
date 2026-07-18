import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  ChevronLeft,
  ChevronRight,
  Image as ImageIcon,
  Flag,
  CheckSquare,
  DollarSign,
  Calendar as CalendarIcon,
} from "lucide-react";

interface CalendarViewProps {
  projectId: number;
}
type ViewMode = "year" | "month" | "week";

function sameDay(a: Date, b: Date) {
  return (
    a.getDate() === b.getDate() &&
    a.getMonth() === b.getMonth() &&
    a.getFullYear() === b.getFullYear()
  );
}

export default function CalendarView({ projectId }: CalendarViewProps) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<ViewMode>("month");
  const [createOpen, setCreateOpen] = useState(false);
  const [dayDetail, setDayDetail] = useState<{ date: Date; open: boolean }>({
    date: new Date(),
    open: false,
  });
  const [createDate, setCreateDate] = useState<string>("");
  const [formData, setFormData] = useState({ title: "", description: "" });

  const { data: milestones, refetch: refetchMilestones } =
    trpc.milestones.getByProject.useQuery(
      { projectId },
      { enabled: projectId > 0 }
    );
  const { data: files } = trpc.files.getByProject.useQuery(
    { projectId },
    { enabled: projectId > 0 }
  );
  const { data: tasks } = trpc.tasks.getByProject.useQuery(
    { projectId },
    { enabled: projectId > 0 }
  );
  const { data: costs } = trpc.costs.getByProject.useQuery(
    { projectId },
    { enabled: projectId > 0 }
  );

  const createMutation = trpc.milestones.create.useMutation({
    onSuccess: () => {
      toast.success("里程碑已创建");
      setCreateOpen(false);
      setFormData({ title: "", description: "" });
      refetchMilestones();
    },
  });

  const updateMutation = trpc.milestones.update.useMutation({
    onSuccess: () => {
      toast.success("里程碑已更新");
      refetchMilestones();
    },
  });

  const deleteMutation = trpc.milestones.delete.useMutation({
    onSuccess: () => {
      toast.success("里程碑已删除");
      refetchMilestones();
    },
  });

  const monthName = currentDate.toLocaleDateString("zh-CN", {
    month: "long",
    year: "numeric",
  });
  const daysInMonth = new Date(
    currentDate.getFullYear(),
    currentDate.getMonth() + 1,
    0
  ).getDate();
  const firstDayOfMonth = new Date(
    currentDate.getFullYear(),
    currentDate.getMonth(),
    1
  ).getDay();
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);
  const emptyDays = Array.from({ length: firstDayOfMonth }, (_, i) => i);

  const getWeekDays = () => {
    const start = new Date(currentDate);
    start.setDate(start.getDate() - start.getDay());
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return d;
    });
  };

  const handlePrev = () => {
    const d = new Date(currentDate);
    if (viewMode === "year") d.setFullYear(d.getFullYear() - 1);
    else if (viewMode === "month") d.setMonth(d.getMonth() - 1);
    else d.setDate(d.getDate() - 7);
    setCurrentDate(d);
  };
  const handleNext = () => {
    const d = new Date(currentDate);
    if (viewMode === "year") d.setFullYear(d.getFullYear() + 1);
    else if (viewMode === "month") d.setMonth(d.getMonth() + 1);
    else d.setDate(d.getDate() + 7);
    setCurrentDate(d);
  };

  const getForDay = (day: number) => {
    const targets: {
      milestones: any[];
      tasks: any[];
      files: any[];
      costs: any[];
    } = { milestones: [], tasks: [], files: [], costs: [] };
    const check = (d: Date) =>
      d.getDate() === day &&
      d.getMonth() === currentDate.getMonth() &&
      d.getFullYear() === currentDate.getFullYear();
    milestones?.forEach(m => {
      if (check(new Date(m.dueDate))) targets.milestones.push(m);
    });
    tasks?.forEach(t => {
      if (t.dueDate && check(new Date(t.dueDate))) targets.tasks.push(t);
    });
    files?.forEach(f => {
      if (check(new Date(f.recordDate || f.createdAt))) targets.files.push(f);
    });
    costs?.forEach(c => {
      if (check(new Date(c.date))) targets.costs.push(c);
    });
    return targets;
  };

  const getForDate = (date: Date) => {
    const targets: {
      milestones: any[];
      tasks: any[];
      files: any[];
      costs: any[];
    } = { milestones: [], tasks: [], files: [], costs: [] };
    milestones?.forEach(m => {
      if (sameDay(new Date(m.dueDate), date)) targets.milestones.push(m);
    });
    tasks?.forEach(t => {
      if (t.dueDate && sameDay(new Date(t.dueDate), date))
        targets.tasks.push(t);
    });
    files?.forEach(f => {
      if (sameDay(new Date(f.recordDate || f.createdAt), date))
        targets.files.push(f);
    });
    costs?.forEach(c => {
      if (sameDay(new Date(c.date), date)) targets.costs.push(c);
    });
    return targets;
  };

  const openDayDetail = (date: Date) => setDayDetail({ date, open: true });
  const openCreateMilestone = (day: number) => {
    const d = new Date(currentDate.getFullYear(), currentDate.getMonth(), day);
    setCreateDate(d.toISOString().split("T")[0]);
    setFormData({ title: "", description: "" });
    setCreateOpen(true);
  };

  const dayDetailData = getForDate(dayDetail.date);
  const today = new Date();
  const weekDays = getWeekDays();
  const weekDayNames = ["日", "一", "二", "三", "四", "五", "六"];
  const monthNames = [
    "1月",
    "2月",
    "3月",
    "4月",
    "5月",
    "6月",
    "7月",
    "8月",
    "9月",
    "10月",
    "11月",
    "12月",
  ];

  const getForMonth = (month: number) => {
    const targets: {
      milestones: any[];
      tasks: any[];
      files: any[];
      costs: any[];
    } = { milestones: [], tasks: [], files: [], costs: [] };
    const check = (d: Date) =>
      d.getMonth() === month && d.getFullYear() === currentDate.getFullYear();
    milestones?.forEach(m => {
      if (check(new Date(m.dueDate))) targets.milestones.push(m);
    });
    tasks?.forEach(t => {
      if (t.dueDate && check(new Date(t.dueDate))) targets.tasks.push(t);
    });
    files?.forEach(f => {
      if (check(new Date(f.recordDate || f.createdAt))) targets.files.push(f);
    });
    costs?.forEach(c => {
      if (check(new Date(c.date))) targets.costs.push(c);
    });
    return targets;
  };

  const renderDayCell = (day: number) => {
    const { milestones: m, tasks: t, files: f, costs: c } = getForDay(day);
    const isToday =
      day === today.getDate() &&
      currentDate.getMonth() === today.getMonth() &&
      currentDate.getFullYear() === today.getFullYear();
    const total = m.length + t.length + f.length + c.length;
    return (
      <div
        key={day}
        className={`aspect-square rounded-lg border-2 p-1.5 flex flex-col overflow-hidden cursor-pointer transition-colors hover:border-sky-400 ${isToday ? "border-sky-500 bg-sky-50" : "border-gray-200 bg-white"}`}
        onClick={() =>
          openDayDetail(
            new Date(currentDate.getFullYear(), currentDate.getMonth(), day)
          )
        }
      >
        <span
          className={`text-xs font-semibold ${isToday ? "text-sky-600" : "text-foreground"}`}
        >
          {day}
        </span>
        <div className="mt-0.5 space-y-0.5 overflow-hidden">
          {m.slice(0, 1).map(i => (
            <div
              key={`m-${i.id}`}
              className={`text-xs rounded px-1 truncate cursor-pointer hover:opacity-80 flex items-center justify-between group ${
                i.completed
                  ? "bg-green-100 text-green-600 line-through"
                  : "bg-amber-100 text-amber-700"
              }`}
              onClick={() =>
                updateMutation.mutate({ id: i.id, completed: !i.completed })
              }
              title={i.completed ? "点击标记为未完成" : "点击标记为完成"}
            >
              <Flag className="w-2 h-2 inline mr-0.5" />
              {i.completed ? "✓ " : ""}
              {i.title}
              <button
                className="opacity-0 group-hover:opacity-100 ml-1 text-red-400 hover:text-red-600"
                onClick={e => {
                  e.stopPropagation();
                  deleteMutation.mutate({ id: i.id });
                }}
                title="删除里程碑"
              >
                ×
              </button>
            </div>
          ))}
          {t.slice(0, 1).map(i => (
            <div
              key={`t-${i.id}`}
              className="text-xs bg-sky-100 text-sky-700 rounded px-1 truncate"
            >
              <CheckSquare className="w-2 h-2 inline mr-0.5" />
              {i.title}
            </div>
          ))}
          {f.slice(0, 1).map(i => (
            <div
              key={`f-${i.id}`}
              className="text-xs bg-green-100 text-green-700 rounded px-1 truncate"
            >
              <ImageIcon className="w-2 h-2 inline mr-0.5" />
              {i.fileName}
            </div>
          ))}
          {c.slice(0, 1).map(i => (
            <div
              key={`c-${i.id}`}
              className="text-xs bg-rose-100 text-rose-700 rounded px-1 truncate"
            >
              <DollarSign className="w-2 h-2 inline mr-0.5" />
              {i.name}
            </div>
          ))}
          {total > 4 && (
            <div className="text-xs text-muted-foreground">+{total - 4}</div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* 工具栏 - 始终可交互 */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 pb-2">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handlePrev}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <span
              className="text-sm font-semibold min-w-[120px] text-center cursor-pointer hover:text-sky-600 transition-colors select-none"
              onClick={() => {
                if (viewMode !== "year") setViewMode("year");
              }}
              title={viewMode !== "year" ? "点击回到年视图" : ""}
            >
              {viewMode === "year"
                ? `${currentDate.getFullYear()}年`
                : viewMode === "month"
                  ? monthName
                  : `${currentDate.getFullYear()} · ${currentDate.getMonth() + 1}月`}
              {viewMode !== "year" && (
                <span className="text-muted-foreground ml-1 text-xs">年↗</span>
              )}
            </span>
            <Button variant="outline" size="sm" onClick={handleNext}>
              <ChevronRight className="w-4 h-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="text-xs text-muted-foreground"
              onClick={() => {
                setCurrentDate(new Date());
                setViewMode("month");
              }}
            >
              今天
            </Button>
          </div>
          <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
            <Button
              variant={viewMode === "year" ? "default" : "ghost"}
              size="sm"
              onClick={() => setViewMode("year")}
              className="text-xs px-3"
            >
              年
            </Button>
            <Button
              variant={viewMode === "month" ? "default" : "ghost"}
              size="sm"
              onClick={() => setViewMode("month")}
              className="text-xs px-3"
            >
              月
            </Button>
            <Button
              variant={viewMode === "week" ? "default" : "ghost"}
              size="sm"
              onClick={() => setViewMode("week")}
              className="text-xs px-3"
            >
              周
            </Button>
          </div>
        </div>
      </div>

      <Card>
        <CardContent className="pt-6">
          {viewMode === "year" ? (
            <div className="grid grid-cols-3 md:grid-cols-4 gap-4">
              {Array.from({ length: 12 }, (_, i) => {
                const month = i;
                const isCurrentMonth =
                  today.getMonth() === month &&
                  today.getFullYear() === currentDate.getFullYear();
                const {
                  milestones: m,
                  tasks: t,
                  files: f,
                  costs: c,
                } = getForMonth(month);
                const total = m.length + t.length + f.length + c.length;
                return (
                  <div
                    key={month}
                    onClick={() => {
                      const d = new Date(currentDate.getFullYear(), month, 1);
                      setCurrentDate(d);
                      setViewMode("month");
                    }}
                    className={`cursor-pointer rounded-xl border-2 p-4 transition-all hover:shadow-md hover:border-sky-300 ${
                      isCurrentMonth
                        ? "border-sky-500 bg-sky-50"
                        : "border-gray-200 bg-white"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span
                        className={`font-semibold ${isCurrentMonth ? "text-sky-700" : "text-foreground"}`}
                      >
                        {monthNames[month]}
                      </span>
                      {total > 0 && (
                        <span className="text-xs bg-sky-100 text-sky-700 px-1.5 py-0.5 rounded-full font-medium">
                          {total}
                        </span>
                      )}
                    </div>
                    <div className="space-y-1.5">
                      {m.length > 0 && (
                        <div className="text-xs text-amber-700 bg-amber-100 rounded px-1.5 py-0.5 truncate">
                          <Flag className="w-3 h-3 inline mr-0.5" />
                          {m.length} 里程碑
                        </div>
                      )}
                      {t.length > 0 && (
                        <div className="text-xs text-sky-700 bg-sky-100 rounded px-1.5 py-0.5 truncate">
                          <CheckSquare className="w-3 h-3 inline mr-0.5" />
                          {t.length} 任务
                        </div>
                      )}
                      {f.length > 0 && (
                        <div className="text-xs text-green-700 bg-green-100 rounded px-1.5 py-0.5 truncate">
                          <ImageIcon className="w-3 h-3 inline mr-0.5" />
                          {f.length} 文件
                        </div>
                      )}
                      {c.length > 0 && (
                        <div className="text-xs text-rose-700 bg-rose-100 rounded px-1.5 py-0.5 truncate">
                          <DollarSign className="w-3 h-3 inline mr-0.5" />
                          {c.length} 成本
                        </div>
                      )}
                      {total === 0 && (
                        <div className="text-xs text-muted-foreground py-1">
                          无记录
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : viewMode === "month" ? (
            <>
              <div className="grid grid-cols-7 gap-1.5 mb-2">
                {weekDayNames.map(d => (
                  <div
                    key={d}
                    className="text-center text-xs font-semibold text-muted-foreground py-1"
                  >
                    {d}
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-1.5">
                {emptyDays.map(i => (
                  <div
                    key={`e-${i}`}
                    className="aspect-square bg-gray-50 rounded-lg"
                  />
                ))}
                {days.map(renderDayCell)}
              </div>
            </>
          ) : (
            <>
              <div className="grid grid-cols-7 gap-1.5 mb-2">
                {weekDays.map((d, i) => (
                  <div
                    key={i}
                    className="text-center text-xs font-semibold text-muted-foreground py-1"
                  >
                    {weekDayNames[i]} {d.getDate()}
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-1.5">
                {weekDays.map((d, i) => {
                  const {
                    milestones: m,
                    tasks: t,
                    files: f,
                    costs: c,
                  } = getForDate(d);
                  const isToday = sameDay(d, today);
                  const total = m.length + t.length + f.length + c.length;
                  return (
                    <div
                      key={i}
                      className={`rounded-lg border-2 p-2 flex flex-col min-h-[120px] cursor-pointer transition-colors hover:border-sky-400 ${isToday ? "border-sky-500 bg-sky-50" : "border-gray-200 bg-white"}`}
                      onClick={() => openDayDetail(d)}
                    >
                      <span
                        className={`text-xs font-semibold mb-1 ${isToday ? "text-sky-600" : "text-foreground"}`}
                      >
                        {d.getDate()}
                      </span>
                      <div className="space-y-0.5 overflow-hidden flex-1">
                        {m.slice(0, 1).map(i => (
                          <div
                            key={`wm-${i.id}`}
                            className="text-xs bg-amber-100 text-amber-700 rounded px-1 truncate"
                          >
                            <Flag className="w-2 h-2 inline mr-0.5" />
                            {i.title}
                          </div>
                        ))}
                        {t.slice(0, 1).map(i => (
                          <div
                            key={`wt-${i.id}`}
                            className="text-xs bg-sky-100 text-sky-700 rounded px-1 truncate"
                          >
                            <CheckSquare className="w-2 h-2 inline mr-0.5" />
                            {i.title}
                          </div>
                        ))}
                        {f.slice(0, 1).map(i => (
                          <div
                            key={`wf-${i.id}`}
                            className="text-xs bg-green-100 text-green-700 rounded px-1 truncate"
                          >
                            <ImageIcon className="w-2 h-2 inline mr-0.5" />
                            {i.fileName}
                          </div>
                        ))}
                        {c.slice(0, 1).map(i => (
                          <div
                            key={`wc-${i.id}`}
                            className="text-xs bg-rose-100 text-rose-700 rounded px-1 truncate"
                          >
                            <DollarSign className="w-2 h-2 inline mr-0.5" />
                            {i.name}
                          </div>
                        ))}
                      </div>
                      {total > 4 && (
                        <div className="text-xs text-muted-foreground">
                          +{total - 4}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Create milestone dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>创建里程碑</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 pt-2">
            <div>
              <Label>日期</Label>
              <Input value={createDate} disabled />
            </div>
            <div>
              <Label>标题</Label>
              <Input
                value={formData.title}
                onChange={e =>
                  setFormData({ ...formData, title: e.target.value })
                }
                placeholder="如：第一阶段验收"
              />
            </div>
            <div>
              <Label>描述（可选）</Label>
              <Textarea
                value={formData.description}
                onChange={e =>
                  setFormData({ ...formData, description: e.target.value })
                }
                placeholder="里程碑说明"
              />
            </div>
            <Button
              className="w-full"
              onClick={() =>
                createMutation.mutate({
                  projectId,
                  title: formData.title,
                  description: formData.description,
                  dueDate: new Date(createDate),
                })
              }
              disabled={createMutation.isPending || !formData.title.trim()}
            >
              {createMutation.isPending ? "创建中..." : "创建里程碑"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Day detail dialog */}
      <Dialog
        open={dayDetail.open}
        onOpenChange={open => {
          if (!open) setDayDetail(prev => ({ ...prev, open: false }));
        }}
      >
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CalendarIcon className="w-5 h-5 text-sky-600" />
              {dayDetail.date.toLocaleDateString("zh-CN", {
                year: "numeric",
                month: "long",
                day: "numeric",
              })}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <Button
              size="sm"
              className="bg-sky-600 hover:bg-sky-700 text-white"
              onClick={() => {
                setDayDetail(prev => ({ ...prev, open: false }));
                openCreateMilestone(dayDetail.date.getDate());
              }}
            >
              创建里程碑
            </Button>

            {dayDetailData.milestones.length > 0 && (
              <div>
                <h4 className="text-sm font-semibold mb-2 flex items-center gap-1">
                  <Flag className="w-4 h-4 text-amber-500" /> 里程碑
                </h4>
                <div className="space-y-2">
                  {dayDetailData.milestones.map(m => (
                    <Card key={m.id} className="p-3">
                      <div className="font-medium">{m.title}</div>
                      <div className="text-sm text-muted-foreground">
                        {m.description || "无描述"}
                      </div>
                    </Card>
                  ))}
                </div>
              </div>
            )}

            {dayDetailData.tasks.length > 0 && (
              <div>
                <h4 className="text-sm font-semibold mb-2 flex items-center gap-1">
                  <CheckSquare className="w-4 h-4 text-sky-500" /> 任务
                </h4>
                <div className="space-y-2">
                  {dayDetailData.tasks.map(t => (
                    <Card key={t.id} className="p-3">
                      <div className="font-medium">{t.title}</div>
                      <div className="text-sm text-muted-foreground">
                        {t.description || "无描述"}
                      </div>
                      <div className="text-xs mt-1">优先级：{t.priority}</div>
                    </Card>
                  ))}
                </div>
              </div>
            )}

            {dayDetailData.costs.length > 0 && (
              <div>
                <h4 className="text-sm font-semibold mb-2 flex items-center gap-1">
                  <DollarSign className="w-4 h-4 text-rose-500" /> 成本
                </h4>
                <div className="space-y-2">
                  {dayDetailData.costs.map(c => (
                    <Card key={c.id} className="p-3">
                      <div className="font-medium">{c.name}</div>
                      <div className="text-sm text-muted-foreground">
                        {c.notes || "无备注"}
                      </div>
                      <div className="text-sm font-semibold text-sky-600 mt-1">
                        ¥{c.amount.toFixed(2)} · {c.category}
                      </div>
                    </Card>
                  ))}
                </div>
              </div>
            )}

            {dayDetailData.files.length > 0 && (
              <div>
                <h4 className="text-sm font-semibold mb-2 flex items-center gap-1">
                  <ImageIcon className="w-4 h-4 text-green-500" /> 文件 / 图片
                </h4>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {dayDetailData.files.map(f => (
                    <a
                      key={f.id}
                      href={f.fileUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="block group"
                    >
                      <Card className="p-2 overflow-hidden">
                        {f.fileUrl &&
                        (f.fileName || "").match(
                          /\.(jpg|jpeg|png|gif|webp)$/i
                        ) ? (
                          <img
                            src={f.fileUrl}
                            alt={f.fileName}
                            className="w-full h-28 object-cover rounded mb-2 group-hover:opacity-90"
                          />
                        ) : (
                          <div className="w-full h-28 flex items-center justify-center bg-gray-100 rounded mb-2 text-muted-foreground">
                            <ImageIcon className="w-8 h-8" />
                          </div>
                        )}
                        <div className="text-xs truncate">{f.fileName}</div>
                      </Card>
                    </a>
                  ))}
                </div>
              </div>
            )}

            {dayDetailData.milestones.length +
              dayDetailData.tasks.length +
              dayDetailData.costs.length +
              dayDetailData.files.length ===
              0 && (
              <div className="text-center py-8 text-muted-foreground">
                当天没有记录
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Legend */}
      <Card>
        <CardContent className="py-3 flex items-center gap-6 text-sm text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <Flag className="w-3.5 h-3.5 text-amber-500" /> 里程碑
          </span>
          <span className="flex items-center gap-1.5">
            <CheckSquare className="w-3.5 h-3.5 text-sky-500" /> 任务
          </span>
          <span className="flex items-center gap-1.5">
            <DollarSign className="w-3.5 h-3.5 text-rose-500" /> 成本
          </span>
          <span className="flex items-center gap-1.5">
            <ImageIcon className="w-3.5 h-3.5 text-green-500" /> 文件
          </span>
          <span className="ml-auto text-xs">点日期查看当天内容</span>
        </CardContent>
      </Card>
    </div>
  );
}
