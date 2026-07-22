import { DatabaseZap, UploadCloud } from "lucide-react";
import Link from "next/link";

import { buttonStyles } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { AnalyticsLoad } from "@/lib/analytics";

export function AnalyticsUnavailable({
  status,
}: {
  status: Exclude<AnalyticsLoad<never>["status"], "ready">;
}) {
  const setup = status === "setup";
  return (
    <Card className="mx-auto max-w-2xl border-dashed">
      <CardHeader>
        {setup ? (
          <UploadCloud aria-hidden="true" className="mb-3 size-7 text-lime-300" />
        ) : (
          <DatabaseZap aria-hidden="true" className="mb-3 size-7 text-amber-300" />
        )}
        <CardTitle>
          {setup ? "Analytics setup is not complete" : "Analytics are unavailable"}
        </CardTitle>
        <CardDescription>
          {setup
            ? "Connect the database and import a Music League export to make public insights available."
            : "The analytics database could not be reached or does not have the expected schema. Try again after checking the service."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Link className={buttonStyles({ variant: "secondary" })} href="/">
          Return to dashboard
        </Link>
      </CardContent>
    </Card>
  );
}

export function AnalyticsEmpty({
  title = "No imported music yet",
  description = "Once a league export is imported, this view will fill with round-adjusted analytics.",
}: {
  title?: string;
  description?: string;
}) {
  return (
    <Card className="border-dashed">
      <CardHeader>
        <UploadCloud aria-hidden="true" className="mb-3 size-7 text-zinc-500" />
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
    </Card>
  );
}
