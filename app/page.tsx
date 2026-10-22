import { IntakeStepper } from "@/components/IntakeStepper";
import { officeInfo, PRODUCT_NAME } from "@/lib/office-info";

export default function IntakePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-4 pb-6 pt-10">
      <header className="slide-up mb-8 text-center">
        <div className="mb-3 inline-flex items-center gap-2.5">
          <div className="brand-mark h-10 w-10 text-xl" aria-hidden="true">
            &#9877;
          </div>
          <span className="brand-text text-[22px] font-bold">{officeInfo.name}</span>
        </div>
        <h1 className="mb-2 text-[28px] font-bold leading-snug text-white">{PRODUCT_NAME}</h1>
        <p className="text-[15px] text-white/60">Tell us about yourself and we will connect you with the right care</p>
      </header>

      <div className="glass-card slide-up w-full max-w-[480px] p-8">
        <IntakeStepper />
      </div>

      <div className="mt-6 w-full max-w-[480px]">
        <p className="safety-disclaimer">
          Not for medical emergencies. Does not provide medical advice.
          <br />
          If you are experiencing a medical emergency, call <strong className="text-white/70">911</strong> immediately.
        </p>
      </div>
    </main>
  );
}
