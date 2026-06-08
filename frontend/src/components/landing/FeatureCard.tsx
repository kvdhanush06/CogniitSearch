import type { ReactNode } from 'react';

interface FeatureCardProps {
  icon: ReactNode;
  title: string;
  description: string;
  className?: string;
}

export function FeatureCard({ icon, title, description, className = '' }: FeatureCardProps) {
  return (
    <div
      className={[
        'group relative flex flex-col gap-4 rounded-2xl border border-gray-200 bg-white p-6 transition-all duration-300',
        'hover:-translate-y-1 hover:border-gray-300 hover:shadow-lg',
        'dark:border-gray-800 dark:bg-gray-900/60 dark:hover:border-gray-700 dark:hover:shadow-brand',
        className,
      ].join(' ')}
    >
      {/* Icon container with gradient background */}
      <div className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-brand-gradient text-white shadow-brand">
        {icon}
      </div>

      <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-50">
        {title}
      </h3>
      <p className="text-sm leading-relaxed text-gray-600 dark:text-gray-400">
        {description}
      </p>

      {/* Subtle gradient overlay on hover */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-2xl bg-gradient-to-br from-indigo-500/0 via-fuchsia-500/0 to-pink-500/0 opacity-0 transition-opacity duration-500 group-hover:opacity-[0.04]"
      />
    </div>
  );
}
