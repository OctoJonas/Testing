"use client";

interface MessageInputProps {
  messageInput: string;
  isConnected: boolean;
  isAwaitingReply: boolean;
  onMessageChange: (value: string) => void;
  onSendMessage: () => void;
  onCancelMessage: () => void;
}

export default function MessageInput({
  messageInput,
  isConnected,
  isAwaitingReply,
  onMessageChange,
  onSendMessage,
  onCancelMessage,
}: MessageInputProps) {
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      onSendMessage();
    }
  };

  const placeholder = !isConnected
    ? "Connect first to send messages"
    : isAwaitingReply
      ? "Waiting for assistant…"
      : "Type your message...";

  return (
    <div className="border-t border-gray-200 p-4">
      <div className="flex gap-2">
        <label htmlFor="chat-message-input" className="sr-only">
          Message
        </label>
        <textarea
          id="chat-message-input"
          value={messageInput}
          onChange={(e) => onMessageChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={!isConnected || isAwaitingReply}
          aria-label="Message"
          aria-describedby="chat-message-help"
          className="flex-1 px-4 py-2 border border-gray-300 rounded-lg resize-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed"
          rows={3}
        />
        {isAwaitingReply ? (
          <button
            type="button"
            onClick={onCancelMessage}
            aria-label="Cancel message"
            className="px-6 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-colors font-medium"
          >
            Stop
          </button>
        ) : (
          <button
            type="button"
            onClick={onSendMessage}
            disabled={!isConnected || !messageInput.trim()}
            aria-label="Send message"
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Send
          </button>
        )}
      </div>
      <div id="chat-message-help" className="text-xs text-gray-500 mt-2">
        Press Enter to send, Shift+Enter for new line
      </div>
    </div>
  );
}
