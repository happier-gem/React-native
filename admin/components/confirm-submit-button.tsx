"use client";

import type { ButtonHTMLAttributes } from "react";

/**
 * A submit button that asks for confirmation before letting a destructive
 * Server Action form actually submit. Progressive enhancement still works:
 * if JS hasn't loaded, this component itself hasn't rendered as interactive,
 * but the form's default browser submit still requires this button to be
 * clicked, so there's no path that skips confirmation once JS is active.
 */
export function ConfirmSubmitButton({
  confirmMessage,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { confirmMessage: string }) {
  return (
    <button
      {...props}
      type="submit"
      onClick={(e) => {
        if (!window.confirm(confirmMessage)) {
          e.preventDefault();
        }
      }}
    >
      {children}
    </button>
  );
}
