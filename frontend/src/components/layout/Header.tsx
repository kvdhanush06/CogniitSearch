import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth, useTheme } from '@/hooks';
import {
  ArrowRightIcon,
  LogoMark,
  LogOutIcon,
  MessageSquareIcon,
  MoonIcon,
  SunIcon,
  UserIcon,
} from '@/components/icons';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

function getInitials(name: string | null | undefined, email: string | null | undefined): string {
  const source = (name && name.trim()) || (email && email.split('@')[0]) || '?';
  return source
    .split(/\s+/)
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

export function Header() {
  const { theme, toggleTheme } = useTheme();
  const { user, isLoading, signInWithGoogle, signOut } = useAuth();
  const [scrolled, setScrolled] = useState(false);
  const { pathname } = useLocation();
  // The Chat button is hidden on the chat pages themselves — there's
  // no value in a "go to chat" link when you're already on /chat.
  const onChatRoute = pathname === '/chat' || pathname.startsWith('/chat/');

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <header
      className={cn(
        'sticky top-0 z-50 w-full transition-all duration-300',
        scrolled
          ? 'glass border-b border-border/60 shadow-sm'
          : 'bg-transparent',
      )}
    >
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link
          to="/"
          className="group flex items-center gap-2.5 transition-opacity hover:opacity-80"
        >
          <LogoMark className="h-8 w-8" />
          <span className="text-lg font-semibold tracking-tight">CogniitSearch</span>
        </Link>

        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleTheme}
            aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {theme === 'dark' ? <SunIcon className="h-5 w-5" /> : <MoonIcon className="h-5 w-5" />}
          </Button>

          {/* Direct link to the chat interface. Sits to the left of
              the user icon / sign-in button. Hidden on the chat
              routes themselves — clicking "Chat" while you're on
              /chat is a no-op. */}
          {!onChatRoute && (
            <Button asChild variant="ghost" size="sm" className="gap-1.5">
              <Link to="/chat" aria-label="Open chat">
                <MessageSquareIcon className="h-4 w-4" />
                <span className="hidden sm:inline">Chat</span>
              </Link>
            </Button>
          )}

          {user ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="rounded-full"
                  aria-label="Account menu"
                >
                  <Avatar className="h-8 w-8">
                    {user.avatarUrl ? <AvatarImage src={user.avatarUrl} alt={user.displayName ?? ''} /> : null}
                    <AvatarFallback>{getInitials(user.displayName, user.email)}</AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-[12rem]">
                <DropdownMenuLabel>
                  <div className="flex flex-col">
                    <span className="text-sm font-medium">
                      {user.displayName ?? user.email ?? 'Signed in'}
                    </span>
                    {user.email ? (
                      <span className="truncate text-xs text-muted-foreground">{user.email}</span>
                    ) : null}
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => void signOut()} className="gap-2">
                  <LogOutIcon className="h-4 w-4" />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <Button
              onClick={() => void signInWithGoogle()}
              disabled={isLoading}
              className="group gap-1.5 bg-gradient-to-r from-indigo-500 via-fuchsia-500 to-pink-500 text-white shadow-brand transition-all hover:brightness-110 hover:shadow-brand-lg"
            >
              {isLoading ? 'Loading…' : 'Sign in'}
              {!isLoading && <ArrowRightIcon className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />}
            </Button>
          )}

          {!user && (
            <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
              <Link to="/chat" className="gap-1.5">
                Get started
                <ArrowRightIcon className="h-4 w-4" />
              </Link>
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}
