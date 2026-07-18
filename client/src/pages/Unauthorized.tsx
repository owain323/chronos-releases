export default function Unauthorized() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-white">
      <div className="text-center space-y-4">
        <h1 className="text-7xl font-bold text-muted-foreground">401</h1>
        <h2 className="text-2xl font-semibold text-foreground">未授权</h2>
        <p className="text-muted-foreground max-w-md">
          您需要登录后才能访问此页面。请先登录再试。
        </p>
        <a href="/" className="inline-block">
          <button className="inline-flex items-center justify-center rounded-md bg-sky-600 text-white px-6 py-2.5 text-sm font-medium hover:bg-sky-700">
            返回首页
          </button>
        </a>
      </div>
    </div>
  );
}
