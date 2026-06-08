import { useRoutes } from 'react-router-dom';
import { routes } from './routes/index.js';
import { Toaster } from '@/components/ui/toaster';

function App() {
  const element = useRoutes(routes);
  return (
    <>
      {element}
      <Toaster />
    </>
  );
}

export default App;
