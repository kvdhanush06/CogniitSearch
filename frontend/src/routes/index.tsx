import { type RouteObject } from 'react-router-dom';
import { ChatPage, HomePage, LoginPage, ConversationDetailPage } from '@/pages';
import { ProtectedRoute } from './ProtectedRoute';

function NotFoundPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="text-center">
        <h1 className="mb-2 text-4xl font-bold">404</h1>
        <p className="text-muted-foreground">That page doesn&rsquo;t exist.</p>
        <a href="/" className="mt-4 inline-block text-sm text-primary hover:underline">
          Go home
        </a>
      </div>
    </div>
  );
}

export const routes: RouteObject[] = [
  { path: '/', element: <HomePage /> },
  { path: '/login', element: <LoginPage /> },
  {
    path: '/chat',
    element: (
      <ProtectedRoute>
        <ChatPage />
      </ProtectedRoute>
    ),
  },
  {
    path: '/chat/:id',
    element: (
      <ProtectedRoute>
        <ConversationDetailPage />
      </ProtectedRoute>
    ),
  },
  { path: '*', element: <NotFoundPage /> },
];
