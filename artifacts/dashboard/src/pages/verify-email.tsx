import { useState, useEffect } from "react";
import { useLocation, Link } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Zap, CheckCircle, XCircle, Loader2 } from "lucide-react";

export default function VerifyEmailPage() {
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [message, setMessage] = useState("");
  const [, setLocation] = useLocation();
  const { login: authLogin } = useAuth();
  const { toast } = useToast();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get("token");

    if (!token) {
      setStatus("error");
      setMessage("Token de verificación no encontrado.");
      return;
    }

    fetch("/api/auth/verify-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    })
      .then(async (res) => {
        const data = await res.json();
        if (res.ok) {
          setStatus("success");
          setMessage("¡Correo verificado correctamente!");
          if (data.token && data.user) {
            authLogin(data.token, data.user);
            toast({ title: "¡Bienvenido!", description: "Tu correo ha sido verificado" });
            setTimeout(() => setLocation("/dashboard"), 2000);
          }
        } else {
          setStatus("error");
          setMessage(data.error || "Error al verificar el correo.");
        }
      })
      .catch(() => {
        setStatus("error");
        setMessage("Error de conexión. Intenta nuevamente.");
      });
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex items-center justify-center gap-2 mb-2">
            <Zap className="h-8 w-8 text-primary" />
            <span className="text-2xl font-bold text-foreground">ScalpAI</span>
          </div>
          <CardTitle>Verificación de Correo</CardTitle>
          <CardDescription>
            {status === "loading" && "Verificando tu correo electrónico..."}
            {status === "success" && "¡Tu cuenta ha sido activada!"}
            {status === "error" && "No se pudo verificar el correo"}
          </CardDescription>
        </CardHeader>
        <CardContent className="text-center space-y-4">
          {status === "loading" && (
            <div className="flex justify-center">
              <Loader2 className="h-12 w-12 text-primary animate-spin" />
            </div>
          )}
          {status === "success" && (
            <>
              <CheckCircle className="h-16 w-16 text-emerald-500 mx-auto" />
              <p className="text-sm text-muted-foreground">{message}</p>
              <p className="text-xs text-muted-foreground">Redirigiendo al panel...</p>
            </>
          )}
          {status === "error" && (
            <>
              <XCircle className="h-16 w-16 text-destructive mx-auto" />
              <p className="text-sm text-muted-foreground">{message}</p>
              <div className="space-y-2">
                <Link href="/login">
                  <Button className="w-full">Ir a Iniciar Sesión</Button>
                </Link>
                <Link href="/register">
                  <Button variant="outline" className="w-full">Crear Nueva Cuenta</Button>
                </Link>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
