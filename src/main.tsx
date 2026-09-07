import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from 'react-router-dom';
import './styles/fonts';
import './styles/theme.css';
import { AuthProvider } from './auth/AuthProvider';
import { ToastProvider } from './components/Toasts';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ThemeProvider } from './components/ThemeToggle';
import { router } from './routes/router';
import { errorStatus } from './lib/problem';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      // A background refetch mid-presentation is a distraction.
      refetchOnWindowFocus: false,
      retry: (count, error) => {
        const status = errorStatus(error);
        if (status !== undefined && [400, 401, 403, 404, 409, 422].includes(status)) return false;
        return count < 2;
      },
    },
    mutations: { retry: false },
  },
});

async function bootstrap() {
  // MSW is the insurance policy: with VITE_USE_MSW=true the whole console is
  // presentable with the backend down.
  if (import.meta.env.VITE_USE_MSW === 'true') {
    const { worker } = await import('./mocks/browser');
    await worker.start({ onUnhandledRequest: 'bypass' });
  }

  const container = document.getElementById('root');
  if (!container) throw new Error('Root element missing.');

  createRoot(container).render(
    <StrictMode>
      <ErrorBoundary label="Application">
        <ThemeProvider>
          <QueryClientProvider client={queryClient}>
            <AuthProvider>
              <ToastProvider>
                <RouterProvider router={router} />
              </ToastProvider>
            </AuthProvider>
          </QueryClientProvider>
        </ThemeProvider>
      </ErrorBoundary>
    </StrictMode>,
  );
}

void bootstrap();
