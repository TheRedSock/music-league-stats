"use client";

import { useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";

export function FactPanelDialog({
  children,
  description,
  dialogClassName,
  itemCount,
  previewLimit,
  title,
}: {
  children: ReactNode;
  description: string;
  dialogClassName?: string;
  itemCount: number;
  previewLimit: number;
  title: string;
}) {
  const [open, setOpen] = useState(false);
  if (itemCount <= previewLimit) return null;

  return (
    <>
      <Button
        className="w-full sm:w-auto"
        onClick={() => setOpen(true)}
        size="sm"
        variant="secondary"
      >
        View all ({itemCount})
      </Button>
      <Dialog
        className={dialogClassName}
        description={description}
        onClose={() => setOpen(false)}
        open={open}
        title={title}
      >
        {children}
      </Dialog>
    </>
  );
}
