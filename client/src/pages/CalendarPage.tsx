import { useParams } from "wouter";
import { ChronosLayout } from "@/components/ChronosLayout";
import CalendarView from "@/components/CalendarView";
import { PageHeader } from "@/components/layout/page-header";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/lib/trpc";

export default function CalendarPage() {
  const params = useParams();
  const projectId = parseInt(params.projectId || "0", 10);
  const { data: project, isLoading } = trpc.projects.getById.useQuery(
    { projectId },
    { enabled: projectId > 0 }
  );

  if (isLoading) {
    return (
      <ChronosLayout title="日历">
        <div className="p-6">
          <Skeleton className="h-96" />
        </div>
      </ChronosLayout>
    );
  }

  return (
    <ChronosLayout title="日历">
      <div className="space-y-4 p-6">
        <Breadcrumb className="mb-1">
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink href="/dashboard">仪表盘</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink href={`/projects/${projectId}`}>
                {project?.name || "项目"}
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>日历</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        <PageHeader
          title="项目日历"
          description={`查看项目里程碑、截止日期与文件动态`}
        />

        <CalendarView projectId={projectId} />
      </div>
    </ChronosLayout>
  );
}
