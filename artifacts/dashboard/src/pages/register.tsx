import { useState, useEffect } from "react";
import { Link, useSearch } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Zap, Eye, EyeOff, Mail, Ticket, AlertCircle, CheckCircle } from "lucide-react";

export default function RegisterPage() {
  const searchString = useSearch();
  const params = new URLSearchParams(searchString);
  const codeFromUrl = params.get("code") || "";

  const [invitationCode, setInvitationCode] = useState(codeFromUrl);
  const [codeValid, setCodeValid] = useState<boolean | null>(null);
  const [codeEmail, setCodeEmail] = useState<string | null>(null);
  const [validating, setValidating] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [registered, setRegistered] = useState(false);
  const [regMessage, setRegMessage] = useState("");
  const [regEmail, setRegEmail] = useState("");
  const [resending, setResending] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (codeFromUrl) {
      validateCode(codeFromUrl);
    }
  }, []);

  const validateCode = async (code: string) => {
    if (!code || code.length < 4) {
      setCodeValid(null);
      setCodeEmail(null);
      return;
    }
    setValidating(true);
    try {
      const res = await fetch(`/api/auth/invitation/${encodeURIComponent(code)}`);
      const data = await res.json();
      if (res.ok && data.valid) {
        setCodeValid(true);
        if (data.email) {
          setCodeEmail(data.email);
          setEmail(data.email);
        } else {
          setCodeEmail(null);
        }
      } else {
        setCodeValid(false);
        setCodeEmail(null);
      }
    } catch {
      setCodeValid(false);
      setCodeEmail(null);
    } finally {
      setValidating(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!invitationCode) {
      toast({ title: "Error", description: "Se requiere un código de invitación", variant: "destructive" });
      return;
    }
    if (password !== confirmPassword) {
      toast({ title: "Error", description: "Las contraseñas no coinciden", variant: "destructive" });
      return;
    }
    if (password.length < 8) {
      toast({ title: "Error", description: "La contraseña debe tener al menos 8 caracteres", variant: "destructive" });
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, invitationCode }),
      });
      const data = await res.json();
      if (res.ok) {
        setRegistered(true);
        setRegMessage(data.message);
        setRegEmail(email);
      } else {
        toast({ title: "Error", description: data.error || "Error en el registro", variant: "destructive" });
      }
    } catch {
      toast({ title: "Error", description: "Error de conexión", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setResending(true);
    try {
      await fetch("/api/auth/resend-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: regEmail }),
      });
      toast({ title: "Enviado", description: "Se envió un nuevo correo de verificación" });
    } catch {
      toast({ title: "Error", description: "Error de conexión", variant: "destructive" });
    } finally {
      setResending(false);
    }
  };

  if (registered) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4" data-testid="register-success">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="flex items-center justify-center gap-2 mb-2">
              <Zap className="h-8 w-8 text-primary" />
              <span className="text-2xl font-bold text-foreground">ScalpAI</span>
            </div>
            <CardTitle>¡Cuenta Creada!</CardTitle>
          </CardHeader>
          <CardContent className="text-center space-y-4">
            <Mail className="h-16 w-16 text-primary mx-auto" />
            <p className="text-sm text-muted-foreground">{regMessage}</p>
            <div className="bg-muted/50 rounded-lg p-3">
              <p className="text-xs text-muted-foreground">Correo enviado a:</p>
              <p className="font-medium text-sm">{regEmail}</p>
            </div>
            <Button variant="outline" className="w-full" onClick={handleResend} disabled={resending}>
              {resending ? "Reenviando..." : "Reenviar correo de verificación"}
            </Button>
            <Link href="/login" className="block text-sm text-primary hover:underline">
              Ir a Iniciar Sesión
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4" data-testid="register-page">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex items-center justify-center gap-2 mb-2">
            <Zap className="h-8 w-8 text-primary" />
            <span className="text-2xl font-bold text-foreground">ScalpAI</span>
          </div>
          <CardTitle data-testid="text-register-title">Crear Cuenta</CardTitle>
          <CardDescription>Registro solo por invitación</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="invitationCode">Código de invitación</Label>
              <div className="relative">
                <Ticket className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="invitationCode"
                  type="text"
                  placeholder="Ej: A1B2C3D4E5F6"
                  className="pl-10 uppercase"
                  value={invitationCode}
                  onChange={(e) => {
                    const val = e.target.value.toUpperCase();
                    setInvitationCode(val);
                    setCodeValid(null);
                  }}
                  onBlur={() => validateCode(invitationCode)}
                  required
                  data-testid="input-invitation-code"
                />
                {validating && (
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-xs">Verificando...</span>
                )}
                {!validating && codeValid === true && (
                  <CheckCircle className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-emerald-500" />
                )}
                {!validating && codeValid === false && (
                  <AlertCircle className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-red-500" />
                )}
              </div>
              {codeValid === false && (
                <p className="text-xs text-red-500">Código inválido o expirado</p>
              )}
              {codeEmail && (
                <p className="text-xs text-muted-foreground">Invitación reservada para: <span className="font-medium">{codeEmail}</span></p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Correo electrónico</Label>
              <Input
                id="email"
                type="email"
                placeholder="trader@ejemplo.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={!!codeEmail}
                data-testid="input-email"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Contraseña</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="Mín. 8 caracteres"
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
            <div className="space-y-2">
              <Label htmlFor="confirm">Confirmar Contraseña</Label>
              <Input
                id="confirm"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                data-testid="input-confirm-password"
              />
            </div>
            <Button
              type="submit"
              className="w-full"
              disabled={loading || codeValid === false}
              data-testid="button-register"
            >
              {loading ? "Creando cuenta..." : "Crear Cuenta"}
            </Button>
          </form>
          <p className="text-center text-sm text-muted-foreground mt-4">
            ¿Ya tienes cuenta?{" "}
            <Link href="/login" className="text-primary hover:underline" data-testid="link-login">
              Iniciar Sesión
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
