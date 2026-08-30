"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Bot, Send, Settings, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { CopilotChat } from "@/components/copilot/CopilotChat";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

export default function CopilotPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSendMessage = async () => {
    if (!inputValue.trim()) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: inputValue,
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInputValue("");
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/ai/copilot", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          prompt: inputValue,
          context: messages.map(msg => ({ role: msg.role, content: msg.content })),
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      const assistantMessage: Message = {
        id: Date.now().toString(),
        role: "assistant",
        content: data.response || "Sorry, I couldn't process that request.",
        timestamp: new Date(),
      };

      setMessages(prev => [...prev, assistantMessage]);
    } catch (err) {
      console.error("Error sending message:", err);
      setError(err instanceof Error ? err.message : "Failed to get response");
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  return (
    <div className="flex h-full flex-col">
      <Card className="flex-1 overflow-hidden">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Bot className="h-4 w-4" />
            </div>
            <CardTitle className="text-lg">AI Copilot</CardTitle>
          </div>
          <Button variant="ghost" size="icon">
            <Settings className="h-4 w-4" />
          </Button>
        </CardHeader>
        <CardContent className="flex flex-col h-full p-0">
          <ScrollArea className="flex-1 px-4">
            {messages.length === 0 ? (
              <div className="flex h-full items-center justify-center">
                <div className="text-center text-muted-foreground">
                  <Bot className="mx-auto h-12 w-12 text-primary/20" />
                  <p className="mt-2 text-sm">Ask me anything about your HR workflows</p>
                </div>
              </div>
            ) : (
              <div className="space-y-4 py-4">
                {messages.map((message) => (
                  <motion.div
                    key={message.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`max-w-[80%] rounded-lg px-4 py-2 ${message.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted"}`}
                    >
                      <p className="text-sm">{message.content}</p>
                    </div>
                  </motion.div>
                ))}
                {isLoading && (
                  <div className="flex justify-start">
                    <div className="max-w-[80%] rounded-lg bg-muted px-4 py-2">
                      <div className="flex items-center gap-2">
                        <motion.div
                          animate={{ opacity: [0.3, 1, 0.3] }}
                          transition={{
                            duration: 1,
                            repeat: Infinity,
                            ease: "easeInOut",
                          }}
                          className="h-2 w-2 rounded-full bg-primary"
                        />
                        <span className="text-sm text-muted-foreground">Thinking...</span>
                      </div>
                    </div>
                  </div>
                )}
                {error && (
                  <div className="flex justify-start">
                    <div className="max-w-[80%] rounded-lg bg-destructive/10 px-4 py-2">
                      <p className="text-sm text-destructive">{error}</p>
                    </div>
                  </div>
                )}
              </div>
            )}
          </ScrollArea>
          <div className="border-t border-border p-4">
            <div className="flex items-center gap-2">
              <Input
                placeholder="Ask about candidates, leave requests, or workflows..."
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                className="flex-1"
                disabled={isLoading}
              />
              <Button
                onClick={handleSendMessage}
                disabled={isLoading || !inputValue.trim()}
                size="icon"
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}