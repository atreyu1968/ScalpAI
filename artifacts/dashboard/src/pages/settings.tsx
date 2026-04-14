import { useState } from "react";
import {
  useGetProfile, useListApiKeys, useCreateApiKey, useUpdateApiKey, useDeleteApiKey,
  useTotpSetup, useTotpVerify, useTotpDisable,
  getListApiKeysQueryKey, getGetProfileQueryKey,
  deleteApiKey as deleteApiKeyFn,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Shield, ShieldCheck, Key, Plus, Trash2, Edit } from "lucide-react";

export default function SettingsPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: profile, isLoading: profileLoading } = useGetProfile();
  const { data: apiKeys, isLoading: keysLoading } = useListApiKeys();

  const [totpOpen, setTotpOpen] = useState(false);
  const [totpCode, setTotpCode] = useState("");
  const [qrData, setQrData] = useState<{ qrCode: string; secret: string } | null>(null);
  const totpSetup = useTotpSetup();
  const totpVerify = useTotpVerify();
  const totpDisable = useTotpDisable();

  const [keyOpen, setKeyOpen] = useState(false);
  const [keyForm, setKeyForm] = useState({ label: "", apiKey: "", apiSecret: "", totpCode: "" });
  const createKey = useCreateApiKey();
  const updateKey = useUpdateApiKey();
  const deleteKey = useDeleteApiKey();

  const [editOpen, setEditOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState({ label: "", apiKey: "", apiSecret: "", totpCode: "" });

  const handleTotpSetup = () => {
    totpSetup.mutate(undefined, {
      onSuccess: (res) => { setQrData({ qrCode: res.qrCode, secret: res.secret }); setTotpOpen(true); },
      onError: (err: unknown) => { toast({ title: "Error", description: (err as { data?: { error?: string } })?.data?.error || "Failed", variant: "destructive" }); },
    });
  };

  const handleTotpVerify = () => {
    totpVerify.mutate({ data: { code: totpCode } }, {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getGetProfileQueryKey() });
        setTotpOpen(false);
        setTotpCode("");
        setQrData(null);
        toast({ title: "2FA Enabled" });
      },
      onError: (err: unknown) => { toast({ title: "Error", description: (err as { data?: { error?: string } })?.data?.error || "Invalid code", variant: "destructive" }); },
    });
  };

  const handleTotpDisable = () => {
    if (!totpCode) { toast({ title: "Error", description: "Enter your 2FA code", variant: "destructive" }); return; }
    totpDisable.mutate({ data: { code: totpCode } }, {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getGetProfileQueryKey() });
        setTotpOpen(false);
        setTotpCode("");
        toast({ title: "2FA Disabled" });
      },
      onError: (err: unknown) => { toast({ title: "Error", description: (err as { data?: { error?: string } })?.data?.error || "Invalid code", variant: "destructive" }); },
    });
  };

  const handleCreateKey = (e: React.FormEvent) => {
    e.preventDefault();
    createKey.mutate({ data: keyForm }, {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListApiKeysQueryKey() });
        setKeyOpen(false);
        setKeyForm({ label: "", apiKey: "", apiSecret: "", totpCode: "" });
        toast({ title: "API Key added" });
      },
      onError: (err: unknown) => { toast({ title: "Error", description: (err as { data?: { error?: string } })?.data?.error || "Failed", variant: "destructive" }); },
    });
  };

  const handleEditKey = (key: { id: number; label: string }) => {
    setEditId(key.id);
    setEditForm({ label: key.label, apiKey: "", apiSecret: "", totpCode: "" });
    setEditOpen(true);
  };

  const handleUpdateKey = (e: React.FormEvent) => {
    e.preventDefault();
    if (editId === null) return;
    const data: Record<string, string> = {};
    if (editForm.label) data.label = editForm.label;
    if (editForm.apiKey) data.apiKey = editForm.apiKey;
    if (editForm.apiSecret) data.apiSecret = editForm.apiSecret;
    if (editForm.totpCode) data.totpCode = editForm.totpCode;
    updateKey.mutate({ id: editId, data }, {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListApiKeysQueryKey() });
        setEditOpen(false);
        setEditId(null);
        toast({ title: "API Key updated" });
      },
      onError: (err: unknown) => { toast({ title: "Error", description: (err as { data?: { error?: string } })?.data?.error || "Failed", variant: "destructive" }); },
    });
  };

  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteKeyId, setDeleteKeyId] = useState<number | null>(null);
  const [deleteTotpCode, setDeleteTotpCode] = useState("");

  const handleDeleteKey = (id: number) => {
    if (profile?.totpEnabled) {
      setDeleteKeyId(id);
      setDeleteTotpCode("");
      setDeleteConfirmOpen(true);
    } else {
      if (!confirm("Delete this API key?")) return;
      executeDelete(id);
    }
  };

  const [deleteLoading, setDeleteLoading] = useState(false);

  const executeDelete = async (id: number, totpCode?: string) => {
    setDeleteLoading(true);
    try {
      const headers: Record<string, string> = {};
      if (totpCode) {
        headers["x-totp-code"] = totpCode;
      }
      await deleteApiKeyFn(id, { headers });
      qc.invalidateQueries({ queryKey: getListApiKeysQueryKey() });
      setDeleteConfirmOpen(false);
      setDeleteKeyId(null);
      toast({ title: "API Key deleted" });
    } catch (err: unknown) {
      toast({ title: "Error", description: (err as { data?: { error?: string } })?.data?.error || "Failed to delete", variant: "destructive" });
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleConfirmDelete = () => {
    if (!deleteKeyId) return;
    if (profile?.totpEnabled && !deleteTotpCode) {
      toast({ title: "TOTP code required", variant: "destructive" });
      return;
    }
    executeDelete(deleteKeyId, deleteTotpCode || undefined);
  };

  return (
    <div className="space-y-6 max-w-3xl" data-testid="settings-page">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-muted-foreground">Manage your account and API keys</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {profileLoading ? <Skeleton className="h-16 w-full" /> : (
            <>
              <div className="flex justify-between"><span className="text-muted-foreground">Email</span><span data-testid="text-email">{profile?.email}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Role</span><Badge variant="outline">{profile?.role}</Badge></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Joined</span><span className="text-sm">{profile?.createdAt ? new Date(profile.createdAt).toLocaleDateString() : ""}</span></div>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {profile?.totpEnabled ? <ShieldCheck className="h-5 w-5 text-emerald-500" /> : <Shield className="h-5 w-5" />}
            Two-Factor Authentication
          </CardTitle>
          <CardDescription>
            {profile?.totpEnabled ? "2FA is currently enabled" : "Add an extra layer of security to your account"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {profile?.totpEnabled ? (
            <Dialog open={totpOpen} onOpenChange={setTotpOpen}>
              <DialogTrigger asChild>
                <Button variant="destructive" size="sm" data-testid="button-disable-2fa">Disable 2FA</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Disable 2FA</DialogTitle></DialogHeader>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>Enter your 2FA code to confirm</Label>
                    <Input value={totpCode} onChange={(e) => setTotpCode(e.target.value)} placeholder="000000" maxLength={6} data-testid="input-totp-disable" />
                  </div>
                  <Button variant="destructive" className="w-full" onClick={handleTotpDisable} disabled={totpDisable.isPending} data-testid="button-confirm-disable-2fa">
                    {totpDisable.isPending ? "Disabling..." : "Disable 2FA"}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          ) : (
            <>
              {qrData ? (
                <Dialog open={totpOpen} onOpenChange={setTotpOpen}>
                  <DialogContent>
                    <DialogHeader><DialogTitle>Setup 2FA</DialogTitle></DialogHeader>
                    <div className="space-y-4 text-center">
                      <p className="text-sm text-muted-foreground">Scan this QR code with your authenticator app</p>
                      <img src={qrData.qrCode} alt="TOTP QR Code" className="mx-auto w-48 h-48" data-testid="img-qr-code" />
                      <p className="text-xs font-mono bg-muted p-2 rounded break-all">{qrData.secret}</p>
                      <div className="space-y-2">
                        <Label>Enter the code from your app</Label>
                        <Input value={totpCode} onChange={(e) => setTotpCode(e.target.value)} placeholder="000000" maxLength={6} data-testid="input-totp-verify" />
                      </div>
                      <Button className="w-full" onClick={handleTotpVerify} disabled={totpVerify.isPending} data-testid="button-verify-2fa">
                        {totpVerify.isPending ? "Verifying..." : "Enable 2FA"}
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              ) : null}
              <Button size="sm" onClick={handleTotpSetup} disabled={totpSetup.isPending} data-testid="button-setup-2fa">
                {totpSetup.isPending ? "Setting up..." : "Setup 2FA"}
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2"><Key className="h-5 w-5" /> API Keys</CardTitle>
              <CardDescription>Manage your Binance API keys</CardDescription>
            </div>
            <Dialog open={keyOpen} onOpenChange={setKeyOpen}>
              <DialogTrigger asChild>
                <Button size="sm" data-testid="button-add-api-key"><Plus className="h-4 w-4 mr-1" /> Add Key</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Add Binance API Key</DialogTitle></DialogHeader>
                <form onSubmit={handleCreateKey} className="space-y-4">
                  <div className="space-y-2"><Label>Label</Label><Input value={keyForm.label} onChange={(e) => setKeyForm({ ...keyForm, label: e.target.value })} required data-testid="input-key-label" /></div>
                  <div className="space-y-2"><Label>API Key</Label><Input value={keyForm.apiKey} onChange={(e) => setKeyForm({ ...keyForm, apiKey: e.target.value })} required data-testid="input-api-key" /></div>
                  <div className="space-y-2"><Label>API Secret</Label><Input type="password" value={keyForm.apiSecret} onChange={(e) => setKeyForm({ ...keyForm, apiSecret: e.target.value })} required data-testid="input-api-secret" /></div>
                  {profile?.totpEnabled && (
                    <div className="space-y-2"><Label>2FA Code</Label><Input value={keyForm.totpCode} onChange={(e) => setKeyForm({ ...keyForm, totpCode: e.target.value })} placeholder="000000" data-testid="input-key-totp" /></div>
                  )}
                  <Button type="submit" className="w-full" disabled={createKey.isPending} data-testid="button-submit-key">
                    {createKey.isPending ? "Adding..." : "Add API Key"}
                  </Button>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent>
          {keysLoading ? (
            <div className="space-y-2">{[1,2].map(i => <Skeleton key={i} className="h-16 w-full" />)}</div>
          ) : apiKeys && apiKeys.length > 0 ? (
            <div className="space-y-3">
              {apiKeys.map((key) => (
                <div key={key.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/50" data-testid={`api-key-${key.id}`}>
                  <div>
                    <p className="font-medium">{key.label}</p>
                    <p className="text-xs font-mono text-muted-foreground">{key.maskedKey}</p>
                    <p className="text-xs text-muted-foreground mt-1">Added {new Date(key.createdAt).toLocaleDateString()}</p>
                  </div>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="sm" onClick={() => handleEditKey(key)} data-testid={`button-edit-key-${key.id}`}>
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="sm" className="text-destructive" onClick={() => handleDeleteKey(key.id)} data-testid={`button-delete-key-${key.id}`}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-center py-4 text-muted-foreground text-sm">No API keys configured</p>
          )}
        </CardContent>
      </Card>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit API Key</DialogTitle></DialogHeader>
          <form onSubmit={handleUpdateKey} className="space-y-4">
            <div className="space-y-2"><Label>Label</Label><Input value={editForm.label} onChange={(e) => setEditForm({ ...editForm, label: e.target.value })} data-testid="input-edit-label" /></div>
            <div className="space-y-2"><Label>New API Key (leave blank to keep)</Label><Input value={editForm.apiKey} onChange={(e) => setEditForm({ ...editForm, apiKey: e.target.value })} placeholder="Leave blank to keep current" data-testid="input-edit-api-key" /></div>
            <div className="space-y-2"><Label>New API Secret (leave blank to keep)</Label><Input type="password" value={editForm.apiSecret} onChange={(e) => setEditForm({ ...editForm, apiSecret: e.target.value })} placeholder="Leave blank to keep current" data-testid="input-edit-api-secret" /></div>
            {profile?.totpEnabled && (
              <div className="space-y-2"><Label>2FA Code</Label><Input value={editForm.totpCode} onChange={(e) => setEditForm({ ...editForm, totpCode: e.target.value })} placeholder="Required if changing credentials" data-testid="input-edit-totp" /></div>
            )}
            <Button type="submit" className="w-full" disabled={updateKey.isPending} data-testid="button-update-key">
              {updateKey.isPending ? "Updating..." : "Update API Key"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm API Key Deletion</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">This action cannot be undone. Enter your 2FA code to confirm deletion.</p>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>2FA Code</Label>
              <Input
                value={deleteTotpCode}
                onChange={(e) => setDeleteTotpCode(e.target.value)}
                placeholder="Enter 6-digit code"
                maxLength={6}
                data-testid="input-delete-totp"
              />
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setDeleteConfirmOpen(false)}>Cancel</Button>
              <Button variant="destructive" className="flex-1" onClick={handleConfirmDelete} disabled={deleteLoading} data-testid="button-confirm-delete">
                {deleteLoading ? "Deleting..." : "Delete"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
