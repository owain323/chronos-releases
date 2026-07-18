import { useParams } from "wouter";
import { ChronosLayout } from "@/components/ChronosLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Upload,
  Download,
  Trash2,
  Clock,
  Image as ImageIcon,
  Calendar,
  Check,
  X,
  Search,
} from "lucide-react";
import { useState, useRef, useEffect } from "react";
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
import { Input } from "@/components/ui/input";
import FilePreviewDialog from "@/components/FilePreviewDialog";

export default function FileManagement() {
  const params = useParams();
  const projectId = parseInt(params.projectId || "0", 10);

  const {
    data: files,
    isLoading,
    refetch,
  } = trpc.files.getByProject.useQuery(
    { projectId },
    { enabled: projectId > 0 }
  );

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<any[] | null>(null);
  const [showDropdown, setShowDropdown] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const [previewFile, setPreviewFile] = useState<any | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);

  // 关闭搜索下拉（点击外部）
  useEffect(() => {
    function click(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node))
        setShowDropdown(false);
    }
    document.addEventListener("mousedown", click);
    return () => document.removeEventListener("mousedown", click);
  }, []);

  const handleSearch = () => {
    if (!searchQuery.trim() || !files) {
      setSearchResults(null);
      setShowDropdown(false);
      return;
    }
    const q = searchQuery.toLowerCase();
    const results = files.filter(
      f =>
        f.fileName.toLowerCase().includes(q) ||
        (f.notes || "").toLowerCase().includes(q)
    );
    setSearchResults(results);
    setShowDropdown(true);
  };

  const scrollToFile = (fileId: number) => {
    setShowDropdown(false);
    setTimeout(() => {
      const el = document.querySelector(`[data-file-id="${fileId}"]`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        el.classList.add("file-search-highlight");
        setTimeout(() => el.classList.remove("file-search-highlight"), 2100);
      }
    }, 200);
  };

  // 按回车触发搜索
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleSearch();
  };

  const createFileMutation = trpc.files.create.useMutation({
    onSuccess: () => {
      toast.success("文件上传成功");
      setIsDialogOpen(false);
      refetch();
    },
    onError: (error: any) => {
      toast.error(error.message || "文件上传失败");
    },
  });

  const updateDateMutation = trpc.files.updateRecordDate.useMutation({
    onSuccess: () => {
      refetch();
    },
  });

  const deleteMutation = trpc.files.delete.useMutation({
    onSuccess: () => {
      toast.success("文件已删除");
      refetch();
    },
  });

  const [isDragging, setIsDragging] = useState(false);

  const uploadFile = async (file: File) => {
    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);

      const wid = localStorage.getItem("currentWorkspaceId");
      const res = await fetch("/api/upload", {
        method: "POST",
        headers: wid ? { "x-workspace-id": wid } : {},
        body: formData,
      });
      const upload = await res.json();
      if (!res.ok || !upload.fileUrl)
        throw new Error(upload.error || "上传失败");

      const fileKey = upload.fileUrl
        .replace("/uploads/", "")
        .replace(/^.*\//, "");
      createFileMutation.mutate({
        projectId,
        fileName: file.name,
        fileKey,
        fileUrl: upload.fileUrl,
        fileSize: upload.fileSize,
        mimeType: file.type,
        recordDate: new Date().toISOString(),
      });
    } catch (err: any) {
      toast.error(err.message || "文件上传失败");
    } finally {
      setIsUploading(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await uploadFile(file);
    e.target.value = "";
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    await uploadFile(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const groupedFiles =
    files?.reduce((acc: Record<string, any[]>, file) => {
      const baseName = file.fileName.split(".")[0];
      if (!acc[baseName]) {
        acc[baseName] = [];
      }
      acc[baseName].push(file);
      return acc;
    }, {}) || {};

  return (
    <ChronosLayout title="文件管理">
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
              <BreadcrumbPage>文件管理</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground">文件快照备份</h1>
            <p className="text-muted-foreground mt-1">
              上传、管理和版本控制项目文件
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="relative" ref={searchRef}>
              <div className="flex items-center gap-1">
                <div className="relative">
                  <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="搜索文件名或备注..."
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    onKeyDown={handleKeyDown}
                    onFocus={() => {
                      if (searchResults && searchResults.length > 0)
                        setShowDropdown(true);
                    }}
                    className="pl-8 w-56"
                  />
                  {searchQuery && (
                    <button
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      onClick={() => {
                        setSearchQuery("");
                        setSearchResults(null);
                        setShowDropdown(false);
                      }}
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
                <Button
                  size="sm"
                  onClick={handleSearch}
                  className="bg-sky-600 hover:bg-sky-700 text-white h-9"
                >
                  搜索
                </Button>
              </div>
              {showDropdown && searchResults && (
                <Card className="absolute top-full mt-2 right-0 w-[calc(100vw-2rem)] sm:w-96 max-h-72 overflow-y-auto shadow-xl z-50 bg-white">
                  <div className="px-3 py-2 text-xs text-gray-500 border-b bg-gray-50 font-medium">
                    找到 {searchResults.length} 个文件
                  </div>
                  {searchResults.length === 0 ? (
                    <div className="p-4 text-center text-sm text-gray-500">
                      没有匹配的文件
                    </div>
                  ) : (
                    searchResults.map(f => (
                      <div
                        key={f.id}
                        className="w-full px-3 py-2.5 hover:bg-sky-50 border-b border-gray-100 flex items-center gap-3 cursor-pointer transition-colors"
                        onClick={() => scrollToFile(f.id)}
                      >
                        <div className="shrink-0">
                          {(f.mimeType || "").startsWith("image/") ? (
                            <ImageIcon className="w-4 h-4 text-green-500" />
                          ) : (
                            <Clock className="w-4 h-4 text-sky-500" />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div
                            className="text-sm font-medium text-foreground truncate max-w-[280px]"
                            title={f.fileName}
                          >
                            {f.fileName}
                          </div>
                          <div className="text-xs text-gray-500 mt-0.5">
                            {new Date(
                              f.recordDate || f.createdAt
                            ).toLocaleDateString("zh-CN")}{" "}
                            · {(f.fileSize ? f.fileSize / 1024 : 0).toFixed(1)}{" "}
                            KB
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </Card>
              )}
            </div>
          </div>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2 bg-sky-600 hover:bg-sky-700 text-white">
                <Upload className="w-4 h-4" />
                上传文件
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>上传文件</DialogTitle>
                <DialogDescription>选择要上传的图片或文档</DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div
                  className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer ${
                    isDragging
                      ? "border-sky-500 bg-sky-50"
                      : "border-gray-200 hover:border-sky-400"
                  }`}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                >
                  <input
                    type="file"
                    id="file-input"
                    className="hidden"
                    onChange={handleFileUpload}
                    disabled={isUploading}
                  />
                  <label
                    htmlFor="file-input"
                    className="cursor-pointer flex flex-col items-center"
                  >
                    <Upload className="w-8 h-8 text-muted-foreground mb-2" />
                    <p className="text-sm font-medium text-foreground">
                      {isUploading ? "上传中..." : "点击选择文件或拖拽上传"}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      支持图片、PDF、文档等格式
                    </p>
                  </label>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {/* File Statistics */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="bg-gradient-to-br from-sky-50 to-sky-100">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-sky-700">
                总文件数
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-sky-900">
                {files?.length || 0}
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-coral-50 to-coral-100">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-coral-700">
                文件类型
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-coral-900">
                {Object.keys(groupedFiles).length}
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-cool-50 to-cool-100">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-cool-700">
                总大小
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-cool-900">
                {files
                  ? (
                      files.reduce((sum, f) => sum + (f.fileSize || 0), 0) /
                      1024 /
                      1024
                    ).toFixed(2)
                  : "0.00"}{" "}
                MB
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Files by Document */}
        {isLoading ? (
          <div className="space-y-4">
            {[1, 2, 3].map(i => (
              <Skeleton key={i} className="h-32 w-full rounded-lg" />
            ))}
          </div>
        ) : files && files.length > 0 ? (
          <div className="space-y-4">
            {Object.entries(groupedFiles).map(([baseName, versions]) => (
              <Card key={baseName} className="border-gray-200">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {versions[0]?.mimeType?.startsWith("image") ? (
                        <ImageIcon className="w-5 h-5 text-sky-600" />
                      ) : (
                        <Clock className="w-5 h-5 text-sky-600" />
                      )}
                      <div>
                        <CardTitle className="text-base">{baseName}</CardTitle>
                        <p className="text-xs text-muted-foreground mt-1">
                          {versions.length} 个版本
                        </p>
                      </div>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {versions.map((file, idx) => (
                      <div
                        key={file.id}
                        className="flex items-center justify-between p-3 bg-muted rounded-lg"
                      >
                        <div className="flex-1">
                          <p className="text-sm font-medium text-foreground">
                            版本 {versions.length - idx}
                          </p>
                          <p className="text-xs text-muted-foreground mt-1">
                            {new Date(file.createdAt).toLocaleString("zh-CN")} •{" "}
                            {file.fileSize
                              ? (file.fileSize / 1024).toFixed(2)
                              : "0"}{" "}
                            KB
                          </p>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              window.open(file.fileUrl, "_blank");
                            }}
                          >
                            <Download className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive hover:text-destructive"
                            onClick={() => {
                              if (confirm("确定删除此文件吗？")) {
                                deleteMutation.mutate({ id: file.id });
                              }
                            }}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <Card
            className={`border-dashed border-2 transition-colors ${isDragging ? "border-sky-500 bg-sky-50" : ""}`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            <CardContent className="py-12 text-center">
              <Upload className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-50" />
              <p className="text-muted-foreground mb-4">
                暂无文件，拖拽或点击上传
              </p>
              <Button
                variant="outline"
                onClick={() => setIsDialogOpen(true)}
                className="gap-2"
              >
                <Upload className="w-4 h-4" />
                上传第一个文件
              </Button>
            </CardContent>
          </Card>
        )}

        {/* File History */}
        {files && files.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>所有文件</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>文件名</TableHead>
                      <TableHead>大小</TableHead>
                      <TableHead>类型</TableHead>
                      <TableHead>上传时间</TableHead>
                      <TableHead>记录日期</TableHead>
                      <TableHead>操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {files.map(file => (
                      <TableRow key={file.id} data-file-id={file.id}>
                        <TableCell className="font-medium">
                          <button
                            className="text-left hover:text-sky-600 hover:underline cursor-pointer"
                            onClick={() => {
                              setPreviewFile(file);
                              setPreviewOpen(true);
                            }}
                          >
                            {file.fileName}
                          </button>
                        </TableCell>
                        <TableCell className="text-sm">
                          {file.fileSize
                            ? (file.fileSize / 1024).toFixed(2)
                            : "0"}{" "}
                          KB
                        </TableCell>
                        <TableCell className="text-sm">
                          <span className="px-2 py-1 bg-muted rounded text-xs">
                            {file.mimeType || "未知"}
                          </span>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {new Date(file.createdAt).toLocaleDateString("zh-CN")}
                        </TableCell>
                        <TableCell className="text-sm">
                          <InlineDateCell
                            fileId={file.id}
                            value={file.recordDate || file.createdAt}
                            onSave={(id, d) =>
                              updateDateMutation.mutate({ id, recordDate: d })
                            }
                          />
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                window.open(file.fileUrl, "_blank");
                              }}
                            >
                              <Download className="w-4 h-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        )}

        <FilePreviewDialog
          file={previewFile}
          open={previewOpen}
          onOpenChange={setPreviewOpen}
        />
      </div>
    </ChronosLayout>
  );
}

/** 行内日期编辑组件 */
function InlineDateCell({
  fileId,
  value,
  onSave,
}: {
  fileId: number;
  value: string;
  onSave: (id: number, date: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const d = new Date(value);
  const formatted = d.toLocaleDateString("zh-CN");
  const dateStr = d.toISOString().split("T")[0];
  const [temp, setTemp] = useState(dateStr);

  if (!editing) {
    return (
      <button
        className="text-sky-600 hover:underline text-sm cursor-pointer flex items-center gap-1"
        onClick={() => setEditing(true)}
        title="点击修改记录日期"
      >
        <Calendar className="w-3 h-3" />
        {formatted}
      </button>
    );
  }

  return (
    <div className="flex items-center gap-1">
      <input
        type="date"
        value={temp}
        onChange={e => setTemp(e.target.value)}
        className="border rounded px-1 py-0.5 text-xs w-28"
        autoFocus
      />
      <button
        className="text-green-600 hover:text-green-800"
        onClick={() => {
          onSave(fileId, new Date(temp).toISOString());
          setEditing(false);
        }}
      >
        <Check className="w-3.5 h-3.5" />
      </button>
      <button
        className="text-muted-foreground hover:text-foreground"
        onClick={() => setEditing(false)}
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
