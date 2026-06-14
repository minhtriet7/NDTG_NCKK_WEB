import React from 'react';

export default function PrivacyPolicy() {
  return (
    <div className="max-w-4xl mx-auto px-6 py-20 min-h-screen bg-background text-foreground">
      <h1 className="text-4xl font-black mb-8 text-primary">Privacy Policy</h1>
      <div className="prose prose-slate dark:prose-invert max-w-none text-foreground opacity-80 space-y-4">
        <p className="font-bold">Effective Date: January 1, 2026</p>
        <h2 className="text-2xl font-bold mt-8 mb-4 text-foreground">1. Introduction</h2>
        <p>Welcome to BanknoteAI Workspace. We are committed to protecting your privacy and ensuring you have a positive experience on our website and in using our products and services.</p>
        <h2 className="text-2xl font-bold mt-8 mb-4 text-foreground">2. Data Collection</h2>
        <p>We collect information you provide directly to us when you use our multi-agent recognition system, including images you upload for analysis.</p>
        <h2 className="text-2xl font-bold mt-8 mb-4 text-foreground">3. Data Usage</h2>
        <p>Your uploaded images are processed temporarily to perform banknote denomination and authenticity checks. We do not sell your personal data to third parties.</p>
        <h2 className="text-2xl font-bold mt-8 mb-4 text-foreground">4. Contact Us</h2>
        <p>If you have any questions about this Privacy Policy, please contact us at privacy@banknoteai.com.</p>
      </div>
    </div>
  );
}
