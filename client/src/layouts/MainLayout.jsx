import React, { useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import Header from '../components/layout/Header'; 
import Footer from '../components/layout/Footer';
import { useAppStore } from '../store/appStore';
import { useAuthStore } from '../store/authStore';

export default function MainLayout() {
  const { initTheme } = useAppStore();
  const { token, syncProfile } = useAuthStore(); 

  useEffect(() => {
    initTheme();
  }, [initTheme]);

  useEffect(() => {
    if (token) {
      syncProfile();
    }
  }, [token, syncProfile]); 

  return (
    <div className="min-h-screen flex flex-col font-sans transition-colors duration-300 bg-background text-foreground">
      
      <Header />
      
      <main className="flex-grow">
        <Outlet />
      </main>

      <Footer />

    </div>
  );
}