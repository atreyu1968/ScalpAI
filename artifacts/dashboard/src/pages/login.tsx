import { useState } from "react";
import { useLocation, Link } from "wouter";
import { useLogin } from "@workspace/api-client-react";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Zap, Eye, EyeOff } from "lucide-react";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [totpCode, setTotpCode] = useState("");
  const [showTotp, setShowTotp] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [emailNotVerified, setEmailNotVerified] = useState(false);
  const [resending, setResending] = useState(false);
  const [, setLocation] = useLocation();
  const { login: authLogin } = useAuth();
  const { toast } = useToast();
  const loginMutation = useLogin();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    loginMutation.mutate(
      { data: { email, password, ...(showTotp && totpCode ? { totpCode } : {}) } },
      {
        onSuccess: (res) => {
          authLogin(res.token, res.user);
          setLocation("/dashboard");
        },
        onError: (err: unknown) => {
          const errData = (err as { data?: { error?: string; message?: string } })?.data;
          const errorCode = errData?.error || "";
          const message = errData?.message || errData?.error || "Error al iniciar sesión";
          if (errorCode === "EMAIL_NOT_VERIFIED") {
            setEmailNotVerified(true);
            toast({ title: "Correo no verificado", description: message, variant: "destructive" });
          } else if (message.toLowerCase().includes("2fa") || message.toLowerCase().includes("totp")) {
            setShowTotp(true);
            toast({ title: "2FA Requerido", description: "Ingresa tu código de autenticación" });
          } else {
            toast({ title: "Error", description: message, variant: "destructive" });
          }
        },
      }
    );
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4" data-testid="login-page">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex items-center justify-center gap-2 mb-2">
            <Zap className="h-8 w-8 text-primary" />
            <span className="text-2xl font-bold text-foreground">ScalpAI</span>
          </div>
          <CardTitle data-testid="text-login-title">Iniciar Sesión</CardTitle>
          <CardDescription>Ingresa tus credenciales para acceder al panel</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Correo electrónico</Label>
              <Input
                id="email"
                type="email"
                placeholder="trader@ejemplo.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                data-testid="input-email"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Contraseña</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  data-testid="input-password"
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            {showTotp && (
              <div className="space-y-2">
                <Label htmlFor="totp">Código 2FA</Label>
                <Input
                  id="totp"
                  type="text"
                  placeholder="000000"
                  value={totpCode}
                  onChange={(e) => setTotpCode(e.target.value)}
                  maxLength={6}
                  data-testid="input-totp"
                />
              </div>
            )}
            <Button
              type="submit"
              className="w-full"
              disabled={loginMutation.isPending}
              data-testid="button-login"
            >
              {loginMutation.isPending ? "Iniciando sesión..." : "Iniciar Sesión"}
            </Button>
          </form>
          {emailNotVerified && (
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3 text-center space-y-2">
              <p className="text-sm text-amber-400">Tu correo no ha sido verificado.</p>
              <Button
                variant="outline"
                size="sm"
                onClick={async () => {
                  setResending(true);
                  try {
                    await fetch("/api/auth/resend-verification", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ email }),
                    });
                    toast({ title: "Enviado", description: "Revisa tu correo para el enlace de verificación" });
                  } catch {
                    toast({ title: "Error", description: "Error de conexión", variant: "destructive" });
                  } finally {
                    setResending(false);
                  }
                }}
                disabled={resending}
              >
                {resending ? "Reenviando..." : "Reenviar correo de verificación"}
              </Button>
            </div>
          )}
          <div className="text-center mt-3">
            <Link href="/forgot-password" className="text-sm text-muted-foreground hover:text-primary">
              ¿Olvidaste tu contraseña?
            </Link>
          </div>
          <p className="text-center text-sm text-muted-foreground mt-2">
            ¿No tienes cuenta?{" "}
            <Link href="/register" className="text-primary hover:underline" data-testid="link-register">
              Registrarse
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
