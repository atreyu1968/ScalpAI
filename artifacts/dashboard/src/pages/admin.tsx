import { useState, useEffect } from "react";
import { useAdminListUsers, useAdminGetUser, getAdminGetUserQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Users, Shield, Bot, Key, Mail, Server, CheckCircle, XCircle, Loader2 } from "lucide-react";

interface SmtpSettings {
  configured: boolean;
  smtpHost?: string;
  smtpPort?: number;
  smtpSecure?: boolean;
  smtpUser?: string;
  smtpPass?: string;
  fromName?: string;
  fromEmail?: string;
}

function EmailSettingsSection() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [form, setForm] = useState({
    smtpHost: "",
    smtpPort: "587",
    smtpSecure: false,
    smtpUser: "",
    smtpPass: "",
    fromName: "ScalpAI",
    fromEmail: "",
  });

  useEffect(() => {
    const token = localStorage.getItem("token");
    fetch("/api/admin/email-settings", {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((data: SmtpSettings) => {
        if (data.configured) {
          setForm({
            smtpHost: data.smtpHost || "",
            smtpPort: String(data.smtpPort || 587),
            smtpSecure: data.smtpSecure || false,
            smtpUser: data.smtpUser || "",
            smtpPass: data.smtpPass || "",
            fromName: data.fromName || "ScalpAI",
            fromEmail: data.fromEmail || "",
          });
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const token = localStorage.getItem("token");
    try {
      const res = await fetch("/api/admin/email-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          ...form,
          smtpPort: Number(form.smtpPort),
        }),
      });
      const data = await res.json();
      if (res.ok) {
        toast({ title: "Configuración guardada" });
      } else {
        toast({ title: "Error", description: data.error, variant: "destructive" });
      }
    } catch {
      toast({ title: "Error", description: "Error de conexión", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    const token = localStorage.getItem("token");
    try {
      const res = await fetch("/api/admin/email-settings/test", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          ...form,
          smtpPort: Number(form.smtpPort),
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setTestResult({ ok: true, message: data.message || "Conexión exitosa" });
      } else {
        setTestResult({ ok: false, message: data.error || "Error de conexión" });
      }
    } catch {
      setTestResult({ ok: false, message: "Error de red" });
    } finally {
      setTesting(false);
    }
  };

  if (loading) {
    return <Skeleton className="h-48 w-full" />;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Mail className="h-5 w-5" />
          Configuración de Correo (SMTP)
        </CardTitle>
        <CardDescription>
          Configura el servidor de correo para verificación de cuentas y recuperación de contraseñas
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSave} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Servidor SMTP</Label>
              <div className="relative">
                <Server className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  value={form.smtpHost}
                  onChange={(e) => setForm({ ...form, smtpHost: e.target.value })}
                  placeholder="smtp.gmail.com"
                  className="pl-10"
                  required
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Puerto</Label>
              <Input
                type="number"
                value={form.smtpPort}
                onChange={(e) => setForm({ ...form, smtpPort: e.target.value })}
                placeholder="587"
                required
              />
            </div>
            <div className="space-y-2">
              <Label>Usuario SMTP</Label>
              <Input
                value={form.smtpUser}
                onChange={(e) => setForm({ ...form, smtpUser: e.target.value })}
                placeholder="tu@correo.com"
                required
              />
            </div>
            <div className="space-y-2">
              <Label>Contraseña SMTP</Label>
              <Input
                type="password"
                value={form.smtpPass}
                onChange={(e) => setForm({ ...form, smtpPass: e.target.value })}
                placeholder="Contraseña o App Password"
                required
              />
            </div>
            <div className="space-y-2">
              <Label>Nombre del remitente</Label>
              <Input
                value={form.fromName}
                onChange={(e) => setForm({ ...form, fromName: e.target.value })}
                placeholder="ScalpAI"
              />
            </div>
            <div className="space-y-2">
              <Label>Correo del remitente</Label>
              <Input
                type="email"
                value={form.fromEmail}
                onChange={(e) => setForm({ ...form, fromEmail: e.target.value })}
                placeholder="noreply@tudominio.com"
                required
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="smtpSecure"
              checked={form.smtpSecure}
              onChange={(e) => setForm({ ...form, smtpSecure: e.target.checked })}
              className="rounded border-muted-foreground"
            />
            <Label htmlFor="smtpSecure" className="text-sm cursor-pointer">
              Conexión segura (SSL/TLS — activar para puerto 465)
            </Label>
          </div>

          {testResult && (
            <div className={`flex items-center gap-2 p-3 rounded-lg text-sm ${testResult.ok ? "bg-emerald-500/10 text-emerald-400" : "bg-destructive/10 text-destructive"}`}>
              {testResult.ok ? <CheckCircle className="h-4 w-4 shrink-0" /> : <XCircle className="h-4 w-4 shrink-0" />}
              {testResult.message}
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-2">
            <Button type="button" variant="outline" onClick={handleTest} disabled={testing} className="flex-1">
              {testing ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Probando...</> : "Probar Conexión"}
            </Button>
            <Button type="submit" disabled={saving} className="flex-1">
              {saving ? "Guardando..." : "Guardar Configuración"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

export default function AdminPage() {
  const { data: users, isLoading } = useAdminListUsers();
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const { data: userDetail, isLoading: detailLoading } = useAdminGetUser(selectedUserId ?? 0, {
    query: { enabled: !!selectedUserId, queryKey: getAdminGetUserQueryKey(selectedUserId ?? 0) }
  });

  return (
    <div className="space-y-6" data-testid="admin-page">
      <div>
        <h1 className="text-2xl font-bold">Panel de Administración</h1>
        <p className="text-muted-foreground">Gestión de usuarios y bots del sistema</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm text-muted-foreground">Total Usuarios</CardTitle>
            <Users className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-total-users">{users?.length ?? 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm text-muted-foreground">Total Bots</CardTitle>
            <Bot className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-total-bots">{users?.reduce((s, u) => s + u.botCount, 0) ?? 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm text-muted-foreground">2FA Activado</CardTitle>
            <Shield className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-2fa-count">{users?.filter(u => u.totpEnabled).length ?? 0}</div>
          </CardContent>
        </Card>
      </div>

      <EmailSettingsSection />

      <Card>
        <CardHeader><CardTitle>Usuarios</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">{[1,2,3].map(i => <Skeleton key={i} className="h-12 w-full" />)}</div>
          ) : users && users.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground text-xs">
                    <th className="text-left py-2 px-3">ID</th>
                    <th className="text-left py-2 px-3">Correo</th>
                    <th className="text-left py-2 px-3">Rol</th>
                    <th className="text-left py-2 px-3">2FA</th>
                    <th className="text-right py-2 px-3">Bots</th>
                    <th className="text-left py-2 px-3">Registro</th>
                    <th className="text-left py-2 px-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.id} className="border-b border-muted/30 hover:bg-muted/20" data-testid={`user-row-${u.id}`}>
                      <td className="py-2 px-3 text-muted-foreground">#{u.id}</td>
                      <td className="py-2 px-3 font-medium">{u.email}</td>
                      <td className="py-2 px-3"><Badge variant={u.role === "admin" ? "default" : "secondary"} className="text-xs">{u.role}</Badge></td>
                      <td className="py-2 px-3">{u.totpEnabled ? <Shield className="h-4 w-4 text-emerald-500" /> : <span className="text-muted-foreground">-</span>}</td>
                      <td className="py-2 px-3 text-right">{u.botCount}</td>
                      <td className="py-2 px-3 text-xs text-muted-foreground">{new Date(u.createdAt).toLocaleDateString()}</td>
                      <td className="py-2 px-3">
                        <Button variant="ghost" size="sm" onClick={() => setSelectedUserId(u.id)} data-testid={`button-view-user-${u.id}`}>Ver</Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-center py-8 text-muted-foreground">No se encontraron usuarios</p>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!selectedUserId} onOpenChange={(open) => { if (!open) setSelectedUserId(null); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Detalles del Usuario</DialogTitle></DialogHeader>
          {detailLoading ? (
            <div className="space-y-2"><Skeleton className="h-20 w-full" /><Skeleton className="h-20 w-full" /></div>
          ) : userDetail ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div><span className="text-muted-foreground">Correo:</span> {userDetail.email}</div>
                <div><span className="text-muted-foreground">Rol:</span> <Badge variant="outline">{userDetail.role}</Badge></div>
                <div><span className="text-muted-foreground">2FA:</span> {userDetail.totpEnabled ? "Activado" : "Desactivado"}</div>
                <div><span className="text-muted-foreground">Registro:</span> {new Date(userDetail.createdAt).toLocaleDateString()}</div>
              </div>

              {userDetail.apiKeys && userDetail.apiKeys.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold flex items-center gap-1 mb-2"><Key className="h-4 w-4" /> Claves API ({userDetail.apiKeys.length})</h4>
                  <div className="space-y-2">
                    {userDetail.apiKeys.map(k => (
                      <div key={k.id} className="text-xs bg-muted/50 p-2 rounded">
                        <span className="font-medium">{k.label}</span> - <span className="font-mono">{k.maskedKey}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {userDetail.bots && userDetail.bots.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold flex items-center gap-1 mb-2"><Bot className="h-4 w-4" /> Bots ({userDetail.bots.length})</h4>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b text-muted-foreground">
                          <th className="text-left py-1 px-2">Nombre</th>
                          <th className="text-left py-1 px-2">Par</th>
                          <th className="text-left py-1 px-2">Modo</th>
                          <th className="text-left py-1 px-2">Estado</th>
                        </tr>
                      </thead>
                      <tbody>
                        {userDetail.bots.map(b => (
                          <tr key={b.id} className="border-b border-muted/30">
                            <td className="py-1 px-2">{b.name}</td>
                            <td className="py-1 px-2 font-mono">{b.pair}</td>
                            <td className="py-1 px-2"><Badge variant="outline" className="text-xs">{b.mode}</Badge></td>
                            <td className="py-1 px-2"><Badge variant="outline" className="text-xs">{b.status}</Badge></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
