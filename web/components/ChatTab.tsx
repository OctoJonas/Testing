"use client";

import { useCallback, useRef, useState } from "react";
import { socketService } from "@/services/socketService";
import { ConfigManager } from "@/services/configManager";
import { useChatSocket } from "@/hooks/useChatSocket";
import { useConfigs } from "@/hooks/useConfigs";
import { useToast } from "@/contexts/useToast";
import ConnectionPanel from "./Chat/ConnectionPanel";
import MessageList from "./Chat/MessageList";
import MessageInput from "./Chat/MessageInput";
import ErrorBanner from "./shared/ErrorBanner";
import { deriveHint } from "@/lib/error-hints";
import { ConnectionStatusStore } from "@/services/connectionStatusStore";
import type { Message } from "@/lib/types";

interface ConnectionError {
  title: string;
  message: string;
  hint?: string;
}

export default function ChatTab() {
  const { showToast } = useToast();
  const [messages, setMessages] = useState<Message[]>([]);
  const [messageInput, setMessageInput] = useState("");
  // Never preselect — the user picks a config and clicks Connect explicitly.
  const [selectedConfig, setSelectedConfig] = useState("");
  const configs = useConfigs();
  const [connectionStatus, setConnectionStatus] = useState("Not connected");
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isAwaitingReply, setIsAwaitingReply] = useState(false);
  const [error, setError] = useState<ConnectionError | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const addSystemMessage = useCallback(
    (content: string, role: "info" | "success" | "system") => {
      setMessages((prev) => [
        ...prev,
        { role: "system", content: `[${role.toUpperCase()}] ${content}`, timestamp: new Date().toISOString() },
      ]);
    },
    [],
  );

  const handleMessageChunk = useCallback((chunk: string) => {
    setMessages((prev) => {
      const last = prev[prev.length - 1];
      if (last && last.role === "assistant") {
        return [...prev.slice(0, -1), { ...last, content: last.content + chunk }];
      }
      return [...prev, { role: "assistant", content: chunk, timestamp: new Date().toISOString() }];
    });
  }, []);

  const showError = useCallback(
    (title: string, message: string, status: string) => {
      setError({ title, message, hint: deriveHint(message) });
      addSystemMessage(`${title}: ${message}`, "system");
      showToast(`${title}: ${message}`, "error", 8_000);
      setIsConnected(false);
      setIsConnecting(false);
      setConnectionStatus(status);
    },
    [addSystemMessage, showToast],
  );

  useChatSocket({
    onConfigured: () => {
      setError(null);
      addSystemMessage("✓ Configuration saved successfully", "success");
    },
    onAuthenticated: () => addSystemMessage("✓ Authenticated successfully", "success"),
    onConnected: () => {
      setError(null);
      setIsConnected(true);
      setIsConnecting(false);
      setConnectionStatus("Connected");
      addSystemMessage("✓ Connected! You can now send messages.", "success");
    },
    onDisconnected: () => {
      setIsConnected(false);
      setConnectionStatus("Not connected");
      addSystemMessage("Disconnected", "info");
    },
    onMessageChunk: handleMessageChunk,
    onMessageComplete: (reply) => {
      setIsAwaitingReply(false);
      // `reply` is the authoritative final text. Reconcile it with whatever
      // streaming chunks built (they should match), and — crucially — render it
      // when the widget didn't stream at all (no chunks → no assistant bubble).
      if (reply) {
        setMessages((prev) => {
          const last = prev[prev.length - 1];
          if (last && last.role === "assistant") {
            return last.content === reply
              ? prev
              : [...prev.slice(0, -1), { ...last, content: reply }];
          }
          return [
            ...prev,
            { role: "assistant", content: reply, timestamp: new Date().toISOString() },
          ];
        });
      }
    },
    onMessageError: (e) => {
      addSystemMessage(`Error: ${e}`, "system");
      showToast(`Message error: ${e}`, "error");
      setIsAwaitingReply(false);
    },
    onChatCancelled: (msg) => {
      addSystemMessage(msg, "info");
      setIsAwaitingReply(false);
    },
    onConversationSaved: (message) => {
      addSystemMessage(message, "success");
      showToast(message, "success");
    },
    onConfigurationError: (e) => showError("Configuration error", e, "Configuration failed"),
    onAuthenticationError: (e) => showError("Authentication failed", e, "Authentication failed"),
    onConnectionError: (e) => showError("Connection error", e, "Connection failed"),
  });

  const handleConnect = () => {
    if (!selectedConfig) {
      showToast("Please select a configuration", "warning");
      return;
    }
    const config = configs.find((c) => c.name === selectedConfig);
    if (!config) {
      showToast("Configuration not found", "error");
      return;
    }
    setError(null);
    setIsConnecting(true);
    setConnectionStatus("Connecting...");
    addSystemMessage("Configuring...", "info");
    ConnectionStatusStore.set("chat", "configuring");
    ConfigManager.setLastUsedConfig(config.name);
    socketService.configure(config, "chat");
  };

  const handleDisconnect = () => {
    socketService.disconnectChat("chat");
    setIsConnected(false);
    setConnectionStatus("Not connected");
    setError(null);
    ConnectionStatusStore.set("chat", "idle");
  };

  const handleSendMessage = () => {
    if (!messageInput.trim() || !isConnected || isAwaitingReply) return;
    const userMessage: Message = {
      role: "user",
      content: messageInput,
      timestamp: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMessage]);
    socketService.sendMessage(messageInput, "chat");
    setMessageInput("");
    setIsAwaitingReply(true);
  };

  const handleCancelMessage = () => {
    socketService.cancelChat("chat");
  };

  const handleSaveConversation = () => {
    const config = configs.find((c) => c.name === selectedConfig);
    if (!config) {
      showToast("Please select a configuration first", "warning");
      return;
    }
    socketService.saveConversation(config);
  };

  return (
    <div className="bg-white rounded-b-lg shadow-sm p-6">
      <ConnectionPanel
        configs={configs}
        selectedConfig={selectedConfig}
        connectionStatus={connectionStatus}
        isConnected={isConnected}
        isConnecting={isConnecting}
        onConfigChange={setSelectedConfig}
        onConnect={handleConnect}
        onDisconnect={handleDisconnect}
        onSaveConversation={handleSaveConversation}
      />
      {error && (
        <ErrorBanner
          title={error.title}
          message={error.message}
          hint={error.hint}
          onDismiss={() => setError(null)}
        />
      )}
      <div className="flex flex-col h-[600px] border border-gray-200 rounded-lg">
        <MessageList messages={messages} messagesEndRef={messagesEndRef} />
        <MessageInput
          messageInput={messageInput}
          isConnected={isConnected}
          isAwaitingReply={isAwaitingReply}
          onMessageChange={setMessageInput}
          onSendMessage={handleSendMessage}
          onCancelMessage={handleCancelMessage}
        />
      </div>
    </div>
  );
}
