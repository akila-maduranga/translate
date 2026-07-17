"use client";

import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Settings } from "lucide-react";
import {
  loadSettings,
  saveSettings,
  DEFAULT_SETTINGS,
  type UserSettings,
} from "@/lib/settings";

export function SettingsDialog() {
  const [open, setOpen] = useState(false);
  const [s, setS] = useState<UserSettings>(DEFAULT_SETTINGS);
  const { toast } = useToast();

  // Hydrate from localStorage on open
  function handleOpenChange(o: boolean) {
    if (o) setS(loadSettings());
    setOpen(o);
  }

  function save() {
    saveSettings(s);
    toast({
      title: "Settings saved",
      description: "Your API keys and translation options have been stored locally.",
    });
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Settings className="h-4 w-4" />
          Settings
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>API Keys &amp; Translation Options</DialogTitle>
          <DialogDescription>
            Your keys are stored only in this browser&apos;s localStorage. For
            Netlify deployments, prefer setting{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">
              TMDB_API_KEY
            </code>{" "}
            and{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">
              DEEPSEEK_API_KEY
            </code>{" "}
            as server environment variables instead.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="tmdb-key">TMDB API Key (v4 read access token)</Label>
            <Input
              id="tmdb-key"
              type="password"
              placeholder="eyJhbGciOiJIUzI1NiJ9..."
              value={s.tmdbApiKey}
              onChange={(e) => setS({ ...s, tmdbApiKey: e.target.value })}
            />
            <p className="text-xs text-muted-foreground">
              Get one free at{" "}
              <a
                href="https://www.themoviedb.org/settings/api"
                target="_blank"
                rel="noopener noreferrer"
                className="underline"
              >
                themoviedb.org/settings/api
              </a>
              .
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="ds-key">DeepSeek API Key</Label>
            <Input
              id="ds-key"
              type="password"
              placeholder="sk-..."
              value={s.deepseekApiKey}
              onChange={(e) => setS({ ...s, deepseekApiKey: e.target.value })}
            />
            <p className="text-xs text-muted-foreground">
              Get one at{" "}
              <a
                href="https://platform.deepseek.com/api_keys"
                target="_blank"
                rel="noopener noreferrer"
                className="underline"
              >
                platform.deepseek.com/api_keys
              </a>
              .
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>
                Batch size:{" "}
                <span className="font-mono">{s.batchSize}</span>
              </Label>
              <Slider
                min={2}
                max={20}
                step={1}
                value={[s.batchSize]}
                onValueChange={(v) => setS({ ...s, batchSize: v[0] })}
              />
              <p className="text-xs text-muted-foreground">
                Cues translated per DeepSeek call.
              </p>
            </div>
            <div className="space-y-2">
              <Label>
                Rolling context:{" "}
                <span className="font-mono">{s.rollingContext}</span>
              </Label>
              <Slider
                min={0}
                max={12}
                step={1}
                value={[s.rollingContext]}
                onValueChange={(v) => setS({ ...s, rollingContext: v[0] })}
              />
              <p className="text-xs text-muted-foreground">
                Previous cues sent with each batch for consistency.
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Translation style</Label>
            <Select
              value={s.translationStyle}
              onValueChange={(v) =>
                setS({ ...s, translationStyle: v as UserSettings["translationStyle"] })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="natural">Natural (recommended)</SelectItem>
                <SelectItem value="literal">Literal / faithful</SelectItem>
                <SelectItem value="formal">Formal</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => setS(DEFAULT_SETTINGS)}
          >
            Reset
          </Button>
          <Button onClick={save}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
