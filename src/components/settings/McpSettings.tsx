import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  api,
  McpStatus,
  McpToolInfo,
  McpDetectedClient,
} from "@/services/api";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Server,
  Play,
  Square,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Loader2,
  Wrench,
} from "lucide-react";
import { toast } from "sonner";

export function McpSettings() {
  const { t } = useTranslation();
  const [status, setStatus] = useState<McpStatus | null>(null);
  const [tools, setTools] = useState<McpToolInfo[]>([]);
  const [clients, setClients] = useState<McpDetectedClient[]>([]);
  const [transport, setTransport] = useState<string>("stdio");
  const [host, setHost] = useState("127.0.0.1");
  const [port, setPort] = useState("3100");
  const [loading, setLoading] = useState(false);
  const [configuring, setConfiguring] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const poll = async () => {
      try {
        const s = await api.mcp.status();
        if (active) setStatus(s);
      } catch {
        // ignore
      }
    };
    poll();
    const interval = setInterval(poll, 2000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    if (status?.running) {
      api.mcp
        .getTools()
        .then(setTools)
        .catch(() => setTools([]));
    } else {
      setTools([]);
    }
  }, [status?.running]);

  useEffect(() => {
    api.mcp
      .detectClients()
      .then(setClients)
      .catch(() => setClients([]));
  }, []);

  const handleStart = async () => {
    setLoading(true);
    try {
      const s = await api.mcp.start({
        transport,
        host,
        port: parseInt(port) || 3100,
      });
      setStatus(s);
      toast.success(t("settings.mcp.actions.start"));
    } catch (e) {
      toast.error(t("settings.mcp.clients.error"));
    } finally {
      setLoading(false);
    }
  };

  const handleStop = async () => {
    setLoading(true);
    try {
      const s = await api.mcp.stop();
      setStatus(s);
      toast.success(t("settings.mcp.actions.stop"));
    } catch (e) {
      toast.error(t("settings.mcp.clients.error"));
    } finally {
      setLoading(false);
    }
  };

  const handleRestart = async () => {
    setLoading(true);
    try {
      await api.mcp.stop();
      const s = await api.mcp.start({
        transport,
        host,
        port: parseInt(port) || 3100,
      });
      setStatus(s);
      toast.success(t("settings.mcp.actions.restart"));
    } catch (e) {
      toast.error(t("settings.mcp.clients.error"));
    } finally {
      setLoading(false);
    }
  };

  const handleConfigureClient = async (name: string) => {
    setConfiguring(name);
    try {
      await api.mcp.configureClient(name);
      const updated = await api.mcp.detectClients();
      setClients(updated);
      toast.success(t("settings.mcp.clients.success"));
    } catch (e) {
      toast.error(t("settings.mcp.clients.error"));
    } finally {
      setConfiguring(null);
    }
  };

  const handleConfigureAll = async () => {
    for (const c of clients) {
      if (c.exists && !c.configured) {
        await handleConfigureClient(c.name);
      }
    }
  };

  const isRunning = status?.running ?? false;

  return (
    <div className="space-y-6">
      <h3 className="text-lg font-medium flex items-center gap-2">
        <Server className="w-5 h-5" /> {t("settings.mcp.title")}
      </h3>

      {/* Server Status */}
      <div className="rounded-md border p-4 space-y-3">
        <div className="flex items-center gap-2">
          {isRunning ? (
            <CheckCircle2 className="w-4 h-4 text-green-500" />
          ) : (
            <XCircle className="w-4 h-4 text-red-500" />
          )}
          <span className="text-sm font-medium">
            {isRunning
              ? t("settings.mcp.status.running")
              : t("settings.mcp.status.stopped")}
          </span>
        </div>

        {isRunning && status && (
          <div className="grid grid-cols-3 gap-4 text-xs text-muted-foreground">
            <div>
              <span className="font-medium">{t("settings.mcp.status.transport")}:</span>{" "}
              {status.transport}
            </div>
            {status.pid != null && (
              <div>
                <span className="font-medium">{t("settings.mcp.status.pid")}:</span>{" "}
                {status.pid}
              </div>
            )}
            {status.port != null && (
              <div>
                <span className="font-medium">{t("settings.mcp.status.port")}:</span>{" "}
                {status.port}
              </div>
            )}
          </div>
        )}

        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={handleStart}
            disabled={isRunning || loading}
          >
            <Play className="w-3.5 h-3.5 mr-1" />
            {t("settings.mcp.actions.start")}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={handleStop}
            disabled={!isRunning || loading}
          >
            <Square className="w-3.5 h-3.5 mr-1" />
            {t("settings.mcp.actions.stop")}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={handleRestart}
            disabled={loading}
          >
            <RefreshCw className="w-3.5 h-3.5 mr-1" />
            {t("settings.mcp.actions.restart")}
          </Button>
        </div>
      </div>

      <Separator />

      {/* Transport Configuration */}
      <div className="space-y-3">
        <h4 className="text-sm font-medium">{t("settings.mcp.transport.title")}</h4>
        <RadioGroup value={transport} onValueChange={setTransport}>
          <div className="flex items-center gap-2">
            <RadioGroupItem value="stdio" id="stdio" />
            <Label htmlFor="stdio" className="text-sm">
              {t("settings.mcp.transport.stdio")}
            </Label>
          </div>
          <div className="flex items-center gap-2">
            <RadioGroupItem value="http" id="http" />
            <Label htmlFor="http" className="text-sm">
              {t("settings.mcp.transport.http")}
            </Label>
          </div>
          <div className="flex items-center gap-2">
            <RadioGroupItem value="both" id="both" />
            <Label htmlFor="both" className="text-sm">
              {t("settings.mcp.transport.both")}
            </Label>
          </div>
        </RadioGroup>

        {transport !== "stdio" && (
          <div className="grid grid-cols-2 gap-4 items-center">
            <div className="space-y-1">
              <Label className="text-sm">{t("settings.mcp.transport.host")}</Label>
              <Input
                value={host}
                onChange={(e) => setHost(e.target.value)}
                placeholder="127.0.0.1"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-sm">{t("settings.mcp.transport.port")}</Label>
              <Input
                value={port}
                onChange={(e) => setPort(e.target.value)}
                placeholder="3100"
              />
            </div>
          </div>
        )}
      </div>

      <Separator />

      {/* Available Tools */}
      <div className="space-y-3">
        <h4 className="text-sm font-medium flex items-center gap-2">
          <Wrench className="w-4 h-4" />
          {t("settings.mcp.tools.title")}
          <span className="text-xs text-muted-foreground font-normal">
            {t("settings.mcp.tools.count", { count: tools.length })}
          </span>
        </h4>
        {tools.length > 0 ? (
          <div className="space-y-1">
            {tools.map((tool) => (
              <div
                key={tool.name}
                className="rounded-md bg-muted/40 px-3 py-2 text-sm"
              >
                <div className="font-medium">{tool.name}</div>
                {tool.description && (
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {tool.description}
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="text-xs text-muted-foreground">
            {isRunning
              ? t("settings.mcp.tools.count", { count: 0 })
              : t("settings.mcp.status.stopped")}
          </div>
        )}
      </div>

      <Separator />

      {/* AI Client Auto-Configuration */}
      <div className="space-y-3">
        <h4 className="text-sm font-medium">{t("settings.mcp.clients.title")}</h4>
        {clients.length > 0 ? (
          <div className="space-y-2">
            {clients.map((client) => (
              <div
                key={client.name}
                className="flex items-center justify-between rounded-md border px-3 py-2"
              >
                <div className="space-y-0.5">
                  <div className="text-sm font-medium">{client.name}</div>
                  <div className="text-xs text-muted-foreground">{client.path}</div>
                </div>
                <div className="flex items-center gap-2">
                  {client.configured ? (
                    <span className="text-xs text-green-600 flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      {t("settings.mcp.clients.configured")}
                    </span>
                  ) : client.exists ? (
                    <span className="text-xs text-yellow-600 flex items-center gap-1">
                      <XCircle className="w-3.5 h-3.5" />
                      {t("settings.mcp.clients.notConfigured")}
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                      <XCircle className="w-3.5 h-3.5" />
                      {t("settings.mcp.clients.notDetected")}
                    </span>
                  )}
                  {client.exists && !client.configured && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleConfigureClient(client.name)}
                      disabled={configuring === client.name}
                    >
                      {configuring === client.name ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        t("settings.mcp.clients.reconfigure")
                      )}
                    </Button>
                  )}
                </div>
              </div>
            ))}
            <Button
              variant="outline"
              className="w-full"
              onClick={handleConfigureAll}
              disabled={loading}
            >
              {t("settings.mcp.clients.configureAll")}
            </Button>
          </div>
        ) : (
          <div className="text-xs text-muted-foreground">
            {t("settings.mcp.clients.notDetected")}
          </div>
        )}
      </div>
    </div>
  );
}
