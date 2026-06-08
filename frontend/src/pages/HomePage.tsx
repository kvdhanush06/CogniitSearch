import { Header, Footer } from '@/components/layout';
import {
  Hero,
  Features,
  HowItWorks,
  SampleAnswer,
} from '@/components/landing';

export function HomePage() {
  return (
    <div className="flex min-h-screen flex-col bg-white text-gray-900 dark:bg-gray-950 dark:text-gray-50">
      <Header />
      <main className="flex-1">
        <Hero />
        <Features />
        <HowItWorks />
        <SampleAnswer />
      </main>
      <Footer />
    </div>
  );
}
