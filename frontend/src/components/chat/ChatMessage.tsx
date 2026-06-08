import { SparklesIcon, UserIcon } from '@/components/icons';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { CitedAnswer } from './CitedAnswer';
import { SourceList } from './SourceList';

interface Source {
  url: string;
  title: string;
  relevanceScore: number;
  citationCount: number;
  claims: string[];
}

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  sources?: Source[];
  timestamp: Date;
}

interface ChatMessageProps {
  message: Message;
  className?: string;
}

export function ChatMessage({ message, className = '' }: ChatMessageProps) {
  const isUser = message.role === 'user';

  return (
    <div className={cn('flex animate-fade-up gap-3', isUser ? 'justify-end' : 'justify-start', className)}>
      {!isUser && (
        <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-purple-600 text-white">
          <SparklesIcon className="h-4 w-4" />
        </div>
      )}

      <div className={cn('max-w-2xl', isUser && 'order-1')}>
        <Card className={cn(isUser && 'border-0 bg-primary text-primary-foreground shadow-sm')}>
          <CardContent className="p-4">
            {isUser ? (
              <p className="whitespace-pre-wrap text-sm leading-relaxed">{message.content}</p>
            ) : (
              <CitedAnswer
                content={message.content}
                sources={message.sources}
                className="text-sm leading-relaxed"
              />
            )}
          </CardContent>
        </Card>

        {message.sources && message.sources.length > 0 && (
          <div className="mt-3">
            <SourceList sources={message.sources} />
          </div>
        )}

        <p className="mt-1.5 text-xs text-muted-foreground">{message.timestamp.toLocaleTimeString()}</p>
      </div>

      {isUser && (
        <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <UserIcon className="h-4 w-4" />
        </div>
      )}
    </div>
  );
}
