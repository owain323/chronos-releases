import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import PrivacyPage from "@/pages/PrivacyPage";
import TermsPage from "@/pages/TermsPage";
import AuditPage from "@/pages/AuditPage";
import WorkspaceSettingsPage from "@/pages/WorkspaceSettingsPage";
import LoginPage from "@/pages/LoginPage";
import ResetPasswordPage from "@/pages/ResetPasswordPage";
import Unauthorized from "@/pages/Unauthorized";
import Forbidden from "@/pages/Forbidden";
import ServerError from "@/pages/ServerError";
import Settings from "@/pages/Settings";
import CalendarPage from "@/pages/CalendarPage";
import { AdminGuard, AuthGuard } from "@/components/AuthGuard";
import { Route, Switch, Redirect } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import TopNavBar from "./components/TopNavBar";
import SearchResults from "./pages/SearchResults";
import { CommandMenu } from "./components/CommandMenu";
import React, { Suspense } from "react";

// 重页面懒加载
const Dashboard = React.lazy(() => import("@/pages/Dashboard"));
const ProjectDetail = React.lazy(() => import("@/pages/ProjectDetail"));
const FinancialManagement = React.lazy(
  () => import("@/pages/FinancialManagement")
);
const VendorManagement = React.lazy(() => import("@/pages/VendorManagement"));
const SalesManagement = React.lazy(() => import("@/pages/SalesManagement"));
const CostManagement = React.lazy(() => import("@/pages/CostManagement"));
const FileManagement = React.lazy(() => import("@/pages/FileManagement"));
const TaskList = React.lazy(() => import("@/pages/TaskList"));
const MembersPartners = React.lazy(() => import("@/pages/MembersPartners"));
const Bookkeeping = React.lazy(() => import("@/pages/Bookkeeping"));
const FinancialReports = React.lazy(() => import("@/pages/FinancialReports"));
const WorkspacesPage = React.lazy(() => import("@/pages/WorkspacesPage"));
const Integrations = React.lazy(() => import("@/pages/Integrations"));
const NotificationCenter = React.lazy(
  () => import("@/pages/NotificationCenter")
);

// 加载占位
const PageLoading = () => (
  <div className="min-h-screen bg-white flex items-center justify-center">
    <div className="w-8 h-8 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
  </div>
);

function Router() {
  // 需要登录才能访问的组件包裹
  const Protected = ({ children }: { children: React.ReactNode }) => (
    <AuthGuard>
      <Suspense fallback={<PageLoading />}>{children}</Suspense>
    </AuthGuard>
  );

  return (
    <div className="flex flex-col min-h-screen">
      <TopNavBar />
      <div className="flex-1">
        <Switch>
          {/* 公开路由 */}
          <Route path={"/login"} component={LoginPage} />

          {/* 所有页面 — 未登录统一跳 /login */}
          <Route path={"/workspaces"}>
            {() => (
              <Protected>
                <WorkspacesPage />
              </Protected>
            )}
          </Route>
          <Route path={"/"}>
            {() => (
              <Protected>
                <Dashboard />
              </Protected>
            )}
          </Route>
          <Route path={"/dashboard"}>
            {() => (
              <Protected>
                <Dashboard />
              </Protected>
            )}
          </Route>

          {/* 子功能 — 需要登录 */}
          <Route path={"/projects/:projectId"}>
            {() => (
              <Protected>
                <ProjectDetail />
              </Protected>
            )}
          </Route>
          <Route path={"/projects/:projectId/vendors"}>
            {() => (
              <Protected>
                <VendorManagement />
              </Protected>
            )}
          </Route>
          <Route path={"/projects/:projectId/sales"}>
            {() => (
              <Protected>
                <SalesManagement />
              </Protected>
            )}
          </Route>
          <Route path={"/projects/:projectId/members"}>
            {() => (
              <Protected>
                <MembersPartners />
              </Protected>
            )}
          </Route>
          <Route path={"/projects/:projectId/calendar"}>
            {() => (
              <Protected>
                <CalendarPage />
              </Protected>
            )}
          </Route>
          <Route path={"/projects/:projectId/costs"}>
            {() => (
              <Protected>
                <CostManagement />
              </Protected>
            )}
          </Route>
          <Route path={"/projects/:projectId/finance"}>
            {() => (
              <Protected>
                <FinancialManagement />
              </Protected>
            )}
          </Route>
          <Route path={"/projects/:projectId/files"}>
            {() => (
              <Protected>
                <FileManagement />
              </Protected>
            )}
          </Route>
          <Route path={"/projects/:projectId/bookkeeping"}>
            {() => (
              <Protected>
                <Bookkeeping />
              </Protected>
            )}
          </Route>
          <Route path={"/projects/:projectId/financial-reports"}>
            {() => (
              <Protected>
                <FinancialReports />
              </Protected>
            )}
          </Route>
          <Route path={"/projects/:projectId/integrations"}>
            {() => (
              <Protected>
                <Integrations />
              </Protected>
            )}
          </Route>
          <Route path={"/projects/:projectId/tasks"}>
            {() => (
              <Protected>
                <TaskList />
              </Protected>
            )}
          </Route>
          <Route path={"/settings"}>
            {() => (
              <AdminGuard>
                <Settings />
              </AdminGuard>
            )}
          </Route>
          <Route path={"/notifications"}>
            {() => (
              <Protected>
                <NotificationCenter />
              </Protected>
            )}
          </Route>
          <Route path={"/search"}>
            {() => (
              <Protected>
                <SearchResults />
              </Protected>
            )}
          </Route>

          {/* 重定向 + 错误页 */}
          <Route path={"/projects/new"}>
            <Redirect to="/" />
          </Route>
          <Route path={"/tasks/:taskId"}>
            <Redirect to="/" />
          </Route>
          <Route path={"/401"} component={Unauthorized} />
          <Route path={"/403"} component={Forbidden} />
          <Route path={"/500"} component={ServerError} />
          <Route path={"/privacy"} component={PrivacyPage} />
          <Route path={"/auth/reset-password"} component={ResetPasswordPage} />
          <Route path={"/terms"} component={TermsPage} />
          <Route path={"/audit"}>
            {() => (
              <AdminGuard>
                <AuditPage />
              </AdminGuard>
            )}
          </Route>
          <Route
            path={"/workspaces/:wid/settings"}
            component={WorkspaceSettingsPage}
          />
          <Route path={"/404"} component={NotFound} />
          <Route component={NotFound} />
        </Switch>
      </div>
    </div>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light" switchable={true}>
        <TooltipProvider delayDuration={300}>
          <Router />
          <CommandMenu />
          <Toaster position="top-right" />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
