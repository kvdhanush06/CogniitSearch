import { SparklesIcon } from '@/components/icons';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
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

interface StreamingResponseProps {
  content: string;
  sources?: Source[];
  className?: string;
}

export function StreamingResponse({
  content,
  sources = [],
  className = '',
}: StreamingResponseProps) {
  return (
    <div className={cn('flex animate-fade-up gap-3', className)}>
      <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-purple-600 text-white">
        <SparklesIcon className="h-4 w-4" />
      </div>
      <div className="max-w-2xl flex-1 space-y-3">
        <Card>
          <CardContent className="p-4">
            <div className="text-sm leading-relaxed">
              <CitedAnswer content={content} sources={sources} />
              <span className="ml-1 inline-block w-2 animate-pulse-soft">
                <Skeleton className="inline-block h-4 w-2 align-text-bottom" />
              </span>
            </div>
          </CardContent>
        </Card>

        {sources.length > 0 && (
          <>
            <Separator />
            <SourceList sources={sources} />
          </>
        )}
      </div>
    </div>
  );
}
