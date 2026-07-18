import { useParams } from "wouter";
import { ChronosLayout } from "@/components/ChronosLayout";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { trpc } from "@/lib/trpc";
import { useState } from "react";
import { toast } from "sonner";
import {
  Plug,
  Trash2,
  CheckCircle2,
  MessageSquare,
  Bot,
  ExternalLink,
} from "lucide-react";

interface IntegrationCard {
  id: string;
  name: string;
  description: string;
  icon: React.ReactNode;
  platform: string;
  color: string;
  docs?: string;
  /** webhook: 简单 URL | sdk: BOTID + SECRET */
  mode: "webhook" | "sdk";
}

const INTEGRATIONS: IntegrationCard[] = [
  {
    id: "wecom_webhook",
    name: "企业微信群机器人",
    description: "在群里查看/创建/完成任务，录入成本。任务变更自动推送通知",
    icon: <MessageSquare className="w-5 h-5" />,
    platform: "wecom",
    color: "bg-green-500",
    mode: "webhook",
    docs: "https://work.weixin.qq.com/help?doc_id=13376",
  },
  {
    id: "wecom_bot",
    name: "企业微信自建应用回调",
    description:
      "自建应用接收消息模式：@机器人 创建/查询/完成任务。需在服务端 .env 配置 WECOM_TOKEN + WECOM_ENCODING_AES_KEY",
    icon: <Bot className="w-5 h-5" />,
    platform: "wecom_bot",
    color: "bg-emerald-600",
    mode: "sdk",
    docs: "https://developer.work.weixin.qq.com/document/path/90968",
  },
  {
    id: "dingtalk",
    name: "钉钉群机器人",
    description: "在群里查看/创建/完成任务，录入成本。任务变更自动推送通知",
    icon: <MessageSquare className="w-5 h-5" />,
    platform: "dingtalk",
    color: "bg-blue-500",
    mode: "webhook",
    docs: "https://open.dingtalk.com/document/group/robot-overview",
  },
];

