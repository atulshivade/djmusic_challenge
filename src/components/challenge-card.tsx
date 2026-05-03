import { Calendar, Trophy } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { InstrumentIcon } from "@/components/instrument-icon";
import type { Challenge } from "@/db/schema";
import {
  formatRelativeDeadline,
  formatInstrument,
  formatSkillLevel,
} from "@/lib/utils";

export function ChallengeCard({ challenge }: { challenge: Challenge }) {
  const deadlineLabel = formatRelativeDeadline(challenge.deadline);
  const closed = deadlineLabel === "Closed";
  return (
    <Card className="group h-full overflow-hidden border-border/60 bg-card/80 transition-all hover:-translate-y-0.5 hover:shadow-xl hover:shadow-primary/10">
      {challenge.coverImageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={challenge.coverImageUrl}
          alt=""
          className="h-32 w-full object-cover transition-transform duration-500 group-hover:scale-105"
        />
      ) : (
        <div className="relative h-32 w-full overflow-hidden bg-gradient-to-br from-primary/55 via-accent/40 to-primary/20">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,white,transparent_60%)] opacity-10" />
        </div>
      )}
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <Badge variant={closed ? "secondary" : "success"}>{deadlineLabel}</Badge>
          <span className="inline-flex items-center gap-1 text-sm font-medium text-amber-500">
            <Trophy className="h-3.5 w-3.5" />
            {challenge.points} pts
          </span>
        </div>
        <CardTitle className="line-clamp-2">{challenge.title}</CardTitle>
        <CardDescription className="line-clamp-2">
          {challenge.description}
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="flex flex-wrap gap-1.5 text-xs">
          {challenge.instrumentFocus && (
            <Badge variant="outline" className="gap-1">
              <InstrumentIcon
                instrument={challenge.instrumentFocus}
                className="h-3 w-3"
              />
              {formatInstrument(challenge.instrumentFocus)}
            </Badge>
          )}
          {challenge.skillLevelTarget && (
            <Badge variant="secondary">
              {formatSkillLevel(challenge.skillLevelTarget)}
            </Badge>
          )}
        </div>
      </CardContent>
      <CardFooter className="text-xs text-muted-foreground">
        <Calendar className="mr-1 h-3 w-3" />
        Due {new Date(challenge.deadline).toLocaleString("en-US", {
          dateStyle: "medium",
          timeStyle: "short",
        })}
      </CardFooter>
    </Card>
  );
}
