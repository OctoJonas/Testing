"use client";

import { useMemo } from "react";
import { marked } from "marked";
import DOMPurify from "dompurify";

interface MarkdownProps {
  content: string;
  className?: string;
}

marked.setOptions({ gfm: true, breaks: true, async: false });

export default function Markdown({ content, className = "" }: MarkdownProps) {
  const html = useMemo(() => {
    if (!content) return "";
    try {
      const parsed = marked.parse(content, { async: false }) as string;
      return DOMPurify.sanitize(parsed, {
        USE_PROFILES: { html: true },
        FORBID_TAGS: ["style", "iframe", "form", "object", "embed"],
        FORBID_ATTR: ["onerror", "onload", "onclick", "style"],
      });
    } catch (err) {
      console.error("Markdown parsing error:", err);
      return DOMPurify.sanitize(content);
    }
  }, [content]);

  return (
    <div
      className={`prose prose-sm max-w-none ${className}`}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
