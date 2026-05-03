"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertCircle, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DateTimePicker } from "@/components/date-time-picker";
import {
  INSTRUMENT_VALUES,
  SKILL_LEVEL_VALUES,
} from "@/lib/validators";
import { formatInstrument, formatSkillLevel } from "@/lib/utils";
import { createChallengeAction } from "./actions";

const SELECT_CLS =
  "flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function NewChallengeForm() {
  const router = useRouter();
  const [isPending, startTransition] = React.useTransition();
  const [deadline, setDeadline] = React.useState<Date | undefined>(() => {
    // Default deadline = 7 days from now at 23:59 local time.
    const d = new Date();
    d.setDate(d.getDate() + 7);
    d.setHours(23, 59, 0, 0);
    return d;
  });
  const [error, setError] = React.useState<string | null>(null);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    if (!deadline) {
      setError("Pick a deadline");
      return;
    }
    if (deadline.getTime() <= Date.now()) {
      setError("Deadline must be in the future");
      return;
    }

    const fd = new FormData(e.currentTarget);
    const payload = {
      title: String(fd.get("title") ?? ""),
      description: String(fd.get("description") ?? ""),
      deadline,
      points: Number(fd.get("points") ?? 100),
      coverImageUrl: String(fd.get("coverImageUrl") ?? "") || undefined,
      instrumentFocus: String(fd.get("instrumentFocus") ?? "") || undefined,
      skillLevelTarget: String(fd.get("skillLevelTarget") ?? "") || undefined,
    };

    startTransition(async () => {
      const result = await createChallengeAction(payload);
      if (result && result.ok === false) {
        setError(result.error);
        toast.error("Couldn't publish challenge", {
          description: result.error,
        });
        return;
      }
      // Success path redirects on the server, but if we land here (e.g.
      // result is undefined due to redirect short-circuit), bounce to /admin.
      toast.success("Challenge published");
      router.push("/admin");
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="space-y-2">
        <Label htmlFor="title">Title</Label>
        <Input
          id="title"
          name="title"
          required
          minLength={3}
          maxLength={120}
          placeholder={`e.g. "Cover the riff in Sweet Child O' Mine"`}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="description">Brief</Label>
        <Textarea
          id="description"
          name="description"
          required
          minLength={10}
          maxLength={4000}
          rows={6}
          placeholder="What should students play? Tempo? Section? Evaluation criteria?"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="deadline-trigger">Deadline</Label>
          <DateTimePicker
            id="deadline-trigger"
            value={deadline}
            onChange={setDeadline}
            placeholder="Pick a deadline"
          />
          <p className="text-xs text-muted-foreground">
            Defaults to 7 days from now at 23:59.
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="points">Points</Label>
          <Input
            id="points"
            name="points"
            type="number"
            min={1}
            max={10000}
            defaultValue={100}
            required
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="instrumentFocus">Instrument focus (optional)</Label>
          <select
            id="instrumentFocus"
            name="instrumentFocus"
            defaultValue=""
            className={SELECT_CLS}
          >
            <option value="">Any instrument</option>
            {INSTRUMENT_VALUES.map((v) => (
              <option key={v} value={v}>
                {formatInstrument(v)}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="skillLevelTarget">Skill target (optional)</Label>
          <select
            id="skillLevelTarget"
            name="skillLevelTarget"
            defaultValue=""
            className={SELECT_CLS}
          >
            <option value="">Any level</option>
            {SKILL_LEVEL_VALUES.map((v) => (
              <option key={v} value={v}>
                {formatSkillLevel(v)}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="coverImageUrl">Cover image URL (optional)</Label>
        <Input
          id="coverImageUrl"
          name="coverImageUrl"
          type="url"
          placeholder="https://…"
        />
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="flex justify-end gap-2 pt-2">
        <Button type="submit" disabled={isPending}>
          {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
          {isPending ? "Publishing…" : "Publish challenge"}
        </Button>
      </div>
    </form>
  );
}
