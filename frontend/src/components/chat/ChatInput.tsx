import { useState, useEffect, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface ChatInputProps {
  onSend: (message: string) => void;
  disabled?: boolean;
  placeholder?: string;
  /**
   * Optional initial value. When it changes (after a value was previously
   * consumed), the input clears — used by ChatPage to pre-fill from `?q=`
   * and then auto-submit.
   */
  initialValue?: string;
}

export function ChatInput({
  onSend,
  disabled = false,
  placeholder = 'Ask anything...',
  initialValue = '',
}: ChatInputProps) {
  const [input, setInput] = useState(initialValue);

  useEffect(() => {
    if (initialValue) {
      setInput(initialValue);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialValue]);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setInput('');
  };

  return (
    <form onSubmit={handleSubmit} className="relative w-full">
      {/* shadcn Input with autosizing via min/max height. We use a textarea
          for multi-line UX (Shift+Enter = new line); shadcn's Input is
          single-line so we keep that primitive available elsewhere and
          style a textarea here to match. */}
      <div
        className={cn(
          'flex items-end gap-2 rounded-lg border border-input bg-background px-3 py-3',
          'transition-colors focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2',
          disabled && 'opacity-60',
        )}
      >
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          rows={1}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSubmit(e as unknown as FormEvent);
            }
          }}
          className="flex-1 resize-none bg-transparent text-sm leading-relaxed text-foreground placeholder:text-muted-foreground outline-none disabled:opacity-50"
          style={{ minHeight: '24px', maxHeight: '200px' }}
        />
        <Button type="submit" disabled={disabled || !input.trim()} size="sm">
          {disabled ? (
            <span className="flex items-center gap-2">
              <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" aria-hidden>
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                  fill="none"
                />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              <span>Thinking</span>
            </span>
          ) : (
            'Send'
          )}
        </Button>
      </div>
      <p className="mt-2 text-center text-xs text-muted-foreground">
        Press Enter to send, Shift+Enter for new line
      </p>
    </form>
  );
}
