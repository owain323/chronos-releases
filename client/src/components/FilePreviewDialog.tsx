import { useState, useEffect } from "react";
import DOMPurify from "dompurify";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  FileText,
  Image as ImageIcon,
  Calendar,
  HardDrive,
  Download,
  FileSpreadsheet,
  Trash2,
} from "lucide-react";

interface PreviewFile {
  id: number;
  fileName: string;
  fileUrl: string;
  mimeType?: string | null;
  fileSize?: number | null;
  notes?: string | null;
  recordDate?: string | null;
  createdAt: string;
}

interface FilePreviewDialogProps {
  file: PreviewFile | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function FilePreviewDialog({
  file,
  open,
  onOpenChange,
}: FilePreviewDialogProps) {
  const [notes, setNotes] = useState(file?.notes || "");
  const [html, setHtml] = useState<string | null>(null);
  const [sheetData, setSheetData] = useState<
    { name: string; rows: unknown[][] }[]
  >([]);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // 带 token 的文件 URL（/uploads 路由需鉴权）
  const fileUrl = file?.fileUrl?.startsWith("http")
    ? file.fileUrl
    : `${window.location.origin}${file?.fileUrl || ""}`;
  // httpOnly cookie 自动认证，无需 URL token
  const authedUrl = fileUrl;

  const updateNotes = trpc.files.updateNotes.useMutation({
    onSuccess: () => toast.success("备注已保存"),
  });

  const deleteFile = trpc.files.delete.useMutation({
    onSuccess: () => {
      toast.success("文件已删除");
      setConfirmDelete(false);
      onOpenChange(false);
    },
    onError: (e: any) => toast.error(e?.message || "删除失败"),
  });

  useEffect(() => {
    setNotes(file?.notes || "");
  }, [file]);

  useEffect(() => {
    if (!file || !open) return;
    setHtml(null);
    setSheetData([]);

    const ext = file.fileName.split(".").pop()?.toLowerCase() || "";

    if (ext === "docx") {
      fetch(authedUrl)
        .then(r => r.arrayBuffer())
        .then(buf =>
          import("mammoth").then(m => m.convertToHtml({ arrayBuffer: buf }))
        )
        .then(result => setHtml(result.value))
        .catch(() => setHtml("<p>无法预览此 Word 文档，请下载查看。</p>"));
    }

    if (ext === "xlsx" || ext === "xls") {
      // xlsx 体积大，按需异步加载（独立 chunk，不进首屏）
      Promise.all([fetch(authedUrl).then(r => r.arrayBuffer()), import("xlsx")])
        .then(([buf, XLSX]) => {
          const workbook = XLSX.read(buf, { type: "array" });
          const sheets = workbook.SheetNames.map(name => ({
            name,
            rows: XLSX.utils.sheet_to_json(workbook.Sheets[name], {
              header: 1,
            }) as unknown[][],
          }));
          setSheetData(sheets);
        })
        .catch(() => setSheetData([]));
    }
  }, [file, open, authedUrl]);

  if (!file) return null;

  const mime = file.mimeType || "";
  const ext = file.fileName.split(".").pop()?.toLowerCase() || "";
  const isImage = mime.startsWith("image/");
  const isPdf = mime === "application/pdf" || ext === "pdf";
  const isWord = ext === "docx" || ext === "doc";
  const isExcel = ext === "xlsx" || ext === "xls";

  const defaultTab = isImage
    ? "preview"
    : isPdf
      ? "preview"
      : isWord || isExcel
        ? "preview"
        : "info";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 truncate">
            {isImage ? (
              <ImageIcon className="w-5 h-5 text-green-500" />
            ) : (
              <FileText className="w-5 h-5 text-sky-500" />
            )}
            <span className="truncate" title={file.fileName}>
              {file.fileName}
            </span>
          </DialogTitle>
        </DialogHeader>

        <Tabs
          defaultValue={defaultTab}
          className="flex flex-col flex-1 min-h-0"
        >
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="preview">预览</TabsTrigger>
            <TabsTrigger value="info">信息</TabsTrigger>
            <TabsTrigger value="notes">备注</TabsTrigger>
          </TabsList>

          <TabsContent value="preview" className="flex-1 min-h-0 overflow-auto">
            {isImage ? (
              <img
                src={authedUrl}
                alt={file.fileName}
                className="max-w-full max-h-[60vh] mx-auto rounded border"
              />
            ) : isPdf ? (
              <iframe
                src={authedUrl}
                title={file.fileName}
                className="w-full h-[60vh] border rounded"
              />
            ) : isWord ? (
              html !== null ? (
                <div
                  className="prose max-w-none p-4 bg-white rounded border"
                  dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(html) }}
                />
              ) : (
                <div className="p-8 text-center text-muted-foreground">
                  加载中...
                </div>
              )
            ) : isExcel ? (
              sheetData.length > 0 ? (
                <div className="space-y-4 p-2">
                  {sheetData.map(sheet => (
                    <div key={sheet.name}>
                      <div className="text-sm font-semibold mb-2">
                        Sheet: {sheet.name}
                      </div>
                      <div className="overflow-auto border rounded">
                        <table className="text-sm">
                          <tbody>
                            {sheet.rows.map((row, i) => (
                              <tr key={i} className="border-b">
                                {row.map((cell, j) => (
                                  <td
                                    key={j}
                                    className="px-2 py-1 border-r whitespace-nowrap"
                                  >
                                    {cell == null ? "" : String(cell)}
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-8 text-center text-muted-foreground">
                  加载中...
                </div>
              )
            ) : (
              <div className="p-8 text-center text-muted-foreground">
                该文件类型不支持网页预览，请下载查看。
              </div>
            )}
          </TabsContent>

          <TabsContent value="info" className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-gray-50 p-3 rounded flex items-center gap-2">
                <HardDrive className="w-4 h-4 text-muted-foreground" />
                <div>
                  <div className="text-xs text-muted-foreground">大小</div>
                  <div className="text-sm font-medium">
                    {(file.fileSize ? file.fileSize / 1024 : 0).toFixed(2)} KB
                  </div>
                </div>
              </div>
              <div className="bg-gray-50 p-3 rounded flex items-center gap-2">
                <Calendar className="w-4 h-4 text-muted-foreground" />
                <div>
                  <div className="text-xs text-muted-foreground">上传时间</div>
                  <div className="text-sm font-medium">
                    {new Date(file.createdAt).toLocaleString("zh-CN")}
                  </div>
                </div>
              </div>
              <div className="bg-gray-50 p-3 rounded flex items-center gap-2">
                <FileSpreadsheet className="w-4 h-4 text-muted-foreground" />
                <div>
                  <div className="text-xs text-muted-foreground">记录日期</div>
                  <div className="text-sm font-medium">
                    {new Date(
                      file.recordDate || file.createdAt
                    ).toLocaleDateString("zh-CN")}
                  </div>
                </div>
              </div>
              <div className="bg-gray-50 p-3 rounded flex items-center gap-2">
                <FileText className="w-4 h-4 text-muted-foreground" />
                <div>
                  <div className="text-xs text-muted-foreground">类型</div>
                  <div className="text-sm font-medium">
                    {file.mimeType || "未知"}
                  </div>
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="notes" className="space-y-3">
            <Textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="填写文件备注，如：合同签署日期、用途、关联任务等..."
              className="min-h-[160px]"
            />
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                关闭
              </Button>
              <Button
                onClick={() => updateNotes.mutate({ id: file.id, notes })}
                disabled={updateNotes.isPending}
                className="bg-sky-600 hover:bg-sky-700 text-white"
              >
                {updateNotes.isPending ? "保存中..." : "保存备注"}
              </Button>
            </div>
          </TabsContent>
        </Tabs>

        <div className="flex justify-between items-center pt-2 border-t mt-2">
          <Button
            variant="outline"
            className="gap-2 text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700"
            onClick={() => setConfirmDelete(true)}
            disabled={deleteFile.isPending}
          >
            <Trash2 className="w-4 h-4" /> 删除文件
          </Button>
          <Button
            variant="outline"
            className="gap-2"
            onClick={() => window.open(authedUrl, "_blank")}
          >
            <Download className="w-4 h-4" /> 下载文件
          </Button>
        </div>
      </DialogContent>

      {/* 确认删除弹窗 */}
      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Trash2 className="w-5 h-5 text-red-500" /> 确认删除
            </DialogTitle>
            <DialogDescription>
              即将删除{" "}
              <span className="font-semibold text-gray-900">
                {file.fileName}
              </span>
              ， 此操作不可撤销，文件将从服务器永久删除。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setConfirmDelete(false)}
              disabled={deleteFile.isPending}
            >
              取消
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteFile.mutate({ id: file.id })}
              disabled={deleteFile.isPending}
              className="bg-red-600 hover:bg-red-700"
            >
              {deleteFile.isPending ? "删除中..." : "确认删除"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Dialog>
  );
}
