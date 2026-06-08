import { ArrowRight, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface FollowUpsProps {
  questions: string[];
  onSelect: (q: string) => void;
  className?: string;
}

export function FollowUps({ questions, onSelect, className }: FollowUpsProps) {
  if (questions.length === 0) return null;
  return (
    <div className={className}>
      <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        <Sparkles className="h-3.5 w-3.5" />
        Follow-up
      </div>
      <div className="flex flex-col gap-1.5">
        {questions.map((q) => (
          <Button
            key={q}
            variant="outline"
            className="h-auto justify-between gap-2 whitespace-normal py-2 text-left text-sm"
            onClick={() => onSelect(q)}
          >
            <span className="flex-1">{q}</span>
            <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
          </Button>
        ))}
      </div>
    </div>
  );
}
