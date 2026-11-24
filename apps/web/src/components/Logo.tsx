import { Music4 } from "lucide-react";

export function Logo() {
  return (
    <span className="flex items-center gap-2 font-bold tracking-tight">
      <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand-600 text-white shadow-sm">
        <Music4 className="h-4.5 w-4.5" />
      </span>
      Chordsheet
    </span>
  );
}
