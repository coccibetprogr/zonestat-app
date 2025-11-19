"use client";

import React from "react";
import { cn } from "@/lib/utils";

export type SportTabId = "for-you" | "football" | "tennis";

const SPORTS_TABS: { id: SportTabId; label: string }[] = [
  { id: "for-you", label: "Pour toi" },
  { id: "football", label: "Football" },
  { id: "tennis", label: "Tennis" },
];

interface SportsTabsProps {
  value: SportTabId;
  onChange: (id: SportTabId) => void;
}

export function SportsTabs({ value, onChange }: SportsTabsProps) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-1">
      {SPORTS_TABS.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onChange(tab.id)}
          className={cn(
            "px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap border transition",
            value === tab.id
              ? "bg-blue-600 text-white border-blue-600 shadow-sm"
              : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
          )}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
