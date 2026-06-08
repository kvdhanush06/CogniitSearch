import { LinkIcon } from '@/components/icons';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';

interface Source {
  url: string;
  title: string;
  relevanceScore: number;
  citationCount: number;
  claims: string[];
}

interface SourceListProps {
  sources: Source[];
  className?: string;
}

export function SourceList({ sources, className = '' }: SourceListProps) {
  if (sources.length === 0) return null;

  return (
    <div className={cn('space-y-2', className)}>
      <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        <LinkIcon className="h-3.5 w-3.5" />
        Sources
      </div>
      <div className="grid gap-2">
        {sources.map((source, index) => (
          <a
            key={`${source.url}-${index}`}
            href={source.url}
            target="_blank"
            rel="noopener noreferrer"
            className="block"
          >
            <Card className="transition-colors hover:bg-accent/40">
              <div className="flex items-start gap-3 p-3">
                <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-semibold text-secondary-foreground">
                  {index + 1}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">{source.title}</p>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">{source.url}</p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-2">
                    <Badge variant="secondary" className="text-[10px]">
                      Relevance {Math.round(source.relevanceScore * 100)}%
                    </Badge>
                    {source.citationCount > 0 && (
                      <Badge variant="outline" className="text-[10px]">
                        {source.citationCount} citation{source.citationCount !== 1 ? 's' : ''}
                      </Badge>
                    )}
                  </div>
                </div>
              </div>
            </Card>
          </a>
        ))}
      </div>
      <Separator className="mt-3" />
    </div>
  );
}
