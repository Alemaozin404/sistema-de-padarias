"use client";

import { useState } from "react";

type Props = { url: string; label: string; copiedLabel: string };

export function CopyLinkButton({ url, label, copiedLabel }: Props) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Sem permissão de clipboard: o link continua visível na página.
      setCopied(false);
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      className="rounded-lg border border-black/15 px-3 py-2 text-sm hover:border-brand-600"
    >
      {copied ? copiedLabel : label}
    </button>
  );
}
