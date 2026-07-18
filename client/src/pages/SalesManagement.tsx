import { useParams, useSearch } from "wouter";
import { useEffect } from "react";
import { ChronosLayout } from "@/components/ChronosLayout";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Smartphone, Mail, Phone, Pencil } from "lucide-react";
import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

export default function SalesManagement() {
  const params = useParams();
  const projectId = parseInt(params.projectId || "0", 10);

  const {
    data: customers,
    isLoading,
    refetch,
  } = trpc.customers.getByProject.useQuery(
    { projectId },
    { enabled: projectId > 0 }
  );

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    description: "",
  });

  const createCustomerMutation = trpc.customers.create.useMutation({
    onSuccess: () => {
      toast.success("客户创建成功");
      setFormData({ name: "", description: "" });
      setIsDialogOpen(false);
      refetch();
    },
    onError: error => {
      toast.error(error.message || "创建客户失败");
    },
  });

  const handleCreateCustomer = () => {
    if (!formData.name.trim()) {
      toast.error("请输入客户名称");
      return;
    }

    createCustomerMutation.mutate({
      projectId,
      name: formData.name,
      description: formData.description,
    });
  };

  // 搜索结果高亮定位
  const search = useSearch();
  const highlightId = new URLSearchParams(search).get("highlight");
  useEffect(() => {
    if (highlightId && customers?.length) {
      const t = setTimeout(() => {
        const el = document.querySelector(`[data-highlight="${highlightId}"]`);
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "center" });
          el.classList.add("search-highlight");
          setTimeout(() => el.classList.remove("search-highlight"), 2100);
        }
      }, 300);
      return () => clearTimeout(t);
    }
  }, [highlightId, customers]);

  return (
    <ChronosLayout title="销售方">
      <div className="space-y-6">
        <PageHeader
          title="销售方管理"
          description={`共 ${customers?.length || 0} 个销售方`}
          breadcrumbs={[
            { label: "仪表盘", href: "/dashboard" },
            { label: "项目", href: `/projects/${projectId}` },
            { label: "销售方管理" },
          ]}
          actions={
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
              <DialogTrigger asChild>
                <Button className="gap-2 bg-sky-600 hover:bg-sky-700 text-white">
                  <Plus className="w-4 h-4" /> 新增销售方
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>添加新客户</DialogTitle>
                  <DialogDescription>填写客户的基本信息</DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="customer-name">客户名称</Label>
                    <Input
                      id="customer-name"
                      placeholder="例如：ABC 科技有限公司"
                      value={formData.name}
                      onChange={e =>
                        setFormData({ ...formData, name: e.target.value })
                      }
                    />
                  </div>
                  <div>
                    <Label htmlFor="customer-desc">描述</Label>
                    <Textarea
                      id="customer-desc"
                      placeholder="客户的简要描述"
                      value={formData.description}
                      onChange={e =>
                        setFormData({
                          ...formData,
                          description: e.target.value,
                        })
                      }
                    />
                  </div>
                  <Button
                    onClick={handleCreateCustomer}
                    disabled={createCustomerMutation.isPending}
                    className="w-full bg-sky-600 hover:bg-sky-700 text-white"
                  >
                    {createCustomerMutation.isPending
                      ? "添加中..."
                      : "添加客户"}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          }
        />
        {/* Customers Grid */}
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map(i => (
              <Skeleton key={i} className="h-64 rounded-lg" />
            ))}
          </div>
        ) : customers && customers.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {customers.map(customer => (
              <div key={customer.id} data-highlight={customer.id}>
                <CustomerCard
                  key={customer.id}
                  customer={customer}
                  projectId={projectId}
                  onRefresh={refetch}
                />
              </div>
            ))}
          </div>
        ) : (
          <Card className="border-dashed border-2">
            <CardContent className="py-12 text-center">
              <p className="text-muted-foreground mb-4">暂无客户</p>
              <Button
                variant="outline"
                onClick={() => setIsDialogOpen(true)}
                className="gap-2"
              >
                <Plus className="w-4 h-4" />
                添加第一个客户
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </ChronosLayout>
  );
}

interface CustomerCardProps {
  customer: any;
  projectId: number;
  onRefresh: () => void;
}

