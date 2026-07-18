// 移动端底部导航条 — 在 sm 以下显示，4 个核心入口
import { useLocation } from "wouter";
import { LayoutDashboard, Kanban, Search } from "lucide-react";

const tabs = [
  { path: "/", label: "首页", icon: LayoutDashboard },
  { path: "/projects/new", label: "项目", icon: Kanban },
  { path: "/search", label: "搜索", icon: Search },
] as const;

export function MobileTabBar() {
  const [loc, navigate] = useLocation();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 flex h-16 items-center justify-around border-t border-gray-200 bg-white md:hidden safe-bottom">
      {tabs.map(({ path, label, icon: Icon }) => {
        const active = loc === path || (path !== "/" && loc.startsWith(path));
        return (
          <button
            key={path}
            onClick={() => navigate(path)}
            className={`flex flex-col items-center justify-center gap-0.5 min-w-0 flex-1 h-full px-1 transition-colors ${
              active ? "text-sky-600" : "text-gray-400 hover:text-gray-600"
            }`}
          >
            <Icon className="w-5 h-5" strokeWidth={active ? 2.5 : 2} />
            <span className="text-[10px] font-medium leading-none">
              {label}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
