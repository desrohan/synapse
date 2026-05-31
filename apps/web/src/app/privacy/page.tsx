import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy - Synapse",
  description: "Privacy Policy for Synapse",
};

export default function PrivacyPolicy() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="mb-8 text-3xl font-bold">Privacy Policy</h1>
      <p className="mb-4 text-sm text-muted-foreground">
        Last updated: May 31, 2026
      </p>

      <section className="space-y-6 text-sm leading-relaxed text-foreground/90">
        <div>
          <h2 className="mb-2 text-lg font-semibold">1. Introduction</h2>
          <p>
            Synapse (&quot;we&quot;, &quot;our&quot;, or &quot;us&quot;) is a
            personal AI assistant that connects to third-party services like
            Slack, Jira, and GitHub on your behalf. This Privacy Policy explains
            what data we collect, how we use it, and your rights regarding that
            data.
          </p>
        </div>

        <div>
          <h2 className="mb-2 text-lg font-semibold">
            2. Data We Collect
          </h2>
          <ul className="ml-4 list-disc space-y-1">
            <li>
              <strong>Account information:</strong> Your email address and
              authentication credentials via Supabase Auth.
            </li>
            <li>
              <strong>OAuth tokens:</strong> Access tokens and refresh tokens for
              connected integrations (Slack, Jira, GitHub). These are stored
              securely and used solely to access the services you authorize.
            </li>
            <li>
              <strong>Integration data:</strong> Messages, issues, pull
              requests, and other content retrieved from your connected services
              for the purpose of providing AI-powered summaries and insights.
            </li>
          </ul>
        </div>

        <div>
          <h2 className="mb-2 text-lg font-semibold">3. How We Use Your Data</h2>
          <p>We use your data exclusively to:</p>
          <ul className="ml-4 list-disc space-y-1">
            <li>Provide the core Synapse functionality — connecting to your tools and generating AI-powered insights.</li>
            <li>Maintain and improve the service.</li>
            <li>Authenticate your identity and manage your sessions.</li>
          </ul>
          <p className="mt-2">
            We do <strong>not</strong> sell, share, or distribute your personal
            data to third parties for advertising or marketing purposes.
          </p>
        </div>

        <div>
          <h2 className="mb-2 text-lg font-semibold">4. Third-Party Services</h2>
          <p>
            Synapse integrates with third-party services (Slack, Atlassian/Jira,
            GitHub). When you connect these services, data is exchanged between
            Synapse and those platforms according to their respective privacy
            policies. We encourage you to review:
          </p>
          <ul className="ml-4 list-disc space-y-1">
            <li>
              <a href="https://slack.com/privacy-policy" className="underline" target="_blank" rel="noopener noreferrer">
                Slack Privacy Policy
              </a>
            </li>
            <li>
              <a href="https://www.atlassian.com/legal/privacy-policy" className="underline" target="_blank" rel="noopener noreferrer">
                Atlassian Privacy Policy
              </a>
            </li>
            <li>
              <a href="https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement" className="underline" target="_blank" rel="noopener noreferrer">
                GitHub Privacy Statement
              </a>
            </li>
          </ul>
        </div>

        <div>
          <h2 className="mb-2 text-lg font-semibold">5. Data Storage & Security</h2>
          <p>
            Your data is stored in Supabase (PostgreSQL). OAuth tokens are
            stored server-side and are never exposed to the client. We use HTTPS
            for all communications in production.
          </p>
        </div>

        <div>
          <h2 className="mb-2 text-lg font-semibold">6. Data Retention</h2>
          <p>
            We retain your data for as long as your account is active. You may
            disconnect integrations at any time, which will delete the associated
            tokens. To request full account deletion, contact us using the
            information below.
          </p>
        </div>

        <div>
          <h2 className="mb-2 text-lg font-semibold">7. Your Rights</h2>
          <p>You have the right to:</p>
          <ul className="ml-4 list-disc space-y-1">
            <li>Access the personal data we hold about you.</li>
            <li>Request correction or deletion of your data.</li>
            <li>Disconnect any integration and revoke access at any time.</li>
            <li>Request a copy of your data in a portable format.</li>
          </ul>
        </div>

        <div>
          <h2 className="mb-2 text-lg font-semibold">8. Contact</h2>
          <p>
            If you have questions about this Privacy Policy, please contact us
            at{" "}
            <a href="mailto:rohan.shah.design@gmail.com" className="underline">
              rohan.shah.design@gmail.com
            </a>
            .
          </p>
        </div>
      </section>
    </main>
  );
}
