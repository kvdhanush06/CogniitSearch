import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { SearchIcon, ArrowRightIcon, MessageSquareIcon } from '@/components/icons';

const SUGGESTIONS = [
  'What were the biggest AI breakthroughs of 2025?',
  'How does mRNA vaccine technology actually work?',
  'Compare React Server Components vs traditional SSR',
  'Why do lithium-ion batteries degrade over time?',
];

function buildChatUrl(query: string): string {
  return `/chat?${new URLSearchParams({ q: query }).toString()}`;
}

export function Hero() {
  const navigate = useNavigate();
  const [value, setValue] = useState('');

  const submit = (raw: string) => {
    const trimmed = raw.trim();
    if (!trimmed) return;
    navigate(buildChatUrl(trimmed));
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    submit(value);
  };

  return (
    <section className="relative overflow-hidden">
      {/* Decorative gradient blobs */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-32 left-1/2 -z-10 h-[500px] w-[700px] -translate-x-1/2 rounded-full bg-brand-gradient opacity-20 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -top-20 right-0 -z-10 h-72 w-72 rounded-full bg-pink-300/40 blur-3xl dark:bg-pink-500/20"
      />

      <div className="mx-auto max-w-4xl px-4 pb-16 pt-16 text-center sm:px-6 sm:pt-20 lg:px-8 lg:pt-24">
        {/* Pill badge */}
        {/* <div
          className="mx-auto inline-flex animate-fade-up items-center gap-1.5 rounded-full border border-gray-200 bg-white/70 px-3 py-1 text-xs font-medium text-gray-700 shadow-sm backdrop-blur transition-colors dark:border-gray-800 dark:bg-gray-900/70 dark:text-gray-300"
          style={{ animationDelay: '0ms' }}
        >
          <SparklesIcon className="h-3.5 w-3.5 text-fuchsia-500" />
          Powered by Groq + Tinyfish
        </div> */}

        {/* Headline */}
        <h1
          className="mt-6 animate-fade-up text-4xl font-bold tracking-tight text-gray-900 dark:text-gray-50 sm:text-5xl lg:text-6xl"
          style={{ animationDelay: '80ms' }}
        >
          Ask anything. <br className="hidden sm:block" />
          <span className="gradient-text">Get answers with sources.</span>
        </h1>

        {/* Subheadline */}
        <p
          className="mx-auto mt-5 max-w-2xl animate-fade-up text-base leading-relaxed text-gray-600 dark:text-gray-400 sm:text-lg"
          style={{ animationDelay: '160ms' }}
        >
          CogniitSearch searches the web, crawls the most relevant pages, and
          synthesizes a comprehensive, cited answer — streamed to you in real
          time.
        </p>

        {/* Search input */}
        <form
          onSubmit={onSubmit}
          className="mx-auto mt-10 max-w-2xl animate-fade-up"
          style={{ animationDelay: '240ms' }}
        >
          <div className="group relative">
            <div
              className="pointer-events-none absolute inset-0 -z-10 rounded-2xl bg-brand-gradient opacity-0 blur-xl transition-opacity duration-500 group-focus-within:opacity-40"
              aria-hidden
            />
            <div className="flex items-center gap-2 rounded-2xl border border-gray-200 bg-white p-2 shadow-sm transition-all focus-within:border-transparent focus-within:shadow-brand focus-within:ring-2 focus-within:ring-fuchsia-300 dark:border-gray-800 dark:bg-gray-900 dark:focus-within:ring-fuchsia-700">
              <div className="pl-3 text-gray-400 dark:text-gray-500">
                <SearchIcon className="h-5 w-5" />
              </div>
              <input
                type="text"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder="Ask a question…"
                className="flex-1 bg-transparent px-1 py-2.5 text-base text-gray-900 placeholder-gray-400 outline-none dark:text-gray-100 dark:placeholder-gray-500"
                aria-label="Ask a question"
              />
              <button
                type="submit"
                disabled={!value.trim()}
                className="inline-flex items-center gap-1.5 rounded-xl bg-brand-gradient px-4 py-2.5 text-sm font-medium text-white shadow-brand transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none"
              >
                Search
                <ArrowRightIcon className="h-4 w-4" />
              </button>
            </div>
          </div>
        </form>

        {/* Direct entry into the chat interface for users who just
            want to land in a blank conversation without typing a
            query first. Sits between the search box and the example
            suggestions so it doesn't compete with the primary CTA. */}
        <div
          className="mx-auto mt-4 flex max-w-2xl items-center justify-center gap-2 animate-fade-up"
          style={{ animationDelay: '280ms' }}
        >
          <button
            type="button"
            onClick={() => navigate('/chat')}
            className="group inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-white/70 px-3 py-1.5 text-xs font-medium text-gray-700 transition-all hover:-translate-y-0.5 hover:border-fuchsia-300 hover:bg-fuchsia-50 hover:text-fuchsia-700 dark:border-gray-800 dark:bg-gray-900/70 dark:text-gray-300 dark:hover:border-fuchsia-700 dark:hover:bg-fuchsia-950/30 dark:hover:text-fuchsia-300"
          >
            <MessageSquareIcon className="h-3.5 w-3.5" />
            Open chat
            <ArrowRightIcon className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
          </button>
        </div>

        {/* Suggestions */}
        <div
          className="mx-auto mt-6 flex max-w-2xl flex-wrap items-center justify-center gap-2 animate-fade-up"
          style={{ animationDelay: '320ms' }}
        >
          <span className="text-xs uppercase tracking-wider text-gray-500 dark:text-gray-500">
            Try asking
          </span>
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => submit(s)}
              className="rounded-full border border-gray-200 bg-white/70 px-3 py-1.5 text-xs text-gray-700 transition-all hover:-translate-y-0.5 hover:border-fuchsia-300 hover:bg-fuchsia-50 hover:text-fuchsia-700 dark:border-gray-800 dark:bg-gray-900/70 dark:text-gray-300 dark:hover:border-fuchsia-700 dark:hover:bg-fuchsia-950/30 dark:hover:text-fuchsia-300"
            >
              {s}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
