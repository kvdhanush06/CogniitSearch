import { FeatureCard } from './FeatureCard.js';
import {
  GlobeAltIcon,
  DocumentTextIcon,
  LinkIcon,
  BoltIcon,
} from '@/components/icons';

export function Features() {
  const items = [
    {
      icon: <GlobeAltIcon className="h-5 w-5" />,
      title: 'Real web search',
      description:
        'Finds the freshest, most relevant sources via Tinyfish — not a fixed corpus.',
    },
    {
      icon: <DocumentTextIcon className="h-5 w-5" />,
      title: 'Deep page crawling',
      description:
        'Reads the top results in full so the answer reflects the actual content, not just snippets.',
    },
    {
      icon: <LinkIcon className="h-5 w-5" />,
      title: 'Inline citations',
      description:
        'Every claim is tagged with [1], [2], [3] and resolves to the original source — verifiable, not vibes.',
    },
    {
      icon: <BoltIcon className="h-5 w-5" />,
      title: 'Real-time streaming',
      description:
        'Tokens stream in over Server-Sent Events the moment the model starts writing — no waiting.',
    },
  ];

  return (
    <section className="relative py-20 sm:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-semibold uppercase tracking-wider text-fuchsia-600 dark:text-fuchsia-400">
            Features
          </p>
          <h2 className="mt-2 text-3xl font-bold tracking-tight text-gray-900 dark:text-gray-50 sm:text-4xl">
            Built for serious answers
          </h2>
          <p className="mt-4 text-base text-gray-600 dark:text-gray-400">
            A real search pipeline behind every response — not a paraphrased
            training set.
          </p>
        </div>

        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {items.map((it, i) => (
            <div
              key={it.title}
              className="animate-fade-up"
              style={{ animationDelay: `${i * 80}ms` }}
            >
              <FeatureCard
                icon={it.icon}
                title={it.title}
                description={it.description}
              />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
