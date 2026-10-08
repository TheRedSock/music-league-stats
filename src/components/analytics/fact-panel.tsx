import type { FactDetail } from "@/lib/detail-pagination";
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

export const FACT_PREVIEW_LIMIT = 3;

/** Server-friendly panel: preview stays on the server; only the dialog is client. */
export function FactPanel({
  children,
  className,
  description,
  dialog,
  detail,
  dialogClassName,
  emptyMessage = "Nothing to show in this scope.",
  itemCount,
  title,
}: {
  children: ReactNode;
  className?: string;
  description: string;
  dialog?: ReactNode;
  detail?: FactDetail;
  dialogClassName?: string;
  emptyMessage?: string;
  itemCount: number;
  title: string;
}) {
  return (
    <Card className={cn(className)}>
      <CardHeader>
        <CardTitle className="text-sm">{title}</CardTitle>
        <details className="text-xs text-zinc-400"><summary className="cursor-pointer">About this stat</summary><CardDescription className="mt-2">{description}</CardDescription></details>
      </CardHeader>
      <CardContent className="space-y-4">
        {itemCount > 0 ? (
          children
        ) : (
          <p className="text-sm text-zinc-500">{emptyMessage}</p>
        )}
        {detail && itemCount > FACT_PREVIEW_LIMIT ? (
          <FactPanelDialog
            detail={detail}
            description={description}
            dialogClassName={dialogClassName}
            itemCount={itemCount}
            title={title}
          >
            {detail.open ? dialog : null}
          </FactPanelDialog>
        ) : null}
      </CardContent>
    </Card>
  );
}
