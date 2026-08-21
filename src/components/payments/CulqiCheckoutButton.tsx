"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import Script from "next/script";
import { CreditCard, LoaderCircle, LockKeyhole, ShieldCheck } from "lucide-react";
import type { CulqiAuthentication3DS, PublicPaymentConfig } from "@/lib/payments";

export type CulqiCheckoutSession = {
  amountMinor: number;
  expiresAt: string | null;
  orderCode: string;
  orderId: string;
};

export type CulqiTokenSubmission = "requires_3ds" | "submitted";

type CulqiToken = {
  id?: string;
};

type CulqiOrder = {
  id?: string;
  state?: string;
};

type CulqiCheckoutError = {
  merchant_message?: string;
  message?: string;
  user_message?: string;
};

type CulqiCheckoutInstance = {
  close: () => void;
  culqi?: () => void;
  error?: CulqiCheckoutError | null;
  open: () => void;
  order?: CulqiOrder | null;
  token?: CulqiToken | null;
};

type CulqiCheckoutConstructor = new (
  publicKey: string,
  config: Record<string, unknown>,
) => CulqiCheckoutInstance;

type Culqi3DSApi = {
  _publicKey?: string;
  generateDevice: () => Promise<string>;
  initAuthentication: (tokenId: string) => Promise<void>;
  options: {
    closeModalAction?: () => void;
    showIcon: boolean;
    showLoading: boolean;
    showModal: boolean;
  };
  publicKey: string;
  reset: () => void;
  settings: {
    card: { email: string };
    charge: {
      returnUrl: string;
      totalAmount: number;
    };
  };
};

type Culqi3DSMessage = {
  error?: unknown;
  parameters3DS?: CulqiAuthentication3DS;
};

declare global {
  interface Window {
    Culqi3DS?: Culqi3DSApi;
    CulqiCheckout?: CulqiCheckoutConstructor;
  }
}

type Props = {
  amount: number;
  config: PublicPaymentConfig;
  customerEmail: string;
  disabled?: boolean;
  locale: "en" | "es";
  onAlternativePayment: (session: CulqiCheckoutSession) => Promise<void>;
  onDemoComplete: () => Promise<void> | void;
  onError: (message: string) => void;
  onToken: (
    session: CulqiCheckoutSession,
    tokenId: string,
    security: {
      authentication3DS?: CulqiAuthentication3DS;
      deviceId?: string;
    },
  ) => Promise<CulqiTokenSubmission>;
  prepareCheckout: () => Promise<CulqiCheckoutSession>;
};

type CheckoutState = "idle" | "preparing" | "ready" | "charging" | "authenticating" | "confirming" | "error";
type DemoPaymentMethod = "card" | "mobile" | "wallet";

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

function is3DSMessage(value: unknown): value is Culqi3DSMessage {
  return typeof value === "object" && value !== null;
}

