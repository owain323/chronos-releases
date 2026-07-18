export default function ServerError() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-white">
      <div className="text-center space-y-4">
        <h1 className="text-7xl font-bold text-muted-foreground">500</h1>
        <h2 className="text-2xl font-semibold text-foreground">服务器错误</h2>
        <p className="text-muted-foreground max-w-md">
          服务器遇到了意外错误。请稍后重试，或联系技术支持。
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
