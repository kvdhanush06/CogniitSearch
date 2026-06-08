import { LinkIcon, SparklesIcon, CheckIcon } from '@/components/icons';

/**
 * Static, mock assistant answer used as a visual teaser on the landing page.
 * Not interactive — purely demonstrative of what a real /chat response looks like.
 */
const SAMPLE_QUESTION = 'What is retrieval-augmented generation?';

const SAMPLE_ANSWER_PARAGRAPHS: Array<string> = [
  'Retrieval-augmented generation (RAG) is a technique that improves large language model outputs by grounding them in external, up-to-date knowledge.[1] Instead of relying only on what the model learned during training, the system retrieves relevant documents at query time and feeds them to the model as context.[2]',
  'The retrieved passages act as a "cheat sheet" — the LLM can quote them, cite them, and reason over content it never saw during training. This dramatically reduces hallucinations and makes answers verifiable.[1]',
  'A typical RAG pipeline has three stages: search the web or a vector database for candidate documents, rank them by relevance, and finally prompt the LLM with the top results as context. CogniitSearch follows exactly this pattern.[3]',
];

const SAMPLE_SOURCES = [
  {
    n: 1,
    title: 'Retrieval-Augmented Generation for Large Language Models — Survey',
    url: 'arxiv.org/abs/2312.10997',
    relevance: 0.94,
    citations: 2,
  },
  {
    n: 2,
    title: 'What is RAG? — AWS Explainers',
    url: 'aws.amazon.com/what-is/rag',
    relevance: 0.88,
    citations: 1,
  },
  {
    n: 3,
    title: 'CogniitSearch architecture overview',
    url: 'github.com/cogniit/search',
    relevance: 0.81,
    citations: 1,
  },
];

/** Renders a paragraph with [N] tokens turned into superscript pills. */
function renderAnswer(p: string, key: string) {
  const parts = p.split(/(\[\d+\])/g);
  return (
    <p key={key} className="leading-relaxed text-gray-800 dark:text-gray-200">
      {parts.map((part, idx) => {
        const match = /^\[(\d+)\]$/.exec(part);
        if (match) {
          return (
            <a
              key={idx}
              href="#sources"
              className="mx-0.5 inline-flex h-5 min-w-5 items-center justify-center rounded-md bg-fuchsia-100 px-1.5 align-baseline text-[0.7rem] font-semibold text-fuchsia-700 transition-colors hover:bg-fuchsia-200 dark:bg-fuchsia-900/50 dark:text-fuchsia-300 dark:hover:bg-fuchsia-900"
              aria-label={`Source ${match[1]}`}
            >
              {match[1]}
            </a>
          );
        }
        return <span key={idx}>{part}</span>;
      })}
    </p>
  );
}

export function SampleAnswer() {
  return (
    <section className="relative py-20 sm:py-24">
      <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-semibold uppercase tracking-wider text-fuchsia-600 dark:text-fuchsia-400">
            What you get
          </p>
          <h2 className="mt-2 text-3xl font-bold tracking-tight text-gray-900 dark:text-gray-50 sm:text-4xl">
            An answer, not a guess
          </h2>
          <p className="mt-4 text-base text-gray-600 dark:text-gray-400">
            Every claim is grounded in a real source. Click a marker to see
            where it came from.
          </p>
        </div>

        <div className="mt-12 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-lg dark:border-gray-800 dark:bg-gray-900/70">
          {/* Header strip */}
          <div className="flex items-center gap-2 border-b border-gray-200 bg-gray-50/80 px-4 py-2.5 text-xs text-gray-500 dark:border-gray-800 dark:bg-gray-900/80 dark:text-gray-400">
            <span className="h-2.5 w-2.5 rounded-full bg-red-400" />
            <span className="h-2.5 w-2.5 rounded-full bg-yellow-400" />
            <span className="h-2.5 w-2.5 rounded-full bg-green-400" />
            <span className="ml-2 inline-flex items-center gap-1.5">
              <SparklesIcon className="h-3.5 w-3.5 text-fuchsia-500" />
              cogniitsearch.allkvd.dev/chat
            </span>
          </div>

          <div className="space-y-5 p-6 sm:p-8">
            {/* User question */}
            <div className="flex justify-end">
              <div className="max-w-md rounded-2xl bg-gray-900 px-4 py-3 text-sm text-white shadow-sm dark:bg-gray-700">
                {SAMPLE_QUESTION}
              </div>
            </div>

            {/* Assistant answer */}
            <div className="flex items-start gap-3">
              <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-brand-gradient text-white shadow-brand">
                <SparklesIcon className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1 space-y-3 text-[15px]">
                {SAMPLE_ANSWER_PARAGRAPHS.map((p, i) => renderAnswer(p, `p-${i}`))}
              </div>
            </div>

            {/* Sources */}
            <div id="sources" className="border-t border-gray-200 pt-5 dark:border-gray-800">
              <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                <LinkIcon className="h-3.5 w-3.5" />
                Sources
              </div>
              <ul className="space-y-2">
                {SAMPLE_SOURCES.map((s) => (
                  <li
                    key={s.n}
                    className="flex items-start gap-3 rounded-lg bg-gray-50 px-3 py-2.5 text-sm transition-colors hover:bg-gray-100 dark:bg-gray-800/60 dark:hover:bg-gray-800"
                  >
                    <span className="mt-0.5 inline-flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-white text-xs font-semibold text-gray-600 ring-1 ring-gray-200 dark:bg-gray-900 dark:text-gray-300 dark:ring-gray-700">
                      {s.n}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-gray-900 dark:text-gray-100">
                        {s.title}
                      </p>
                      <p className="truncate text-xs text-gray-500 dark:text-gray-500">
                        {s.url}
                      </p>
                    </div>
                    <span className="hidden items-center gap-2 text-xs text-gray-500 sm:flex">
                      <span className="inline-flex items-center gap-0.5 text-emerald-600 dark:text-emerald-400">
                        <CheckIcon className="h-3 w-3" />
                        {Math.round(s.relevance * 100)}%
                      </span>
                      <span className="text-gray-300 dark:text-gray-600">·</span>
                      <span>{s.citations}× cited</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        <p className="mt-4 text-center text-xs text-gray-400 dark:text-gray-600">
          Mock example. Real answers use live web search and stream as they're generated.
        </p>
      </div>
    </section>
  );
}
