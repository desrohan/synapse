import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Service - Synapse",
  description: "Terms of Service for Synapse",
};

export default function TermsOfService() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="mb-8 text-3xl font-bold">Terms of Service</h1>
      <p className="mb-4 text-sm text-muted-foreground">
        Last updated: May 31, 2026
      </p>

      <section className="space-y-6 text-sm leading-relaxed text-foreground/90">
        <div>
          <h2 className="mb-2 text-lg font-semibold">1. Acceptance of Terms</h2>
          <p>
            By accessing or using Synapse (&quot;the Service&quot;), you agree
            to be bound by these Terms of Service. If you do not agree, do not
            use the Service.
          </p>
        </div>

        <div>
          <h2 className="mb-2 text-lg font-semibold">2. Description of Service</h2>
          <p>
            Synapse is a personal AI assistant that connects to third-party
            productivity tools (Slack, Jira, GitHub) to provide AI-powered
            summaries, insights, and workflow assistance.
          </p>
        </div>

        <div>
          <h2 className="mb-2 text-lg font-semibold">3. User Accounts</h2>
          <p>
            You must create an account to use Synapse. You are responsible for
            maintaining the security of your account credentials. You agree to
            notify us immediately of any unauthorized use.
          </p>
        </div>

        <div>
          <h2 className="mb-2 text-lg font-semibold">4. Third-Party Integrations</h2>
          <p>
            When you connect third-party services, you authorize Synapse to
            access data from those services on your behalf. You must have the
            necessary permissions to grant this access. You can revoke access at
            any time by disconnecting the integration.
          </p>
        </div>

        <div>
          <h2 className="mb-2 text-lg font-semibold">5. Acceptable Use</h2>
          <p>You agree not to:</p>
          <ul className="ml-4 list-disc space-y-1">
            <li>Use the Service for any unlawful purpose.</li>
            <li>Attempt to reverse-engineer or compromise the Service.</li>
            <li>Share access tokens or credentials obtained through the Service.</li>
            <li>Use the Service in a way that could damage or overburden the infrastructure.</li>
          </ul>
        </div>

        <div>
          <h2 className="mb-2 text-lg font-semibold">6. Data & Privacy</h2>
          <p>
            Your use of the Service is also governed by our{" "}
            <a href="/privacy" className="underline">
              Privacy Policy
            </a>
            . By using Synapse, you consent to the collection and use of data as
            described therein.
          </p>
        </div>

        <div>
          <h2 className="mb-2 text-lg font-semibold">7. Disclaimer of Warranties</h2>
          <p>
            The Service is provided &quot;as is&quot; without warranties of any
            kind, either express or implied. We do not guarantee uninterrupted or
            error-free operation.
          </p>
        </div>

        <div>
          <h2 className="mb-2 text-lg font-semibold">8. Limitation of Liability</h2>
          <p>
            To the maximum extent permitted by law, Synapse shall not be liable
            for any indirect, incidental, or consequential damages arising from
            your use of the Service.
          </p>
        </div>

        <div>
          <h2 className="mb-2 text-lg font-semibold">9. Termination</h2>
          <p>
            We may suspend or terminate your access to the Service at any time,
            with or without cause. Upon termination, your right to use the
            Service ceases immediately.
          </p>
        </div>

        <div>
          <h2 className="mb-2 text-lg font-semibold">10. Contact</h2>
          <p>
            For questions about these Terms, contact us at{" "}
            <a href="mailto:rohan@shahrohan.me" className="underline">
              rohan@shahrohan.me
            </a>
            .
          </p>
        </div>
      </section>
    </main>
  );
}
