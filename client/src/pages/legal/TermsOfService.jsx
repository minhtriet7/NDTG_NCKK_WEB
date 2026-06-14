import React from 'react';

export default function TermsOfService() {
  return (
    <div className="max-w-4xl mx-auto px-6 py-20 min-h-screen bg-background text-foreground">
      <h1 className="text-4xl font-black mb-8 text-primary">Terms of Service</h1>
      <div className="prose prose-slate dark:prose-invert max-w-none text-foreground opacity-80 space-y-4">
        <p className="font-bold">Effective Date: January 1, 2026</p>
        <h2 className="text-2xl font-bold mt-8 mb-4 text-foreground">1. Acceptance of Terms</h2>
        <p>By accessing and using BanknoteAI Workspace, you agree to be bound by these Terms of Service. If you do not agree with any part of these terms, you may not use our service.</p>
        <h2 className="text-2xl font-bold mt-8 mb-4 text-foreground">2. Service Usage & Tokens</h2>
        <p>You agree to use our tokens responsibly and not abuse the API. Each banknote scan consumes a specific amount of tokens as described on our pricing page.</p>
        <h2 className="text-2xl font-bold mt-8 mb-4 text-foreground">3. Liability</h2>
        <p>Our analysis results, driven by Machine Learning and Large Language Models, are provided as-is. We do not guarantee 100% accuracy and are not liable for any financial decisions made based on our aggregator outputs.</p>
      </div>
    </div>
  );
}
