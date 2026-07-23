"use client";

import { useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export const FACT_PREVIEW_LIMIT = 5;

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
  const [open, setOpen] = useState(false);
  const canViewAll = itemCount > FACT_PREVIEW_LIMIT && Boolean(dialog);

  return (
    <>
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
          {canViewAll ? (
            <Button
              className="w-full sm:w-auto"
              onClick={() => setOpen(true)}
              size="sm"
              variant="secondary"
            >
              View all ({itemCount})
            </Button>
          ) : null}
        </CardContent>
      </Card>
      {dialog ? (
        <Dialog
          className={dialogClassName}
          description={description}
          onClose={() => setOpen(false)}
          open={open}
          title={title}
        >
          {dialog}
        </Dialog>
      ) : null}
    </>
  );
}
