import { Check, Circle, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { PipelineStage } from '@/api';

const STAGES: Array<{ id: PipelineStage; label: string }> = [
  { id: 'search', label: 'Search' },
  { id: 'rank', label: 'Rank' },
  { id: 'crawl', label: 'Read' },
  { id: 'context', label: 'Context' },
  { id: 'answer', label: 'Answer' },
  { id: 'citation', label: 'Cite' },
];

interface ProgressStepperProps {
  currentStage: PipelineStage | null;
  message: string | null;
  className?: string;
}

const stageIndex = (s: PipelineStage): number =>
  STAGES.findIndex((stage) => stage.id === s);

export function ProgressStepper({ currentStage, message, className }: ProgressStepperProps) {
  const currentIdx = currentStage ? stageIndex(currentStage) : -1;

  return (
    <div className={cn('space-y-2', className)}>
      <div className="flex items-center gap-1.5 overflow-x-auto">
        {STAGES.map((stage, i) => {
          const isDone = currentIdx > i;
          const isCurrent = currentIdx === i;
          return (
            <div key={stage.id} className="flex items-center gap-1.5">
              <div
                className={cn(
                  'flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-semibold transition-colors',
                  isDone && 'bg-primary text-primary-foreground',
                  isCurrent && 'bg-primary/15 text-primary ring-2 ring-primary/40',
                  !isDone && !isCurrent && 'bg-muted text-muted-foreground',
                )}
                aria-current={isCurrent ? 'step' : undefined}
              >
                {isDone ? (
                  <Check className="h-3.5 w-3.5" />
                ) : isCurrent ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Circle className="h-3.5 w-3.5" />
                )}
              </div>
              <span
                className={cn(
                  'text-xs font-medium transition-colors',
                  isDone && 'text-muted-foreground',
                  isCurrent && 'text-foreground',
                  !isDone && !isCurrent && 'text-muted-foreground/60',
                )}
              >
                {stage.label}
              </span>
              {i < STAGES.length - 1 && (
                <div
                  className={cn(
                    'mx-1 h-px w-4 transition-colors',
                    isDone ? 'bg-primary' : 'bg-border',
                  )}
                />
              )}
            </div>
          );
        })}
      </div>
      {message && (
        <p className="text-xs text-muted-foreground" aria-live="polite">
          {message}
        </p>
      )}
    </div>
  );
}
