import type { ReactNode } from "react";

import { FactPanelDialog } from "@/components/analytics/fact-panel-dialog";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

export const FACT_PREVIEW_LIMIT = 5;

/** Server-friendly panel: preview stays on the server; only the dialog is client. */
export function FactPanel({
  children,
  className,
  description,
  dialog,
  dialogClassName,
  emptyMessage = "Nothing to show in this scope.",
  itemCount,
  title,
}: {
  children: ReactNode;
  className?: string;
  description: string;
  dialog?: ReactNode;
  dialogClassName?: string;
  emptyMessage?: string;
  itemCount: number;
  title: string;
}) {
  return (
    <Card className={cn(className)}>
      <CardHeader>
        <CardTitle className="text-sm">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {itemCount > 0 ? (
          children
        ) : (
          <p className="text-sm text-zinc-500">{emptyMessage}</p>
        )}
        {dialog ? (
          <FactPanelDialog
            description={description}
            dialogClassName={dialogClassName}
            itemCount={itemCount}
            previewLimit={FACT_PREVIEW_LIMIT}
            title={title}
          >
            {dialog}
          </FactPanelDialog>
        ) : null}
      </CardContent>
    </Card>
  );
}