export function CulqiCheckoutButton({
  amount,
  config,
  customerEmail,
  disabled = false,
  locale,
  onAlternativePayment,
  onDemoComplete,
  onError,
  onToken,
  prepareCheckout,
}: Props) {
  const [checkoutScriptReady, setCheckoutScriptReady] = useState(false);
  const [threeDSScriptReady, setThreeDSScriptReady] = useState(false);
  const [state, setState] = useState<CheckoutState>("idle");
  const [demoPaymentMethod, setDemoPaymentMethod] = useState<DemoPaymentMethod>("card");
  const actionRunningRef = useRef(false);
  const checkoutRef = useRef<CulqiCheckoutInstance | null>(null);
  const deviceIdRef = useRef("");
  const initializedRef = useRef(false);
  const pending3DSRef = useRef<{
    deviceId: string;
    session: CulqiCheckoutSession;
    tokenId: string;
  } | null>(null);
  const copy = locale === "es"
    ? {
      authenticating: "Verificando tu banco con 3D Secure...",
      card: "Tarjeta",
      cardNumber: "Número de tarjeta",
      confirming: "Confirmando el pago con Culqi...",
      cvv: "CVV",
      demoError: "No pudimos completar el checkout. Inténtalo nuevamente.",
      demoStatus: "Checkout online listo para confirmar tu pedido",
      disabled: "Pagos online temporalmente no disponibles",
      disabledDetail: "Esta es la vista del checkout. El formulario se habilitará de forma segura dentro de Culqi.",
      email: "Correo electrónico",
      error: "No pudimos cargar el pago seguro. Inténtalo nuevamente.",
      expires: "MM / AA",
      loading: "Cargando checkout seguro...",
      more: "Más métodos",
      mobileCode: "Código de aprobación",
      mobilePhone: "Número de celular",
      pay: `Pagar S/${amount}`,
      preparing: "Preparando tu pedido...",
      retry: "Reintentar checkout seguro",
      secure: "Los datos de pago se ingresan y procesan únicamente en el entorno seguro de Culqi",
      checkoutTerms: "Delivery en la fecha programada. El repartidor espera hasta 10 minutos; la reentrega depende de disponibilidad y puede tener costo adicional. Bagelito no responde por datos incorrectos o ausencia del cliente.",
      checkoutTermsLink: "Leer las políticas legales completas.",
      terms: "Acepta los términos para habilitar el checkout seguro.",
      wallets: "Yape / QR",
      walletsMore: "Apple Pay / Google Pay",
    }
    : {
      authenticating: "Verifying your bank with 3D Secure...",
      card: "Card",
      cardNumber: "Card number",
      confirming: "Confirming payment with Culqi...",
      cvv: "CVV",
      demoError: "We could not complete checkout. Please try again.",
      demoStatus: "Online checkout ready to confirm your order",
      disabled: "Online payments are temporarily unavailable",
      disabledDetail: "This is the checkout preview. The form will be securely enabled inside Culqi.",
      email: "Email address",
      error: "We could not load secure payment. Please try again.",
      expires: "MM / YY",
      loading: "Loading secure checkout...",
      more: "More methods",
      mobileCode: "Approval code",
      mobilePhone: "Mobile number",
      pay: `Pay S/${amount}`,
      preparing: "Preparing your order...",
      retry: "Retry secure checkout",
      secure: "Payment data is entered and processed only in Culqi's secure environment",
      checkoutTerms: "Delivery is made on the scheduled date. The driver waits up to 10 minutes; re-delivery depends on availability and may cost extra. Bagelito is not responsible for incorrect details or customer absence.",
      checkoutTermsLink: "Read the full legal policies.",
      terms: "Accept the terms to enable secure checkout.",
      wallets: "Yape / QR",
      walletsMore: "Apple Pay / Google Pay",
    };

  const setCheckoutError = useCallback((error: unknown) => {
    actionRunningRef.current = false;
    initializedRef.current = false;
    setState("error");
    onError(errorMessage(error, copy.error));
  }, [copy.error, onError]);

  async function handleDemoSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (disabled || state === "confirming") return;

    onError("");
    setState("confirming");
    event.currentTarget.reset();

    try {
      await onDemoComplete();
    } catch (error) {
      setCheckoutError(new Error(errorMessage(error, copy.demoError)));
    }
  }

  const getDeviceId = useCallback(async () => {
    if (deviceIdRef.current) return deviceIdRef.current;
    if (!window.Culqi3DS || !threeDSScriptReady) {
      throw new Error(copy.error);
    }

    window.Culqi3DS.publicKey = config.publicKey;
    window.Culqi3DS.options = {
      closeModalAction: () => setCheckoutError(new Error(copy.error)),
      showIcon: true,
      showLoading: true,
      showModal: true,
    };
    const deviceId = await window.Culqi3DS.generateDevice();
    if (!deviceId) throw new Error(copy.error);
    deviceIdRef.current = deviceId;
    return deviceId;
  }, [config.publicKey, copy.error, setCheckoutError, threeDSScriptReady]);

  const initializeCheckout = useCallback(async () => {
    onError("");
    if (!config.enabled || !window.CulqiCheckout || initializedRef.current) return;

    initializedRef.current = true;
    setState("preparing");

    try {
      const session = await prepareCheckout();
      if (!Number.isInteger(session.amountMinor) || session.amountMinor < 100) {
        throw new Error("Invalid checkout amount.");
      }

      const checkout = new window.CulqiCheckout(config.publicKey, {
        appearance: {
          buttonCardPayText: locale === "es" ? `Pagar S/${amount}` : `Pay S/${amount}`,
          defaultStyle: {
            buttonBackground: "#ee4f93",
            buttonTextColor: "#ffffff",
            linksColor: "#5036d5",
            menuColor: "#5036d5",
            priceColor: "#2d1b69",
          },
          hiddenBanner: false,
          hiddenBannerContent: false,
          hiddenCulqiLogo: false,
          hiddenEmail: true,
          hiddenToolBarAmount: false,
          logo: "https://bagelito.pe/images/bagelito-logo.svg",
          menuType: "sidebar",
          theme: "default",
          variables: {
            borderRadius: "16px",
            colorBackground: "#fffaf4",
            colorPrimary: "#ee4f93",
            colorPrimaryText: "#2d1b69",
            colorText: "#111f48",
            colorTextPlaceholder: "#756c87",
            fontFamily: "Arial, sans-serif",
            fontWeightNormal: "500",
          },
        },
        client: { email: customerEmail.trim().toLowerCase() },
        options: {
          container: "#culqi-checkout-container",
          installments: true,
          lang: locale,
          modal: false,
          paymentMethods: {
            agente: true,
            bancaMovil: true,
            billetera: true,
            cuotealo: true,
            tarjeta: true,
            yape: true,
          },
          paymentMethodsSort: ["tarjeta", "yape", "billetera", "bancaMovil", "agente", "cuotealo"],
        },
        settings: {
          amount: session.amountMinor,
          currency: config.currency,
          order: session.orderId,
          rsapublickey: config.rsaPublicKey.replace(/\\n/g, "\n"),
          title: "Bagelito.pe",
          xculqirsaid: config.rsaId,
        },
      });
      checkoutRef.current = checkout;
      actionRunningRef.current = false;
      checkout.culqi = () => {
        if (actionRunningRef.current) return;
        actionRunningRef.current = true;

        void (async () => {
          try {
            if (checkout.token?.id) {
              checkout.close();
              setState("charging");
              const tokenId = checkout.token.id;
              const deviceId = tokenId.startsWith("tkn_") ? await getDeviceId() : "";
              const result = await onToken(session, tokenId, { deviceId: deviceId || undefined });

              if (result === "requires_3ds") {
                if (!window.Culqi3DS) throw new Error(copy.error);
                pending3DSRef.current = { deviceId, session, tokenId };
                setState("authenticating");
                window.Culqi3DS.settings = {
                  card: { email: customerEmail.trim().toLowerCase() },
                  charge: {
                    returnUrl: window.location.href,
                    totalAmount: session.amountMinor,
                  },
                };
                await window.Culqi3DS.initAuthentication(tokenId);
                return;
              }

              setState("confirming");
              window.Culqi3DS?.reset();
              return;
            }

            if (checkout.order?.id) {
              checkout.close();
              setState("confirming");
              await onAlternativePayment(session);
              return;
            }

            const checkoutError = checkout.error;
            throw new Error(
              checkoutError?.user_message
                ?? checkoutError?.merchant_message
                ?? checkoutError?.message
                ?? copy.error,
            );
          } catch (error) {
            setCheckoutError(error);
          }
        })();
      };

      setState("ready");
      checkout.open();
    } catch (error) {
      setCheckoutError(error);
    }
  }, [
    amount,
    config,
    copy.error,
    customerEmail,
    getDeviceId,
    locale,
    onAlternativePayment,
    onError,
    onToken,
    prepareCheckout,
    setCheckoutError,
  ]);

  useEffect(() => {
    if (
      config.enabled
      && !disabled
      && checkoutScriptReady
      && threeDSScriptReady
      && state === "idle"
      && !initializedRef.current
    ) {
      void initializeCheckout();
    }
  }, [checkoutScriptReady, config.enabled, disabled, initializeCheckout, state, threeDSScriptReady]);

  useEffect(() => {
    function handle3DSMessage(event: MessageEvent) {
      if (event.origin !== window.location.origin || !is3DSMessage(event.data)) return;
      const pending = pending3DSRef.current;
      if (!pending) return;

      if (event.data.error) {
        window.Culqi3DS?.reset();
        pending3DSRef.current = null;
        setCheckoutError(event.data.error);
        return;
      }

      if (event.data.parameters3DS) {
        const authentication3DS = event.data.parameters3DS;
        pending3DSRef.current = null;
        setState("charging");
        void onToken(pending.session, pending.tokenId, {
          authentication3DS,
          deviceId: pending.deviceId,
        })
          .then(() => {
            setState("confirming");
            window.Culqi3DS?.reset();
          })
          .catch(setCheckoutError);
      }
    }

    window.addEventListener("message", handle3DSMessage);
    return () => window.removeEventListener("message", handle3DSMessage);
  }, [onToken, setCheckoutError]);

  const busyLabel = state === "preparing"
    ? copy.preparing
    : state === "charging"
      ? copy.loading
      : state === "authenticating"
        ? copy.authenticating
        : state === "confirming"
          ? copy.confirming
          : copy.loading;
  const showDemo = !config.enabled;
  const showLockedPreview = config.enabled && disabled;
  const showBusy = config.enabled && !disabled && state !== "ready" && state !== "error";

  return (
    <div className="culqi-checkout-panel">
      {config.enabled ? (
        <>
          <Script
            id="culqi-custom-checkout"
            src="https://js.culqi.com/checkout-js"
            strategy="afterInteractive"
            onLoad={() => setCheckoutScriptReady(true)}
            onReady={() => setCheckoutScriptReady(true)}
            onError={() => setCheckoutError(new Error(copy.error))}
          />
          <Script
            id="culqi-3ds"
            src="https://3ds.culqi.com"
            strategy="afterInteractive"
            onLoad={() => setThreeDSScriptReady(true)}
            onReady={() => setThreeDSScriptReady(true)}
            onError={() => setCheckoutError(new Error(copy.error))}
          />
        </>
      ) : null}

      <div className="culqi-checkout-heading">
        <strong>{locale === "es" ? "Checkout seguro" : "Secure checkout"}</strong>
        <div className="culqi-checkout-lock"><LockKeyhole size={16} /> SSL</div>
      </div>

      {showDemo ? (
        <form className="culqi-preview culqi-preview-form" onSubmit={handleDemoSubmit}>
          <div className="culqi-preview-tabs" role="tablist" aria-label={locale === "es" ? "Método de pago" : "Payment method"}>
            <button className={demoPaymentMethod === "card" ? "active" : ""} type="button" role="tab" aria-selected={demoPaymentMethod === "card"} onClick={() => setDemoPaymentMethod("card")}>
              <CreditCard size={16} /> {copy.card}
            </button>
            <button className={demoPaymentMethod === "mobile" ? "active" : ""} type="button" role="tab" aria-selected={demoPaymentMethod === "mobile"} onClick={() => setDemoPaymentMethod("mobile")}>
              {copy.wallets}
            </button>
            <button className={demoPaymentMethod === "wallet" ? "active" : ""} type="button" role="tab" aria-selected={demoPaymentMethod === "wallet"} onClick={() => setDemoPaymentMethod("wallet")}>
              {copy.walletsMore}
            </button>
          </div>

          <fieldset className="culqi-demo-fieldset" disabled={disabled || state === "confirming"}>
            {demoPaymentMethod === "card" ? (
              <>
                <label className="culqi-preview-field wide">
                  <span>{copy.cardNumber}</span>
                  <input autoComplete="off" inputMode="numeric" name="demo-card-number" pattern="[0-9 ]{13,23}" placeholder="0000 0000 0000 0000" required />
                  <small>VISA &nbsp; MC &nbsp; AMEX &nbsp; DINERS</small>
                </label>
                <div className="culqi-preview-fields">
                  <label className="culqi-preview-field">
                    <span>{copy.expires}</span>
                    <input autoComplete="off" inputMode="numeric" name="demo-expiry" pattern="(0[1-9]|1[0-2])/[0-9]{2}" placeholder="MM/AA" required />
                  </label>
                  <label className="culqi-preview-field">
                    <span>{copy.cvv}</span>
                    <input autoComplete="off" inputMode="numeric" name="demo-cvv" pattern="[0-9]{3,4}" placeholder="000" required />
                  </label>
                </div>
              </>
            ) : demoPaymentMethod === "mobile" ? (
              <div className="culqi-preview-fields">
                <label className="culqi-preview-field">
                  <span>{copy.mobilePhone}</span>
                  <input autoComplete="off" inputMode="tel" name="demo-mobile" pattern="[0-9 +]{9,16}" placeholder="999 999 999" required />
                </label>
                <label className="culqi-preview-field">
                  <span>{copy.mobileCode}</span>
                  <input autoComplete="off" inputMode="numeric" name="demo-approval-code" pattern="[0-9]{6}" placeholder="000000" required />
                </label>
              </div>
            ) : (
              <div className="culqi-demo-options" role="radiogroup" aria-label={copy.walletsMore}>
                {["Apple Pay", "Google Pay", "PagoEfectivo", "Cuotéalo BCP"].map((method, index) => (
                  <label className="culqi-demo-option" key={method}>
                    <input defaultChecked={index === 0} name="demo-wallet" type="radio" value={method} />
                    <span>{method}</span>
                  </label>
                ))}
              </div>
            )}

            <label className="culqi-preview-field wide">
              <span>{copy.email}</span>
              <input autoComplete="off" defaultValue={customerEmail} name="demo-email" placeholder="nombre@email.com" required type="email" />
            </label>
            <p className="culqi-checkout-terms-note">{copy.checkoutTerms} <a href="/legal" target="_blank" rel="noreferrer">{copy.checkoutTermsLink}</a></p>
            <button className="culqi-preview-pay" type="submit">
              {state === "confirming" ? copy.confirming : copy.pay}
            </button>
          </fieldset>

          <div className="culqi-availability-note" role="status">
            <strong>{disabled ? copy.terms : copy.demoStatus}</strong>
            {disabled ? <span>{copy.terms}</span> : null}
          </div>
        </form>
      ) : showLockedPreview ? (
        <div className="culqi-preview" aria-disabled="true">
          <div className="culqi-preview-tabs" aria-hidden="true">
            <span className="active"><CreditCard size={16} /> {copy.card}</span>
            <span>{copy.wallets}</span>
            <span>{copy.more}</span>
          </div>
          <div className="culqi-preview-field wide">
            <span>{copy.cardNumber}</span>
            <strong>•••• &nbsp;•••• &nbsp;•••• &nbsp;••••</strong>
            <small>VISA &nbsp; MC &nbsp; AMEX &nbsp; DINERS</small>
          </div>
          <div className="culqi-preview-fields">
            <div className="culqi-preview-field"><span>{copy.expires}</span><strong>•• / ••</strong></div>
            <div className="culqi-preview-field"><span>{copy.cvv}</span><strong>•••</strong></div>
          </div>
          <div className="culqi-preview-field wide">
            <span>{copy.email}</span>
            <strong>{customerEmail || "nombre@email.com"}</strong>
          </div>
          <p className="culqi-checkout-terms-note">{copy.checkoutTerms} <a href="/legal" target="_blank" rel="noreferrer">{copy.checkoutTermsLink}</a></p>
          <button className="culqi-preview-pay" type="button" disabled>{copy.pay}</button>
          <div className="culqi-availability-note" role="status"><strong>{copy.terms}</strong><span>{copy.secure}</span></div>
        </div>
      ) : (
        <div className="culqi-embed-shell">
          {showBusy ? (
            <div className="culqi-busy" role="status">
              <LoaderCircle className="spin" size={21} />
              <span>{busyLabel}</span>
            </div>
          ) : null}
          {state === "error" ? (
            <div className="culqi-busy" role="alert">
              <button
                className="pill-button pink culqi-retry-button"
                type="button"
                disabled={!checkoutScriptReady || !threeDSScriptReady}
                onClick={() => void initializeCheckout()}
              >
                {copy.retry}
              </button>
            </div>
          ) : null}
          <div id="culqi-checkout-container" className="culqi-embed" aria-live="polite" />
        </div>
      )}

      {!showDemo ? (
        <p className="culqi-security-note">
          <ShieldCheck size={16} />
          {copy.secure}
        </p>
      ) : null}
    </div>
  );
}
