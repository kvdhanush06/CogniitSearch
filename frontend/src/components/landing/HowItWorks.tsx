import { SearchIcon, BrainIcon, LinkIcon, ArrowLongRightIcon } from '@/components/icons';

const STEPS = [
  {
    icon: SearchIcon,
    title: 'You ask',
    body: 'Type a question — anything from "How does X work?" to "Compare A and B".',
  },
  {
    icon: BrainIcon,
    title: 'Search & crawl',
    body: 'The pipeline runs a web search, ranks the top results, and crawls the most relevant pages in parallel.',
  },
  {
    icon: LinkIcon,
    title: 'Cited answer',
    body: 'The LLM writes a structured answer, tagged with [1], [2], [3] that resolve to the original sources.',
  },
];

export function HowItWorks() {
  return (
    <section className="relative bg-gradient-to-b from-transparent via-fuchsia-50/30 to-transparent py-20 dark:via-fuchsia-950/10 sm:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-semibold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
            How it works
          </p>
          <h2 className="mt-2 text-3xl font-bold tracking-tight text-gray-900 dark:text-gray-50 sm:text-4xl">
            From question to cited answer in seconds
          </h2>
          <p className="mt-4 text-base text-gray-600 dark:text-gray-400">
            The same flow Perplexity uses — but open and inspectable.
          </p>
        </div>

        <ol className="mt-14 grid gap-8 md:grid-cols-3 md:gap-6">
          {STEPS.map((step, i) => {
            const Icon = step.icon;
            return (
              <li
                key={step.title}
                className="relative flex flex-col items-start gap-3 rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-gray-900/60 animate-fade-up"
                style={{ animationDelay: `${i * 100}ms` }}
              >
                <div className="flex items-center gap-3">
                  <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-brand-gradient text-sm font-semibold text-white shadow-brand">
                    {i + 1}
                  </span>
                  <Icon className="h-5 w-5 text-gray-500 dark:text-gray-400" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-50">
                  {step.title}
                </h3>
                <p className="text-sm leading-relaxed text-gray-600 dark:text-gray-400">
                  {step.body}
                </p>

                {/* Connector arrow — desktop only */}
                {i < STEPS.length - 1 && (
                  <ArrowLongRightIcon
                    aria-hidden
                    className="absolute -right-5 top-1/2 hidden h-6 w-6 -translate-y-1/2 text-gray-300 md:block dark:text-gray-700"
                  />
                )}
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}
