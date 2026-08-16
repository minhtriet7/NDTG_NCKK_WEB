import { BrowserRouter } from 'react-router-dom';
import AppRoutes from './routes/AppRoutes';
import AppPreferencesSync from './components/common/AppPreferencesSync';

export default function App() {
  return (
    <div className="font-sans antialiased">
      <AppPreferencesSync />
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </div>
  );
}
