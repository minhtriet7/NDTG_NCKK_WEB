import { useEffect } from 'react';
import { BrowserRouter } from 'react-router-dom';
import AppRoutes from './routes/AppRoutes';
import { useAppStore } from './store/appStore';

export default function App() {
  const initTheme = useAppStore((state) => state.initTheme);

  useEffect(() => {
    initTheme();
  }, [initTheme]);

  return (
    <div className="font-sans antialiased">
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </div>
  );
}
