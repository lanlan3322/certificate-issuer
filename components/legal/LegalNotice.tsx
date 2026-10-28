import Link from "next/link";

export default function LegalNotice({ accountCreation = false }: { accountCreation?: boolean }) {
  const links = (
    <>
      <Link href="/terms" className="underline underline-offset-4 focus-visible:outline focus-visible:outline-2">Terms of Service</Link>
      {accountCreation ? " and " : " | "}
      <Link href="/privacy" className="underline underline-offset-4 focus-visible:outline focus-visible:outline-2">Privacy Policy</Link>
    </>
  );
  return <div className="mt-4 text-center text-xs leading-6 text-slate-600 dark:text-slate-300">
    <p>{accountCreation ? <>By creating an account, you agree to our {links}.</> : links}</p>
    {accountCreation && <p className="mt-2">Account terms do not constitute blanket consent to unrelated use of personal data. Optional analytics is a separate choice in Cookie Preferences.</p>}
  </div>;
}
