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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Users, Shield, Bot, Key, Mail, Server, CheckCircle, XCircle, Loader2, Brain, Globe, Cpu, Activity, DollarSign, TrendingUp, Zap, Ticket, Copy, Trash2, Plus } from "lucide-react";

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

interface ProviderPreset {
  provider: string;
  label: string;
  baseUrl: string;
  model: string;
  inputCostPer1M: number;
  outputCostPer1M: number;
}

interface CostData {
  live: { date: string; inputTokens: number; outputTokens: number; totalCostUsd: number; callCount: number };
  today: { provider: string; model: string; inputTokens: number; outputTokens: number; costUsd: number; calls: number }[];
  weekly: { date: string; costUsd: number; calls: number }[];
  allTime: { totalCostUsd: number; totalCalls: number };
}

const PROVIDER_LINKS: Record<string, string> = {
  deepseek: "https://platform.deepseek.com/",
  openai: "https://platform.openai.com/api-keys",
  gemini: "https://aistudio.google.com/apikey",
  qwen: "https://dashscope.console.aliyun.com/",
};

function AISettingsSection() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [providers, setProviders] = useState<ProviderPreset[]>([]);
  const [costData, setCostData] = useState<CostData | null>(null);
  const [form, setForm] = useState({
    provider: "deepseek",
    apiKey: "",
    baseUrl: "https://api.deepseek.com",
    model: "deepseek-chat",
    signalIntervalS: "5",
  });

  useEffect(() => {
    const token = localStorage.getItem("token");
    Promise.all([
      fetch("/api/admin/ai-settings", { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.json()),
      fetch("/api/admin/ai-providers", { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.json()),
      fetch("/api/admin/ai-cost", { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.json()),
    ])
      .then(([settings, provs, cost]: [any, ProviderPreset[], CostData]) => {
        setForm({
          provider: settings.provider || "deepseek",
          apiKey: settings.apiKey || "",
          baseUrl: settings.baseUrl || "https://api.deepseek.com",
          model: settings.model || "deepseek-chat",
          signalIntervalS: String(settings.signalIntervalS ?? 5),
        });
        setProviders(provs);
        setCostData(cost);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleProviderChange = (provId: string) => {
    const preset = providers.find((p) => p.provider === provId);
    if (preset) {
      setForm((f) => ({
        ...f,
        provider: provId,
        baseUrl: preset.baseUrl,
        model: preset.model,
        apiKey: f.provider === provId ? f.apiKey : "",
      }));
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const token = localStorage.getItem("token");
    try {
      const res = await fetch("/api/admin/ai-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ ...form, signalIntervalS: Number(form.signalIntervalS) }),
      });
      const data = await res.json();
      if (res.ok) {
        toast({ title: "Configuración de IA guardada" });
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
      const res = await fetch("/api/admin/ai-settings/test", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(form),
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

  const selectedPreset = providers.find((p) => p.provider === form.provider);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Brain className="h-5 w-5" />
            Configuración de IA
          </CardTitle>
          <CardDescription>
            Selecciona el proveedor de IA y configura la conexión para señales de trading
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSave} className="space-y-4">
            <div className="space-y-2">
              <Label>Proveedor de IA</Label>
              <Select value={form.provider} onValueChange={handleProviderChange}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {providers.map((p) => (
                    <SelectItem key={p.provider} value={p.provider}>
                      <div className="flex items-center justify-between gap-3 w-full">
                        <span>{p.label}</span>
                        <span className="text-xs text-muted-foreground">${p.inputCostPer1M}/{p.outputCostPer1M} por 1M tokens</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedPreset && (
                <div className="flex items-center gap-4 text-xs text-muted-foreground mt-1">
                  <span>Input: <span className="font-mono text-yellow-400">${selectedPreset.inputCostPer1M}/1M</span></span>
                  <span>Output: <span className="font-mono text-yellow-400">${selectedPreset.outputCostPer1M}/1M</span></span>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label>API Key</Label>
              <div className="relative">
                <Key className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  type="password"
                  value={form.apiKey}
                  onChange={(e) => setForm({ ...form, apiKey: e.target.value })}
                  placeholder="sk-..."
                  className="pl-10"
                  required
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Obtén tu API key en{" "}
                <a href={PROVIDER_LINKS[form.provider] || "#"} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                  {PROVIDER_LINKS[form.provider] ? new URL(PROVIDER_LINKS[form.provider]).hostname : "el proveedor"}
                </a>
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>URL Base</Label>
                <div className="relative">
                  <Globe className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    value={form.baseUrl}
                    onChange={(e) => setForm({ ...form, baseUrl: e.target.value })}
                    className="pl-10"
                    required
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Modelo</Label>
                <div className="relative">
                  <Cpu className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    value={form.model}
                    onChange={(e) => setForm({ ...form, model: e.target.value })}
                    className="pl-10"
                    required
                  />
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Intervalo de Señal (segundos)</Label>
              <div className="relative">
                <Activity className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  type="number"
                  min="1"
                  max="300"
                  value={form.signalIntervalS}
                  onChange={(e) => setForm({ ...form, signalIntervalS: e.target.value })}
                  placeholder="5"
                  className="pl-10"
                  required
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Frecuencia con la que la IA analiza el mercado. Menor = más preciso pero más costoso. Recomendado: 5-10s
              </p>
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

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DollarSign className="h-5 w-5" />
            Coste de IA
          </CardTitle>
          <CardDescription>
            Consumo y coste diario de las llamadas a la IA
          </CardDescription>
        </CardHeader>
        <CardContent>
          {costData ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="rounded-lg bg-muted/50 p-3">
                  <p className="text-xs text-muted-foreground flex items-center gap-1"><DollarSign className="h-3 w-3" /> Hoy</p>
                  <p className="text-lg font-mono font-bold text-yellow-400">${(costData.today.reduce((s, r) => s + r.costUsd, 0) || costData.live.totalCostUsd).toFixed(4)}</p>
                </div>
                <div className="rounded-lg bg-muted/50 p-3">
                  <p className="text-xs text-muted-foreground flex items-center gap-1"><Zap className="h-3 w-3" /> Llamadas Hoy</p>
                  <p className="text-lg font-mono font-bold">{costData.today.reduce((s, r) => s + r.calls, 0) || costData.live.callCount}</p>
                </div>
                <div className="rounded-lg bg-muted/50 p-3">
                  <p className="text-xs text-muted-foreground flex items-center gap-1"><TrendingUp className="h-3 w-3" /> Total Acumulado</p>
                  <p className="text-lg font-mono font-bold text-yellow-400">${costData.allTime.totalCostUsd.toFixed(4)}</p>
                </div>
                <div className="rounded-lg bg-muted/50 p-3">
                  <p className="text-xs text-muted-foreground flex items-center gap-1"><Zap className="h-3 w-3" /> Total Llamadas</p>
                  <p className="text-lg font-mono font-bold">{costData.allTime.totalCalls}</p>
                </div>
              </div>

              <div className="rounded-lg bg-muted/50 p-3">
                <p className="text-xs text-muted-foreground mb-1">Tokens Hoy</p>
                <div className="flex items-center gap-4 text-sm">
                  <span className="font-mono">Input: <span className="text-emerald-400">{(costData.today.reduce((s, r) => s + r.inputTokens, 0) || costData.live.inputTokens).toLocaleString()}</span></span>
                  <span className="font-mono">Output: <span className="text-blue-400">{(costData.today.reduce((s, r) => s + r.outputTokens, 0) || costData.live.outputTokens).toLocaleString()}</span></span>
                </div>
              </div>

              {costData.today.length > 0 && (
                <div>
                  <p className="text-xs text-muted-foreground mb-2">Desglose por Proveedor (Hoy)</p>
                  <div className="space-y-1.5">
                    {costData.today.map((row, i) => (
                      <div key={i} className="flex items-center justify-between text-sm bg-muted/30 rounded p-2">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-xs">{row.provider}</Badge>
                          <span className="text-xs text-muted-foreground font-mono">{row.model}</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-xs text-muted-foreground">{row.calls} llamadas</span>
                          <span className="font-mono text-yellow-400">${row.costUsd.toFixed(4)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {costData.weekly.length > 0 && (
                <div>
                  <p className="text-xs text-muted-foreground mb-2">Últimos 7 Días</p>
                  <div className="space-y-1">
                    {costData.weekly.map((day) => (
                      <div key={day.date} className="flex items-center justify-between text-xs bg-muted/20 rounded px-2 py-1.5">
                        <span className="text-muted-foreground">{day.date}</span>
                        <div className="flex items-center gap-3">
                          <span className="text-muted-foreground">{day.calls} llamadas</span>
                          <span className="font-mono text-yellow-400">${day.costUsd.toFixed(4)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {selectedPreset && (
                <div className="rounded-lg border border-dashed border-muted-foreground/30 p-3">
                  <p className="text-xs text-muted-foreground mb-1">Estimación Diaria ({selectedPreset.label})</p>
                  <div className="text-xs space-y-0.5">
                    <p>Con intervalo de <span className="font-mono">{form.signalIntervalS}s</span>: ~{Math.floor(86400 / Number(form.signalIntervalS || 5)).toLocaleString()} llamadas/día</p>
                    <p>Coste estimado: <span className="font-mono text-yellow-400">
                      ~${((86400 / Number(form.signalIntervalS || 5)) * (selectedPreset.inputCostPer1M * 0.5 + selectedPreset.outputCostPer1M * 0.1) / 1000).toFixed(2)}/día
                    </span>
                    <span className="text-muted-foreground"> (~500 tokens in, ~100 tokens out por llamada)</span>
                    </p>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Sin datos de coste disponibles</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
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

interface InvitationItem {
  id: number;
  code: string;
  email: string | null;
  used: boolean;
  usedByEmail: string | null;
  expired: boolean;
  createdAt: string;
  expiresAt: string | null;
  usedAt: string | null;
}

function InvitationsSection() {
  const { toast } = useToast();
  const [invitations, setInvitations] = useState<InvitationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [newExpiry, setNewExpiry] = useState("7");

  const fetchInvitations = async () => {
    try {
      const token = localStorage.getItem("token");
      const res = await fetch("/api/admin/invitations", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) setInvitations(await res.json());
    } catch {
      console.warn("Error cargando invitaciones");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchInvitations(); }, []);

  const createInvitation = async () => {
    setCreating(true);
    try {
      const token = localStorage.getItem("token");
      const res = await fetch("/api/admin/invitations", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          email: newEmail || undefined,
          expiresInDays: newExpiry === "never" ? undefined : Number(newExpiry),
        }),
      });
      if (res.ok) {
        const data = await res.json();
        toast({ title: "Invitación creada", description: `Código: ${data.code}` });
        setNewEmail("");
        fetchInvitations();
      } else {
        const err = await res.json();
        toast({ title: "Error", description: err.error, variant: "destructive" });
      }
    } catch {
      toast({ title: "Error", description: "Error de conexión", variant: "destructive" });
    } finally {
      setCreating(false);
    }
  };

  const deleteInvitation = async (id: number) => {
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`/api/admin/invitations/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        toast({ title: "Eliminada", description: "Invitación eliminada" });
        fetchInvitations();
      } else {
        const err = await res.json();
        toast({ title: "Error", description: err.error, variant: "destructive" });
      }
    } catch {
      toast({ title: "Error", description: "Error de conexión", variant: "destructive" });
    }
  };

  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    toast({ title: "Copiado", description: "Código copiado al portapapeles" });
  };

  const copyLink = (code: string) => {
    const url = `${window.location.origin}/register?code=${code}`;
    navigator.clipboard.writeText(url);
    toast({ title: "Copiado", description: "Enlace de registro copiado al portapapeles" });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Ticket className="h-5 w-5" /> Invitaciones</CardTitle>
        <CardDescription>Gestiona los códigos de invitación para nuevos usuarios</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col sm:flex-row gap-2">
          <Input
            placeholder="Email (opcional, deja vacío para cualquiera)"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            className="flex-1"
          />
          <Select value={newExpiry} onValueChange={setNewExpiry}>
            <SelectTrigger className="w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1">1 día</SelectItem>
              <SelectItem value="7">7 días</SelectItem>
              <SelectItem value="30">30 días</SelectItem>
              <SelectItem value="90">90 días</SelectItem>
              <SelectItem value="never">Sin expiración</SelectItem>
            </SelectContent>
          </Select>
          <Button onClick={createInvitation} disabled={creating} className="gap-1">
            <Plus className="h-4 w-4" />
            {creating ? "Creando..." : "Crear"}
          </Button>
        </div>

        {loading ? (
          <div className="space-y-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : invitations.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">No hay invitaciones creadas</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-muted-foreground">
                  <th className="text-left py-2 px-2">Código</th>
                  <th className="text-left py-2 px-2">Email</th>
                  <th className="text-left py-2 px-2">Estado</th>
                  <th className="text-left py-2 px-2">Expira</th>
                  <th className="text-right py-2 px-2">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {invitations.map((inv) => (
                  <tr key={inv.id} className="border-b border-muted/30">
                    <td className="py-2 px-2">
                      <code className="bg-muted px-2 py-0.5 rounded text-xs font-mono">{inv.code}</code>
                    </td>
                    <td className="py-2 px-2 text-xs">{inv.email || <span className="text-muted-foreground">Cualquiera</span>}</td>
                    <td className="py-2 px-2">
                      {inv.used ? (
                        <Badge variant="secondary" className="text-xs">Usada por {inv.usedByEmail}</Badge>
                      ) : inv.expired ? (
                        <Badge variant="destructive" className="text-xs">Expirada</Badge>
                      ) : (
                        <Badge className="text-xs bg-emerald-500/20 text-emerald-500 border-emerald-500/30">Disponible</Badge>
                      )}
                    </td>
                    <td className="py-2 px-2 text-xs text-muted-foreground">
                      {inv.expiresAt
                        ? new Date(inv.expiresAt).toLocaleDateString("es")
                        : "Nunca"}
                    </td>
                    <td className="py-2 px-2 text-right">
                      <div className="flex items-center gap-1 justify-end">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => copyCode(inv.code)} title="Copiar código">
                          <Copy className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => copyLink(inv.code)} title="Copiar enlace">
                          <Globe className="h-3.5 w-3.5" />
                        </Button>
                        {!inv.used && (
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500 hover:text-red-600" onClick={() => deleteInvitation(inv.id)} title="Eliminar">
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
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

      <InvitationsSection />

      <AISettingsSection />

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