export default function Integrations() {
  const params = useParams();
  const projectId = parseInt(params.projectId || "0", 10);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedPlatform, setSelectedPlatform] =
    useState<IntegrationCard | null>(null);
  const [webhookUrl, setWebhookUrl] = useState("");
  const [botId, setBotId] = useState("");
  const [botSecret, setBotSecret] = useState("");
  const [chatId, setChatId] = useState("");

  const { data: webhooks, refetch } = trpc.webhooks.getByProject.useQuery(
    { projectId },
    { enabled: projectId > 0 }
  );

  const createMutation = trpc.webhooks.create.useMutation({
    onSuccess: () => {
      toast.success("集成连接成功");
      setDialogOpen(false);
      setWebhookUrl("");
      setBotId("");
      setBotSecret("");
      setChatId("");
      refetch();
    },
  });

  const deleteMutation = trpc.webhooks.delete.useMutation({
    onSuccess: () => {
      toast.success("已断开连接");
      refetch();
    },
  });

  const handleConnect = (card: IntegrationCard) => {
    setSelectedPlatform(card);
    setWebhookUrl("");
    setBotId("");
    setBotSecret("");
    setChatId("");
    setDialogOpen(true);
  };

  const handleSubmit = () => {
    if (!selectedPlatform) return;

    if (selectedPlatform.mode === "sdk") {
      if (!botId.trim() || !botSecret.trim()) return;
      createMutation.mutate({
        projectId,
        name: selectedPlatform.name,
        platform: selectedPlatform.platform,
        webhookUrl: `sdk://${botId.trim()}`, // 占位，实际连接信息在 config
        config: JSON.stringify({
          botId: botId.trim(),
          secret: botSecret.trim(),
          chatId: chatId.trim() || null,
        }),
      });
    } else {
      if (!webhookUrl.trim()) return;
      createMutation.mutate({
        projectId,
        name: selectedPlatform.name,
        platform: selectedPlatform.platform,
        webhookUrl: webhookUrl.trim(),
      });
    }
  };

  const isConnected = (platform: string) =>
    webhooks?.some(w => w.platform === platform && w.enabled);

  const getWebhook = (platform: string) =>
    webhooks?.find(w => w.platform === platform);

  const parseConfig = (config?: string | null): Record<string, string> => {
    try {
      return config ? JSON.parse(config) : {};
    } catch {
      return {};
    }
  };

  return (
    <ChronosLayout title="应用集成">
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-foreground mb-2">应用集成</h1>
          <p className="text-muted-foreground">
            连接外部平台，实现任务通知与工作流自动化
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {INTEGRATIONS.map(card => {
            const connected = isConnected(card.platform);
            const wh = getWebhook(card.platform);
            const cfg = parseConfig(wh?.config);
            const isWecomBot = card.platform === "wecom_bot";
            return (
              <Card
                key={card.id}
                className="border-gray-200 hover:shadow-md transition-shadow"
              >
                <CardHeader>
                  <div className="flex items-center gap-3 mb-2">
                    <div
                      className={`w-10 h-10 ${card.color} rounded-lg flex items-center justify-center text-white`}
                    >
                      {card.icon}
                    </div>
                    <div>
                      <CardTitle className="text-base flex items-center gap-2">
                        {card.name}
                        {isWecomBot ? (
                          <Badge
                            variant="outline"
                            className="text-amber-600 border-amber-300 bg-amber-50 text-xs"
                          >
                            需服务端配置
                          </Badge>
                        ) : (
                          connected && (
                            <Badge
                              variant="outline"
                              className="text-green-600 border-green-300 bg-green-50 text-xs"
                            >
                              <CheckCircle2 className="w-3 h-3 mr-1" />
                              已连接
                            </Badge>
                          )
                        )}
                      </CardTitle>
                      <CardDescription className="text-xs mt-0.5">
                        {card.description}
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  {connected ? (
                    <div className="space-y-2">
                      {card.mode === "sdk" ? (
                        <div className="text-xs text-muted-foreground bg-muted rounded-md px-3 py-2">
                          <div>Bot ID: {cfg.botId?.slice(0, 20)}…</div>
                          {cfg.chatId && <div>Chat ID: {cfg.chatId}</div>}
                        </div>
                      ) : (
                        <div className="text-xs text-muted-foreground truncate bg-muted rounded-md px-3 py-2">
                          {wh?.webhookUrl}
                        </div>
                      )}
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex-1"
                          onClick={() => handleConnect(card)}
                        >
                          修改
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-destructive"
                          onClick={() => {
                            if (wh?.id) deleteMutation.mutate({ id: wh.id });
                          }}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full"
                      onClick={() => handleConnect(card)}
                    >
                      <Plug className="w-4 h-4 mr-2" />
                      连接
                    </Button>
                  )}
                </CardContent>
              </Card>
            );
          })}

          <Card className="border-dashed border-2 border-gray-200 opacity-60">
            <CardHeader>
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 bg-muted rounded-lg flex items-center justify-center">
                  <ExternalLink className="w-5 h-5 text-muted-foreground" />
                </div>
                <CardTitle className="text-base text-muted-foreground">
                  更多集成
                </CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">
                飞书、GitHub、Notion 等即将上线
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Bot Commands preview */}
        <Card className="border-gray-200">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Bot className="w-5 h-5 text-emerald-600" />
              机器人能做什么？
            </CardTitle>
            <CardDescription>
              连接成功后，在群里 @机器人 发送以下命令即可操作项目
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {[
                {
                  cmd: "/任务",
                  desc: "查看我的待办任务",
                  color: "bg-blue-50 text-blue-700 border-blue-200",
                },
                {
                  cmd: "/任务 全部",
                  desc: "查看项目中所有任务",
                  color: "bg-blue-50 text-blue-700 border-blue-200",
                },
                {
                  cmd: "/创建 修Bug",
                  desc: "快速创建新任务",
                  color: "bg-green-50 text-green-700 border-green-200",
                },
                {
                  cmd: "/完成 #5",
                  desc: "标记第 5 号任务为完成",
                  color: "bg-emerald-50 text-emerald-700 border-emerald-200",
                },
                {
                  cmd: "/今日",
                  desc: "查看今日到期任务",
                  color: "bg-orange-50 text-orange-700 border-orange-200",
                },
                {
                  cmd: "/成本 500 买服务器",
                  desc: "录入一条成本记录",
                  color: "bg-purple-50 text-purple-700 border-purple-200",
                },
              ].map((item, i) => (
                <div
                  key={i}
                  className={`flex flex-col gap-1 p-3 rounded-lg border ${item.color}`}
                >
                  <code className="text-sm font-bold">{item.cmd}</code>
                  <span className="text-xs opacity-75">{item.desc}</span>
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground mt-4">
              💡 机器人也支持不带斜杠的自然语言。输入 /帮助 查看完整命令列表。
            </p>
          </CardContent>
        </Card>

        {/* Notification events */}
        <Card className="border-gray-200">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <MessageSquare className="w-5 h-5 text-sky-600" />
              自动通知事件
            </CardTitle>
            <CardDescription>
              以下操作发生时，机器人会自动推送到群聊
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {[
                { event: "📋 任务创建", desc: "新的待办任务出现时" },
                { event: "✅ 任务完成", desc: "任务被移动到「已完成」列" },
                { event: "💰 成本录入", desc: "新成本条目被添加时" },
                { event: "⏰ 即将到期", desc: "任务临近截止日期（即将上线）" },
              ].map((item, i) => (
                <div
                  key={i}
                  className="flex items-start gap-3 p-3 rounded-lg border bg-sky-50/30 border-sky-100"
                >
                  <div className="text-sm font-medium">{item.event}</div>
                  <span className="text-xs text-muted-foreground flex-1">
                    {item.desc}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Help section */}
        <Card className="border-gray-200 bg-muted/30">
          <CardHeader>
            <CardTitle className="text-sm">如何获取连接信息？</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 text-sm text-muted-foreground">
              <p>
                <strong>群机器人：</strong>群聊 → 群设置 → 群机器人 → 添加 →
                复制 Webhook 地址
              </p>
              <p>
                <strong>SDK 机器人：</strong>企业微信管理后台 → 智能机器人 →
                创建 → API 模式 → 长连接 → 获取 Bot ID 和 Secret
              </p>
              <p>
                <strong>钉钉：</strong>群设置 → 智能群助手 → 添加机器人 → 自定义
                → 复制 Webhook
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Connect Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>连接 {selectedPlatform?.name}</DialogTitle>
            <DialogDescription>
              {selectedPlatform?.mode === "sdk"
                ? "填写 Bot ID、Secret 和 Chat ID，完成后可双向通信。"
                : "输入 Webhook 地址完成连接。"}
              {selectedPlatform?.docs && (
                <a
                  href={selectedPlatform.docs}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sky-600 hover:underline ml-1"
                >
                  查看文档 →
                </a>
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 pt-4">
            {selectedPlatform?.mode === "sdk" ? (
              <>
                <div className="rounded-lg bg-blue-50 border border-blue-200 p-4 space-y-3 text-sm">
                  <p className="font-medium text-blue-800">
                    企业微信自建应用回调配置
                  </p>
                  <p className="text-blue-700">
                    此集成通过<b>服务端环境变量</b>配置，无需在此页面填写 Bot
                    ID/Secret。
                  </p>
                  <div className="space-y-1 text-blue-600">
                    <p>
                      1. 在服务端{" "}
                      <code className="bg-blue-100 px-1 rounded">.env</code>{" "}
                      中设置：
                    </p>
                    <ul className="list-disc list-inside pl-2 space-y-0.5">
                      <li>
                        <code>WECOM_TOKEN=xxxx</code>
                      </li>
                      <li>
                        <code>WECOM_ENCODING_AES_KEY=xxxx</code>
                      </li>
                    </ul>
                    <p>
                      2. 企微管理后台 → 应用管理 → 接收消息 → 设置 API 配置：
                    </p>
                    <ul className="list-disc list-inside pl-2 space-y-0.5">
                      <li>
                        URL:{" "}
                        <code className="bg-blue-100 px-1 rounded">
                          {window.location.origin}/api/bot/callback
                        </code>
                      </li>
                      <li>Token 和 EncodingAESKey 与 .env 中的值一致</li>
                    </ul>
                    <p className="mt-2">
                      3. 配置完成后 <b>重启服务</b>，在群里 @机器人 发{" "}
                      <code>/帮助</code> 验证
                    </p>
                  </div>
                </div>
              </>
            ) : (
              <div className="space-y-2">
                <Label htmlFor="webhookUrl">Webhook 地址</Label>
                <Input
                  id="webhookUrl"
                  placeholder="https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=..."
                  value={webhookUrl}
                  onChange={e => setWebhookUrl(e.target.value)}
                />
              </div>
            )}
            {/* Callback URL notice */}
            <div className="rounded-lg bg-yellow-50 border border-yellow-200 p-3">
              <p className="text-xs font-medium text-yellow-800 mb-1">
                ⚠️ 需要在企业微信/钉钉后台配置回调地址
              </p>
              <p className="text-xs text-yellow-700 mb-2">
                将下方回调地址填入机器人配置的「接收消息 URL」中：
              </p>
              <code className="text-xs bg-yellow-100 px-2 py-1 rounded text-yellow-900 select-all block break-all">
                {window.location.origin}/api/bot/callback
              </code>
              <p className="text-xs text-yellow-600 mt-2">
                配置完成后，在群里 @机器人 发送 /帮助 测试是否通
              </p>
            </div>
            <Button
              className="w-full"
              onClick={handleSubmit}
              disabled={
                createMutation.isPending ||
                (selectedPlatform?.mode === "sdk"
                  ? !botId.trim() || !botSecret.trim()
                  : !webhookUrl.trim())
              }
            >
              {createMutation.isPending ? "连接中..." : "确认连接"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </ChronosLayout>
  );
}
