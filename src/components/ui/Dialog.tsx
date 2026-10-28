import { X } from 'lucide-react';
import { useEffect, useRef, type ReactNode } from 'react';
import { et } from '@/i18n/et';

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}

/** Modal built on the native <dialog> element (focus trap and Esc handling included). */
export function Dialog({ open, onClose, title, children }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      aria-labelledby="dialog-title"
      className="m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-xl flex-col overflow-hidden rounded-xl bg-white p-0 shadow-xl backdrop:bg-slate-900/40 open:flex"
    >
      {/* Title stays in view; only the body scrolls when the form is taller than the screen. */}
      <div className="flex shrink-0 items-center justify-between border-b border-slate-200 px-5 py-4">
        <h2 id="dialog-title" className="text-lg font-semibold text-slate-900">
          {title}
        </h2>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md p-1 text-slate-500 hover:bg-slate-100"
          aria-label={et.common.close}
        >
          <X className="size-5" />
        </button>
      </div>
      {open && <div className="overflow-y-auto p-5">{children}</div>}
    </dialog>
  );
}
