"use client";

import { useEffect, useState } from "react";
import { initMercadoPago, Payment } from "@mercadopago/sdk-react";
import { submitCardPaymentAction, type BillingActionState } from "@/modules/billing/actions";

type Props = {
  invoiceId: string;
  amountCents: number;
  payerEmail?: string;
};

const initialState: BillingActionState = {};

export function MercadoPagoCheckout({ invoiceId, amountCents, payerEmail }: Props) {
  const email = payerEmail || "cliente@padaria.com";
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const publicKey = process.env.NEXT_PUBLIC_MP_PUBLIC_KEY;

  useEffect(() => {
    if (publicKey) initMercadoPago(publicKey, { locale: "pt-BR" });
  }, [publicKey]);

  if (!publicKey) {
    return (
      <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
        Configure NEXT_PUBLIC_MP_PUBLIC_KEY para habilitar o pagamento com cartão.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {error ? (
        <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
          {error}
        </p>
      ) : null}
      {message ? (
        <p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">
          {message}
        </p>
      ) : null}
      <Payment
        initialization={{ amount: amountCents / 100, payer: { email } }}
        customization={{ paymentMethods: { creditCard: "all" } }}
        onSubmit={async (formData: any) => {
          setError(null);
          setMessage(null);
          const data = new FormData();
          data.set("invoiceId", invoiceId);
          data.set("token", formData?.token ?? "");
          data.set("installments", String(formData?.installments ?? 1));
          data.set("paymentMethodId", formData?.payment_method_id ?? "");
          data.set("issuerId", formData?.issuer_id ?? "");
          data.set("payerEmail", formData?.payer?.email ?? email);
          data.set("payerDocument", formData?.payer?.identification?.number ?? "");

          const result = await submitCardPaymentAction(initialState, data);
          if (result.error) {
            setError(result.error);
            throw new Error(result.error);
          }
          if (result.success) setMessage(result.success);
        }}
      />
    </div>
  );
}