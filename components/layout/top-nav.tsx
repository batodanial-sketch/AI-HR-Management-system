"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import {
  Bell,
  Check,
  Moon,
  Search,
  Sparkles,
  Sun,
} from "lucide-react";
import { useCopilot } from "@/components/copilot/copilot-provider";
import { useSettings, useUser } from "@/components/providers";
import { NameAvatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { WindowControls } from "@/components/layout/window-controls";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { notifications } from "@/lib/data";
import { supportedCurrencies } from "@/lib/data";
import type { CurrencyCode } from "@/lib/types";

/**
 * Top navigation bar: command search, notification center, currency toggle,
 * theme toggle, and the AI Copilot quick-trigger.
 */
export function TopNav() {
  const pathname = usePathname();
  const { toggle: toggleCopilot } = useCopilot();
  const { theme, setTheme, currency, setCurrency } = useSettings();
  const user = useUser();
  const [unread, setUnread] = React.useState(
    () => notifications.filter((item) => !item.read).length,
  );

  const markAllRead = () => setUnread(0);

  return (
    <header
      data-testid="app-topnav"
      className="sticky top-0 z-20 flex h-[var(--header-height)] items-center gap-3 border-b border-border/70 bg-background/70 px-4 backdrop-blur-xl"
    >
      {/* Frameless window controls (Electron only — no-op in browser) */}
      <WindowControls />

      {/* Search */}
      <div className="relative hidden w-full max-w-sm sm:block electron-no-drag">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          data-testid="topnav-search"
          placeholder="Search employees, candidates…"
          className="h-9 bg-card/60 pl-9"
        />
      </div>

      {/* Empty titlebar spacer — doubles as the Electron drag region */}
      <div className="flex-1 electron-drag" data-testid="titlebar-drag" />

      {/* Currency toggle */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5 text-xs font-semibold"
            data-testid="currency-toggle"
          >
            {currency}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-32">
          <DropdownMenuLabel>Currency</DropdownMenuLabel>
          {supportedCurrencies.map((code: CurrencyCode) => (
            <DropdownMenuItem
              key={code}
              onClick={() => setCurrency(code)}
              className="flex items-center justify-between"
            >
              {code}
              {code === currency && <Check className="h-4 w-4" />}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Theme toggle */}
      <Button
        variant="ghost"
        size="icon"
        aria-label="Toggle theme"
        onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
      >
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={theme}
            initial={{ rotate: -90, opacity: 0 }}
            animate={{ rotate: 0, opacity: 1 }}
            exit={{ rotate: 90, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="flex"
          >
            {theme === "dark" ? (
              <Sun className="h-4 w-4" />
            ) : (
              <Moon className="h-4 w-4" />
            )}
          </motion.span>
        </AnimatePresence>
      </Button>

      {/* Notifications */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="relative"
            aria-label="Notifications"
          >
            <Bell className="h-4 w-4" />
            {unread > 0 && (
              <span className="absolute right-1 top-1 flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
              </span>
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-80">
          <div className="flex items-center justify-between px-2 py-1.5">
            <DropdownMenuLabel>Notifications</DropdownMenuLabel>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-xs"
              onClick={markAllRead}
            >
              Mark all read
            </Button>
          </div>
          <DropdownMenuSeparator />
          <div className="max-h-80 overflow-y-auto">
            {notifications.map((item) => (
              <DropdownMenuItem key={item.id} className="flex-col items-start gap-1 py-2.5">
                <div className="flex w-full items-center justify-between">
                  <span className="text-sm font-medium">{item.title}</span>
                  {!item.read && <Badge variant="accent" className="h-1.5 w-1.5 rounded-full p-0" />}
                </div>
                <span className="text-xs text-muted-foreground">
                  {item.description}
                </span>
              </DropdownMenuItem>
            ))}
          </div>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Copilot trigger */}
      <Button
        data-testid="copilot-trigger-button"
        onClick={toggleCopilot}
        className="gap-1.5 shadow-md shadow-primary/30"
        size="sm"
      >
        <Sparkles className="h-4 w-4" />
        <span className="hidden sm:inline">Copilot</span>
      </Button>

      {/* User */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            className="flex items-center gap-2 rounded-full transition-opacity hover:opacity-80"
            aria-label="Account menu"
          >
            <NameAvatar name={user.fullName} className="h-8 w-8" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel>
            <div className="flex flex-col">
              <span>{user.fullName}</span>
              <span className="text-xs font-normal text-muted-foreground">
                {user.email}
              </span>
            </div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <a href="/settings">Settings</a>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="text-destructive"
            onClick={() => {
              // Sign out via the server route, then land on /login.
              void fetch("/auth/sign-out", { method: "POST" }).then(() => {
                window.location.href = "/login";
              });
            }}
          >
            Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Mobile path indicator */}
      <span className="sr-only">{pathname}</span>
    </header>
  );
}
