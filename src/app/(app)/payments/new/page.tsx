import { NewPaymentForm } from "@/components/payments/new-payment-form";
import { AppHeader } from "@/components/app-header";

export default function NewPaymentPage() {
  return (
    <>
      <AppHeader title="납부 기록 추가" />
      <main className="flex flex-1 flex-col gap-4 p-4 lg:gap-6 lg:p-6">
        <NewPaymentForm />
      </main>
    </>
  );
}
