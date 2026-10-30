"use client";

import { useState } from "react";
import { cn } from "@/lib/shared/utils";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export function EmailPopup({ children, className, unstyled = false, ...props }: { children: React.ReactNode, className?: string, unstyled?: boolean, [key: string]: any }) {
  const [email, setEmail] = useState("");
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, title, message }),
      });
      setLoading(false);
      if (res.ok) {
        setSuccess(true);
      } else {
        setError(res.status === 429 ? "You’ve sent too many messages. Please try again later." : "Failed to send message. Please try again.");
      }
    } catch (err) {
      setError("An error occurred. Please try again.");
      setLoading(false);
    }
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        <span
          className={cn(!unstyled && "underline decoration-dotted underline-offset-4 decoration-foreground/40 hover:decoration-foreground/80 transition-colors", className)}
          {...props}
        >
          {children}
        </span>
      </DialogTrigger>
      <DialogContent aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>Send me an email</DialogTitle>
        </DialogHeader>
        {success ? (
          <p>Message sent!</p>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <Input
              type="email"
              placeholder="Your email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              maxLength={254}
              required
            />
            <Input
              type="text"
              placeholder="Subject"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={120}
              required
            />
            <Textarea
              placeholder="Message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              maxLength={5000}
              required
              className="min-h-32"
            />
            <Button type="submit" disabled={loading}>
              {loading ? "Sending..." : "Send"}
            </Button>
            {error && <p className="text-red-500 text-sm">{error}</p>}
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
