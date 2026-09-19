import { LogoMark } from '@/components/icons';

export function Footer() {
  return (
    <footer className="border-t border-gray-200 bg-white/60 py-10 dark:border-gray-800 dark:bg-gray-950/60">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 sm:flex-row sm:px-6 lg:px-8">
        <div className="flex flex-col items-center gap-1.5 sm:items-start">
          <div className="flex items-center gap-2.5">
            <LogoMark className="h-6 w-6" />
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">CogniitSearch</span>
            <span className="text-sm text-gray-400 dark:text-gray-600">· AI search &amp; answers with sources</span>
          </div>
          <span className="text-xs text-gray-500 dark:text-gray-400">
            Created and maintained by <a className="underline underline-offset-2" href="https://allkvd.dev/">Venkata Dhanush Kakarlamudi</a> · <a className="underline underline-offset-2" href="https://portfolio.allkvd.dev/">Portfolio</a>
          </span>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-4 text-sm text-gray-500 dark:text-gray-400">
          <a href="https://github.com/kvdhanush06/CogniitSearch" className="transition-colors hover:text-gray-900 dark:hover:text-gray-100">GitHub</a>
          <a href="https://allkvd.dev/" className="transition-colors hover:text-gray-900 dark:hover:text-gray-100">AllKVD</a>
          <span className="text-gray-300 dark:text-gray-700">·</span>
          <span>© 2026 CogniitSearch</span>
        </div>
      </div>
    </footer>
  );
}