function CustomerCard({
  customer,
  projectId: _projectId,
  onRefresh,
}: CustomerCardProps) {
  const [isContactDialogOpen, setIsContactDialogOpen] = useState(false);
  const [contactForm, setContactForm] = useState({
    name: "",
    phone: "",
    landline: "",
    email: "",
    role: "other" as const,
    notes: "",
  });
  const [editForm, setEditForm] = useState({ name: "", description: "" });
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingContactId, setEditingContactId] = useState<number | null>(null);

  const { data: contacts, isLoading } =
    trpc.customerContacts.getByCustomer.useQuery(
      { customerId: customer.id },
      { enabled: !!customer.id }
    );

  const createContactMutation = trpc.customerContacts.create.useMutation({
    onSuccess: () => {
      toast.success("联系人添加成功");
      setContactForm({
        name: "",
        phone: "",
        landline: "",
        email: "",
        role: "other",
        notes: "",
      });
      setIsContactDialogOpen(false);
      onRefresh();
    },
    onError: error => {
      toast.error(error.message || "添加联系人失败");
    },
  });

  const updateContactMutation = trpc.customerContacts.update.useMutation({
    onSuccess: () => {
      toast.success("联系人已更新");
      setContactForm({
        name: "",
        phone: "",
        landline: "",
        email: "",
        role: "other",
        notes: "",
      });
      setIsContactDialogOpen(false);
      setEditingContactId(null);
      onRefresh();
    },
    onError: error => {
      console.error("[updateCustomerContact] Mutation error:", error);
      console.error(
        "[updateCustomerContact] Error shape:",
        (error as any).shape
      );
      toast.error(error.message || "更新失败");
    },
  });

  const updateCustomerMutation = trpc.customers.update.useMutation({
    onSuccess: () => {
      toast.success("客户信息已更新");
      setIsEditDialogOpen(false);
      onRefresh();
    },
    onError: error => {
      toast.error(error.message || "更新失败");
    },
  });

  const handleAddContact = () => {
    if (!contactForm.name.trim()) {
      toast.error("请输入联系人名称");
      return;
    }

    // 确保 role 是有效值
    const validRoles = ["purchaser", "sales", "manager", "other"] as const;
    const safeRole = validRoles.includes(contactForm.role as any)
      ? (contactForm.role as (typeof validRoles)[number])
      : "other";

    if (editingContactId) {
      updateContactMutation.mutate({
        id: editingContactId,
        name: contactForm.name,
        phone: contactForm.phone || null,
        landline: contactForm.landline || null,
        email: contactForm.email || null,
        role: safeRole,
        notes: contactForm.notes || null,
      });
    } else {
      createContactMutation.mutate({
        customerId: customer.id,
        name: contactForm.name,
        phone: contactForm.phone || undefined,
        landline: contactForm.landline || undefined,
        email: contactForm.email || undefined,
        role: safeRole,
        notes: contactForm.notes,
      });
    }
  };

  const contactCount = contacts?.length || 0;
  const isContactLimitReached = contactCount >= 5;

  return (
    <Card className="border-gray-200 hover:shadow-md transition-shadow">
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <CardTitle className="text-lg">{customer.name}</CardTitle>
            {customer.description && (
              <p className="text-sm text-muted-foreground line-clamp-2">
                {customer.description}
              </p>
            )}
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0"
            title="编辑客户"
            onClick={() => {
              setEditForm({
                name: customer.name,
                description: customer.description || "",
              });
              setIsEditDialogOpen(true);
            }}
          >
            <Pencil className="w-4 h-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Contacts */}
        <div>
          <h3 className="text-sm font-semibold text-foreground mb-2">
            联系人 ({contactCount})
          </h3>
          {isLoading ? (
            <div className="space-y-2">
              {[1, 2].map(i => (
                <Skeleton key={i} className="h-8 w-full rounded" />
              ))}
            </div>
          ) : contacts && contacts.length > 0 ? (
            <div className="space-y-2 max-h-40 overflow-y-auto">
              {contacts.slice(0, 5).map((contact: any) => (
                <div
                  key={contact.id}
                  className="text-xs p-2 bg-muted rounded flex items-start justify-between"
                >
                  <div className="flex-1">
                    <p className="font-medium text-foreground">
                      {contact.name}
                    </p>
                    <div className="flex flex-wrap gap-2 mt-1 text-muted-foreground">
                      {contact.phone && (
                        <span className="flex items-center gap-1">
                          <Smartphone className="w-3 h-3" />
                          {contact.phone}
                        </span>
                      )}
                      {contact.landline && (
                        <span className="flex items-center gap-1">
                          <Phone className="w-3 h-3" />
                          {contact.landline}
                        </span>
                      )}
                      {contact.email && (
                        <span className="flex items-center gap-1">
                          <Mail className="w-3 h-3" />
                          {contact.email}
                        </span>
                      )}
                    </div>
                    {contact.notes && (
                      <p className="text-muted-foreground mt-1">
                        备注: {contact.notes}
                      </p>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 shrink-0 text-muted-foreground hover:text-sky-600"
                    title="编辑联系人"
                    onClick={() => {
                      setEditingContactId(contact.id);
                      setContactForm({
                        name: contact.name,
                        phone: contact.phone || "",
                        landline: contact.landline || "",
                        email: contact.email || "",
                        role: contact.role || "other",
                        notes: contact.notes || "",
                      });
                      setIsContactDialogOpen(true);
                    }}
                  >
                    <Pencil className="w-3 h-3" />
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">暂无联系人</p>
          )}
        </div>

        {/* Add Contact Button */}
        {isContactLimitReached ? (
          <Button variant="outline" size="sm" className="w-full gap-2" disabled>
            <Plus className="w-3 h-3" />
            联系人已满（{contactCount}/5）
          </Button>
        ) : (
          <Dialog
            open={isContactDialogOpen}
            onOpenChange={v => {
              setIsContactDialogOpen(v);
              if (!v) {
                setEditingContactId(null);
                setContactForm({
                  name: "",
                  phone: "",
                  landline: "",
                  email: "",
                  role: "other",
                  notes: "",
                });
              }
            }}
          >
            <DialogTrigger asChild>
              <Button variant="outline" size="sm" className="w-full gap-2">
                <Plus className="w-3 h-3" />
                添加联系人
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>
                  {editingContactId ? "编辑联系人" : "添加联系人"}
                </DialogTitle>
                {!editingContactId && (
                  <DialogDescription>
                    为 {customer.name} 添加联系人信息
                  </DialogDescription>
                )}
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="contact-name">
                    名称 <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="contact-name"
                    placeholder="联系人名称"
                    value={contactForm.name}
                    onChange={e =>
                      setContactForm({ ...contactForm, name: e.target.value })
                    }
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor="contact-phone">手机</Label>
                    <Input
                      id="contact-phone"
                      placeholder="手机号码"
                      value={contactForm.phone}
                      onChange={e =>
                        setContactForm({
                          ...contactForm,
                          phone: e.target.value,
                        })
                      }
                    />
                  </div>
                  <div>
                    <Label htmlFor="contact-landline">固定电话</Label>
                    <Input
                      id="contact-landline"
                      placeholder="固定电话"
                      value={contactForm.landline}
                      onChange={e =>
                        setContactForm({
                          ...contactForm,
                          landline: e.target.value,
                        })
                      }
                    />
                  </div>
                </div>
                <div>
                  <Label htmlFor="contact-email">邮箱</Label>
                  <Input
                    id="contact-email"
                    type="email"
                    placeholder="联系邮箱"
                    value={contactForm.email}
                    onChange={e =>
                      setContactForm({ ...contactForm, email: e.target.value })
                    }
                  />
                </div>
                <div>
                  <Label htmlFor="contact-role">角色</Label>
                  <Select
                    value={contactForm.role}
                    onValueChange={(value: any) =>
                      setContactForm({ ...contactForm, role: value })
                    }
                  >
                    <SelectTrigger id="contact-role">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="purchaser">采购方</SelectItem>
                      <SelectItem value="sales">销售方</SelectItem>
                      <SelectItem value="manager">经理</SelectItem>
                      <SelectItem value="other">其他</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="contact-notes">备注</Label>
                  <Textarea
                    id="contact-notes"
                    placeholder="其他信息"
                    value={contactForm.notes}
                    onChange={e =>
                      setContactForm({ ...contactForm, notes: e.target.value })
                    }
                  />
                </div>
                <Button
                  onClick={handleAddContact}
                  disabled={
                    createContactMutation.isPending ||
                    updateContactMutation.isPending
                  }
                  className="w-full bg-sky-600 hover:bg-sky-700 text-white"
                >
                  {createContactMutation.isPending ||
                  updateContactMutation.isPending
                    ? "保存中..."
                    : editingContactId
                      ? "保存修改"
                      : "添加联系人"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        )}
        {/* Edit Customer Dialog */}
        <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>编辑客户信息</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>客户名称</Label>
                <Input
                  value={editForm.name}
                  onChange={e =>
                    setEditForm({ ...editForm, name: e.target.value })
                  }
                />
              </div>
              <div>
                <Label>描述</Label>
                <Textarea
                  value={editForm.description}
                  onChange={e =>
                    setEditForm({ ...editForm, description: e.target.value })
                  }
                />
              </div>
              <Button
                onClick={() => {
                  if (!editForm.name.trim()) {
                    toast.error("名称不能为空");
                    return;
                  }
                  updateCustomerMutation.mutate({
                    customerId: customer.id,
                    name: editForm.name,
                    description: editForm.description || undefined,
                  });
                }}
                disabled={updateCustomerMutation.isPending}
                className="w-full bg-sky-600 hover:bg-sky-700 text-white"
              >
                {updateCustomerMutation.isPending ? "保存中..." : "保存"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
