import { useState } from "react";
import { useAdminListUsers, useAdminGetUser, getAdminGetUserQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Users, Shield, Bot, Key } from "lucide-react";

export default function AdminPage() {
  const { data: users, isLoading } = useAdminListUsers();
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const { data: userDetail, isLoading: detailLoading } = useAdminGetUser(selectedUserId ?? 0, {
    query: { enabled: !!selectedUserId, queryKey: getAdminGetUserQueryKey(selectedUserId ?? 0) }
  });

  return (
    <div className="space-y-6" data-testid="admin-page">
      <div>
        <h1 className="text-2xl font-bold">Admin Panel</h1>
        <p className="text-muted-foreground">System-wide user and bot management</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm text-muted-foreground">Total Users</CardTitle>
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
            <CardTitle className="text-sm text-muted-foreground">2FA Enabled</CardTitle>
            <Shield className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-2fa-count">{users?.filter(u => u.totpEnabled).length ?? 0}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Users</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">{[1,2,3].map(i => <Skeleton key={i} className="h-12 w-full" />)}</div>
          ) : users && users.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground text-xs">
                    <th className="text-left py-2 px-3">ID</th>
                    <th className="text-left py-2 px-3">Email</th>
                    <th className="text-left py-2 px-3">Role</th>
                    <th className="text-left py-2 px-3">2FA</th>
                    <th className="text-right py-2 px-3">Bots</th>
                    <th className="text-left py-2 px-3">Joined</th>
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
                        <Button variant="ghost" size="sm" onClick={() => setSelectedUserId(u.id)} data-testid={`button-view-user-${u.id}`}>View</Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-center py-8 text-muted-foreground">No users found</p>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!selectedUserId} onOpenChange={(open) => { if (!open) setSelectedUserId(null); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>User Details</DialogTitle></DialogHeader>
          {detailLoading ? (
            <div className="space-y-2"><Skeleton className="h-20 w-full" /><Skeleton className="h-20 w-full" /></div>
          ) : userDetail ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div><span className="text-muted-foreground">Email:</span> {userDetail.email}</div>
                <div><span className="text-muted-foreground">Role:</span> <Badge variant="outline">{userDetail.role}</Badge></div>
                <div><span className="text-muted-foreground">2FA:</span> {userDetail.totpEnabled ? "Enabled" : "Disabled"}</div>
                <div><span className="text-muted-foreground">Joined:</span> {new Date(userDetail.createdAt).toLocaleDateString()}</div>
              </div>

              {userDetail.apiKeys && userDetail.apiKeys.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold flex items-center gap-1 mb-2"><Key className="h-4 w-4" /> API Keys ({userDetail.apiKeys.length})</h4>
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
                          <th className="text-left py-1 px-2">Name</th>
                          <th className="text-left py-1 px-2">Pair</th>
                          <th className="text-left py-1 px-2">Mode</th>
                          <th className="text-left py-1 px-2">Status</th>
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
