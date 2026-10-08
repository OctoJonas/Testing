"use client";

import { memo, useEffect, useMemo } from "react";
import type { Message } from "@/lib/types";

interface MessageListProps {
  messages: Message[];
  messagesEndRef: React.RefObject<HTMLDivElement | null>;
}

const MAX_RENDERED_MESSAGES = 500;

const MessageBubble = memo(function MessageBubble({ msg }: { msg: Message }) {
  if (msg.role === "user") {
    return (
      <div className="flex justify-end mb-4 px-2">
        <div className="max-w-[75%]">
          <div className="bg-blue-600 text-white rounded-2xl rounded-tr-sm px-4 py-3 shadow-md">
            <div className="text-sm leading-relaxed whitespace-pre-wrap break-words">{msg.content}</div>
          </div>
          {msg.timestamp && (
            <div className="text-xs text-gray-500 mt-1.5 text-right px-2">
              {new Date(msg.timestamp).toLocaleTimeString()}
            </div>
          )}
        </div>
      </div>
    );
  }
  if (msg.role === "assistant") {
    return (
      <div className="flex justify-start mb-4 px-2">
        <div className="max-w-[75%]">
          <div className="bg-white border border-gray-200 text-gray-900 rounded-2xl rounded-tl-sm px-4 py-3 shadow-md">
            <div className="text-sm leading-relaxed whitespace-pre-wrap break-words">{msg.content}</div>
          </div>
          {msg.timestamp && (
            <div className="text-xs text-gray-500 mt-1.5 px-2">
              {new Date(msg.timestamp).toLocaleTimeString()}
            </div>
          )}
        </div>
      </div>
    );
  }
  return (
    <div className="flex justify-center mb-3">
      <div className="bg-gray-100 text-gray-700 rounded-lg px-3 py-1.5 text-xs font-medium shadow-sm">
        {msg.content}
      </div>
    </div>
  );
});

export default function MessageList({ messages, messagesEndRef }: MessageListProps) {
  const visible = useMemo(() => {
    if (messages.length <= MAX_RENDERED_MESSAGES) return messages;
    return messages.slice(messages.length - MAX_RENDERED_MESSAGES);
  }, [messages]);

  const truncated = messages.length - visible.length;

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, messagesEndRef]);

  return (
    <div className="flex-1 overflow-y-auto p-4" role="log" aria-live="polite">
      {messages.length === 0 ? (
        <div className="text-center text-gray-500 mt-8">No messages yet. Connect and start chatting!</div>
      ) : (
        <>
          {truncated > 0 && (
            <div className="text-center text-xs text-gray-400 mb-3">
              {truncated} earlier message{truncated === 1 ? "" : "s"} hidden
            </div>
          )}
          {visible.map((msg, idx) => (
            <MessageBubble key={`${msg.timestamp}-${idx}`} msg={msg} />
          ))}
        </>
      )}
      <div ref={messagesEndRef} />
    </div>
  );
}
