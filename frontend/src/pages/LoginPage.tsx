import { useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/hooks';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { LogoMark, SparklesIcon } from '@/components/icons';
import { useToast } from '@/hooks/use-toast';

export function LoginPage() {
  const { user, isLoading, signInWithGoogle } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { toast } = useToast();

  // Bounce already-signed-in users to /chat.
  useEffect(() => {
    if (user && !isLoading) {
      const next = searchParams.get('next') ?? '/chat';
      navigate(next, { replace: true });
    }
  }, [user, isLoading, navigate, searchParams]);

  // Surface OAuth-callback error flags (?auth_error=exchange_failed).
  useEffect(() => {
    const err = searchParams.get('auth_error');
    if (err) {
      toast({
        title: 'Sign-in failed',
        description: err === 'exchange_failed'
          ? 'We could not complete the Google sign-in. Please try again.'
          : 'Something went wrong during sign-in.',
        variant: 'destructive',
      });
    }
  }, [searchParams, toast]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background p-4">
      <Link
        to="/"
        className="mb-6 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <LogoMark className="h-6 w-6" />
        CogniitSearch
      </Link>
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 inline-flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-pink-500 text-white">
            <SparklesIcon className="h-5 w-5" />
          </div>
          <CardTitle>Sign in to CogniitSearch</CardTitle>
          <CardDescription>
            Save your conversations, revisit past searches, and pick up where you left off.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button
            className="w-full gap-2"
            disabled={isLoading}
            onClick={() => void signInWithGoogle()}
          >
            {isLoading ? 'Redirecting…' : 'Continue with Google'}
          </Button>
          <p className="text-center text-xs text-muted-foreground">
            We only access your name, email, and profile photo.
            See the backend&rsquo;s Supabase project for data handling.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
