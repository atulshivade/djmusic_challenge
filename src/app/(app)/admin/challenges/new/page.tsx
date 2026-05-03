import { requireAdmin } from "@/lib/auth";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { NewChallengeForm } from "./new-challenge-form";

export default async function NewChallengePage() {
  await requireAdmin();
  return (
    <div className="mx-auto max-w-2xl">
      <Card>
        <CardHeader>
          <CardTitle>Create a new challenge</CardTitle>
          <CardDescription>
            Define the brief: what to play, who it&apos;s for, and when it&apos;s due.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <NewChallengeForm />
        </CardContent>
      </Card>
    </div>
  );
}
