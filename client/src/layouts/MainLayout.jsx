import React, { useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import Header from '../components/layout/Header'; 
import Footer from '../components/layout/Footer';
import { useAuthStore } from '../store/authStore';
import SEO from '../components/SEO';

export default function MainLayout() {
  const { token, syncProfile } = useAuthStore(); 

  useEffect(() => {
    if (token) {
      syncProfile();
    }
  }, [token, syncProfile]); 

  return (
    <div className="min-h-screen flex flex-col font-sans transition-colors duration-300 bg-background text-foreground">
      <SEO isApp={true} />
      
      <Header />
      
      <main className="flex-grow">
        <Outlet />
      </main>

      <Footer />

    </div>
  );
}
