import { useState } from "react";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Zap, Eye, EyeOff, CheckCircle, XCircle } from "lucide-react";

export default function ResetPasswordPage() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<"form" | "success" | "error">("form");
  const [errorMessage, setErrorMessage] = useState("");
  const { toast } = useToast();

  const token = new URLSearchParams(window.location.search).get("token");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

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
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json();
      if (res.ok) {
        setStatus("success");
        toast({ title: "Contraseña actualizada" });
      } else {
        setStatus("error");
        setErrorMessage(data.error || "Error al restablecer la contraseña");
      }
    } catch {
      setStatus("error");
      setErrorMessage("Error de conexión");
    } finally {
      setLoading(false);
    }
  };

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="flex items-center justify-center gap-2 mb-2">
              <Zap className="h-8 w-8 text-primary" />
              <span className="text-2xl font-bold text-foreground">ScalpAI</span>
            </div>
            <CardTitle>Enlace Inválido</CardTitle>
          </CardHeader>
          <CardContent className="text-center space-y-4">
            <XCircle className="h-16 w-16 text-destructive mx-auto" />
            <p className="text-sm text-muted-foreground">El enlace de restablecimiento no es válido.</p>
            <Link href="/forgot-password">
              <Button className="w-full">Solicitar nuevo enlace</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex items-center justify-center gap-2 mb-2">
            <Zap className="h-8 w-8 text-primary" />
            <span className="text-2xl font-bold text-foreground">ScalpAI</span>
          </div>
          <CardTitle>
            {status === "form" && "Nueva Contraseña"}
            {status === "success" && "¡Contraseña Actualizada!"}
            {status === "error" && "Error"}
          </CardTitle>
          <CardDescription>
            {status === "form" && "Ingresa tu nueva contraseña"}
            {status === "success" && "Ya puedes iniciar sesión con tu nueva contraseña"}
            {status === "error" && errorMessage}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {status === "form" && (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="password">Nueva contraseña</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="Mín. 8 caracteres"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
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
                <Label htmlFor="confirm">Confirmar contraseña</Label>
                <Input
                  id="confirm"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Actualizando..." : "Restablecer Contraseña"}
              </Button>
            </form>
          )}
          {status === "success" && (
            <div className="text-center space-y-4">
              <CheckCircle className="h-16 w-16 text-emerald-500 mx-auto" />
              <Link href="/login">
                <Button className="w-full">Iniciar Sesión</Button>
              </Link>
            </div>
          )}
          {status === "error" && (
            <div className="text-center space-y-4">
              <XCircle className="h-16 w-16 text-destructive mx-auto" />
              <Link href="/forgot-password">
                <Button className="w-full">Solicitar nuevo enlace</Button>
              </Link>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
