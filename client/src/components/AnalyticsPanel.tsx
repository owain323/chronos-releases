import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

interface AnalyticsPanelProps {
  projectId: number;
}

export default function AnalyticsPanel({ projectId }: AnalyticsPanelProps) {
  const { data: projectStats } = trpc.analytics.getProjectStats.useQuery(
    { projectId },
    { enabled: projectId > 0 }
  );

  const { data: costSummary } = trpc.analytics.getCostSummary.useQuery(
    { projectId },
    { enabled: projectId > 0 }
  );

  const COLORS = ["#0ea5e9", "#06b6d4", "#14b8a6", "#f97316"];

  const priorityMap: Record<string, string> = {
    low: "低优先级",
    medium: "中优先级",
    high: "高优先级",
    urgent: "紧急",
  };

  const taskData = projectStats?.tasksByPriority
    ? Object.entries(projectStats.tasksByPriority).map(([key, value]) => ({
        name: priorityMap[key] || key,
        value: Number(value),
      }))
    : [];

  const costData = costSummary?.byCategory
    ? Object.entries(costSummary.byCategory).map(([key, value]) => ({
        name: key,
        cost: Number(value),
      }))
    : [];

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-gradient-to-br from-sky-50 to-sky-100">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-sky-700">
              总任务数
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-sky-900">
              {projectStats?.totalTasks || 0}
            </div>
            <p className="text-xs text-sky-600 mt-1">
              已完成: {projectStats?.completedTasks || 0}
            </p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-coral-50 to-coral-100">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-coral-700">
              完成率
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-coral-900">
              {projectStats?.completionRate || 0}%
            </div>
            <p className="text-xs text-coral-600 mt-1">项目进度</p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-cool-50 to-cool-100">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-cool-700">
              总成本
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-cool-900">
              ¥{costSummary?.total?.toFixed(2) || "0.00"}
            </div>
            <p className="text-xs text-cool-600 mt-1">
              {costSummary?.count || 0} 个条目
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Task Priority Distribution */}
        <Card>
          <CardHeader>
            <CardTitle>任务优先级分布</CardTitle>
          </CardHeader>
          <CardContent>
            {projectStats?.totalTasks ? (
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={taskData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, value }) => `${name}: ${value}`}
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {taskData.map((entry, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={COLORS[index % COLORS.length]}
                      />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="py-12 text-center text-muted-foreground">
                暂无数据
              </div>
            )}
          </CardContent>
        </Card>

        {/* Cost Trend */}
        <Card>
          <CardHeader>
            <CardTitle>成本趋势</CardTitle>
          </CardHeader>
          <CardContent>
            {costSummary?.count ? (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={costData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="cost" fill="#0ea5e9" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="py-12 text-center text-muted-foreground">
                暂无数据
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Detailed Stats */}
      <Card>
        <CardHeader>
          <CardTitle>详细统计</CardTitle>
        </CardHeader>
        <CardContent>
          {projectStats?.tasksByPriority &&
          Object.keys(projectStats.tasksByPriority).length > 0 ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {Object.entries(projectStats.tasksByPriority).map(
                ([key, value]) => (
                  <div key={key} className="p-4 bg-muted rounded-lg">
                    <p className="text-xs text-muted-foreground mb-1">
                      {priorityMap[key] || key}
                    </p>
                    <p className="text-2xl font-bold text-foreground">
                      {Number(value)}
                    </p>
                  </div>
                )
              )}
            </div>
          ) : (
            <div className="py-12 text-center text-muted-foreground">
              暂无数据
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
