import { LogoMark } from '@/components/icons';

export function Footer() {
  return (
    <footer className="border-t border-gray-200 bg-white/60 py-10 dark:border-gray-800 dark:bg-gray-950/60">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 sm:flex-row sm:px-6 lg:px-8">
        <div className="flex items-center gap-2.5">
          <LogoMark className="h-6 w-6" />
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
            CogniitSearch
          </span>
          <span className="text-sm text-gray-400 dark:text-gray-600">
            · AI answers with sources
          </span>
        </div>

        <div className="flex items-center gap-5 text-sm text-gray-500 dark:text-gray-400">
          {/* <a
            href="#"
            className="inline-flex items-center gap-1.5 transition-colors hover:text-gray-900 dark:hover:text-gray-100"
            aria-label="GitHub repository (placeholder)"
          >
            <GithubIcon className="h-4 w-4" />
            GitHub
          </a> */}
          <span className="text-gray-300 dark:text-gray-700">·</span>
          <span>© 2026 CogniitSearch</span>
        </div>
      </div>
    </footer>
  );
}
