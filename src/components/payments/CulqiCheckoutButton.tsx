"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Script from "next/script";
import { CreditCard, LoaderCircle, LockKeyhole, ShieldCheck } from "lucide-react";
import type { CulqiAuthentication3DS, PublicPaymentConfig } from "@/lib/payments";

export type CulqiCheckoutSession = {
  amountMinor: number;
  checkoutSessionId: string;
  expiresAt: string | null;
  orderCode: string;
  sessionId: string;
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
  onError: (message: string) => void;
  onPaymentUnresolved?: () => void;
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

type CheckoutState = "idle" | "preparing" | "ready" | "charging" | "authenticating" | "confirming" | "error" | "review" | "expired";

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
  onError,
  onPaymentUnresolved,
  onToken,
  prepareCheckout,
}: Props) {
  const [checkoutScriptReady, setCheckoutScriptReady] = useState(false);
  const [threeDSScriptReady, setThreeDSScriptReady] = useState(false);
  const [state, setState] = useState<CheckoutState>("idle");
  const actionRunningRef = useRef(false);
  const checkoutRef = useRef<CulqiCheckoutInstance | null>(null);
  const deviceIdRef = useRef("");
  const initializedRef = useRef(false);
  const paymentAttemptStartedRef = useRef(false);
  const reviewRequiredRef = useRef(false);
  const reservationExpiredRef = useRef(false);
  const reservationExpiresAtRef = useRef<number | null>(null);
  const reservationTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const lifecycleRef = useRef({ alive: true, generation: 0 });
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
      reservationExpired: "Tu reserva venció. El formulario de pago está cerrado; los cupos ya no están garantizados.",
      restartReservation: "Iniciar otra reserva",
      review: "El resultado del pago necesita revisión. No vuelvas a pagar; consulta el estado de tu pedido.",
      secure: "Los datos de pago se ingresan y procesan únicamente en el entorno seguro de Culqi",
      checkoutTerms: "Delivery en la fecha programada. El repartidor espera hasta 10 minutos; la reentrega depende de disponibilidad y puede tener costo adicional. Bagelito no responde por datos incorrectos o ausencia del cliente.",
      checkoutTermsLink: "Leer las políticas legales completas.",
      terms: "Acepta los términos para habilitar el checkout seguro.",
      wallets: "Yape",
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
      reservationExpired: "Your reservation expired. The payment form is closed; availability is no longer guaranteed.",
      restartReservation: "Start a new reservation",
      review: "The payment result needs review. Do not pay again; check your order status.",
      secure: "Payment data is entered and processed only in Culqi's secure environment",
      checkoutTerms: "Delivery is made on the scheduled date. The driver waits up to 10 minutes; re-delivery depends on availability and may cost extra. Bagelito is not responsible for incorrect details or customer absence.",
      checkoutTermsLink: "Read the full legal policies.",
      terms: "Accept the terms to enable secure checkout.",
      wallets: "Yape",
      walletsMore: "Apple Pay / Google Pay",
    };

  const clearReservationTimer = useCallback(() => {
    clearTimeout(reservationTimerRef.current);
    reservationTimerRef.current = undefined;
  }, []);

  const expireReservation = useCallback(() => {
    if (!lifecycleRef.current.alive || reservationExpiredRef.current) return;
    reservationExpiredRef.current = true;
    lifecycleRef.current.generation += 1;
    actionRunningRef.current = true;
    pending3DSRef.current = null;
    clearReservationTimer();
    const checkout = checkoutRef.current;
    if (checkout) {
      checkout.culqi = undefined;
      try { checkout.close(); } catch { /* The removed embed stays unavailable. */ }
    }
    try { window.Culqi3DS?.reset(); } catch { /* A pending payment still needs review. */ }
    if (paymentAttemptStartedRef.current || reviewRequiredRef.current) {
      reviewRequiredRef.current = true;
      setState("review");
      onError(copy.review);
      onPaymentUnresolved?.();
    } else {
      setState("expired");
      onError("");
    }
  }, [clearReservationTimer, copy.review, onError, onPaymentUnresolved]);

  const checkReservationExpiry = useCallback(() => {
    if (reservationExpiredRef.current) return true;
    if (reservationExpiresAtRef.current !== null && Date.now() >= reservationExpiresAtRef.current) {
      expireReservation();
      return true;
    }
    return false;
  }, [expireReservation]);

  const setCheckoutError = useCallback((error: unknown) => {
    if (!lifecycleRef.current.alive || reservationExpiredRef.current) return;
    if (paymentAttemptStartedRef.current || (error instanceof Error && error.name === "CheckoutReviewError")) {
      clearReservationTimer();
      reviewRequiredRef.current = true;
      actionRunningRef.current = true;
      pending3DSRef.current = null;
      try { checkoutRef.current?.close(); } catch { /* Keep the payment locked. */ }
      setState("review");
      onError(copy.review);
      onPaymentUnresolved?.();
      return;
    }
    actionRunningRef.current = false;
    initializedRef.current = false;
    setState("error");
    onError(errorMessage(error, copy.error));
  }, [clearReservationTimer, copy.error, copy.review, onError, onPaymentUnresolved]);

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
    if (reviewRequiredRef.current || !lifecycleRef.current.alive || checkReservationExpiry()) return;
    onError("");
    if (!config.enabled || !window.CulqiCheckout || initializedRef.current) return;

    initializedRef.current = true;
    const generation = ++lifecycleRef.current.generation;
    const isCurrent = () => lifecycleRef.current.alive && lifecycleRef.current.generation === generation
      && !reviewRequiredRef.current && !reservationExpiredRef.current;
    setState("preparing");

    try {
      const session = await prepareCheckout();
      if (!isCurrent()) return;
      if (!Number.isInteger(session.amountMinor) || session.amountMinor < 100) {
        throw new Error("Invalid checkout amount.");
      }
      const expiresAt = typeof session.expiresAt === "string" ? Date.parse(session.expiresAt) : NaN;
      if (!Number.isFinite(expiresAt)) throw new Error(copy.error);
      reservationExpiresAtRef.current = expiresAt;
      if (checkReservationExpiry()) return;
      clearReservationTimer();
      const watchExpiry = () => {
        reservationTimerRef.current = undefined;
        if (!isCurrent() || checkReservationExpiry()) return;
        reservationTimerRef.current = setTimeout(watchExpiry, Math.min(expiresAt - Date.now(), 2_147_483_647));
      };

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
            agente: false,
            bancaMovil: false,
            billetera: false,
            cuotealo: false,
            tarjeta: true,
            yape: session.amountMinor <= 200000,
          },
          paymentMethodsSort: ["yape", "tarjeta"],
        },
        settings: {
          amount: session.amountMinor,
          currency: config.currency,
          rsapublickey: config.rsaPublicKey.replace(/\\n/g, "\n"),
          title: "Bagelito.pe",
          xculqirsaid: config.rsaId,
        },
      });
      checkoutRef.current = checkout;
      actionRunningRef.current = false;
      checkout.culqi = () => {
        if (checkReservationExpiry() || !isCurrent() || actionRunningRef.current || reviewRequiredRef.current) return;
        actionRunningRef.current = true;

        void (async () => {
          try {
            if (checkout.token?.id) {
              checkout.close();
              setState("charging");
              const tokenId = checkout.token.id;
              const deviceId = tokenId.startsWith("tkn_") ? await getDeviceId() : "";
              if (checkReservationExpiry() || !isCurrent() || reviewRequiredRef.current) return;
              paymentAttemptStartedRef.current = true;
              const result = await onToken(session, tokenId, { deviceId: deviceId || undefined });
              if (checkReservationExpiry() || !isCurrent() || reviewRequiredRef.current) return;

              if (result === "requires_3ds") {
                if (!tokenId.startsWith("tkn_") || !window.Culqi3DS) throw new Error(copy.error);
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
              clearReservationTimer();
              window.Culqi3DS?.reset();
              return;
            }

            if (checkout.order?.id) {
              throw new Error("Alternative payment orders are disabled.");
            }

            const checkoutError = checkout.error;
            throw new Error(
              checkoutError?.user_message
                ?? checkoutError?.merchant_message
                ?? checkoutError?.message
                ?? copy.error,
            );
          } catch (error) {
            if (isCurrent()) setCheckoutError(error);
          }
        })();
      };

      if (checkReservationExpiry() || !isCurrent()) return;
      setState("ready");
      checkout.open();
      watchExpiry();
    } catch (error) {
      if (isCurrent()) setCheckoutError(error);
    }
  }, [
    amount,
    checkReservationExpiry,
    clearReservationTimer,
    config,
    copy.error,
    customerEmail,
    getDeviceId,
    locale,
      onError,
    onToken,
    prepareCheckout,
    setCheckoutError,
  ]);

  useEffect(() => {
    const lifecycle = lifecycleRef.current;
    if (!lifecycle.alive && !paymentAttemptStartedRef.current && !reservationExpiredRef.current) {
      initializedRef.current = false;
      actionRunningRef.current = false;
      setState("idle");
    }
    lifecycle.alive = true;
    return () => {
      lifecycle.alive = false;
      clearReservationTimer();
      lifecycle.generation += 1;
      actionRunningRef.current = true;
      pending3DSRef.current = null;
      const checkout = checkoutRef.current;
      if (checkout) {
        checkout.culqi = undefined;
        try { checkout.close(); } catch { /* Never restart a disposed checkout. */ }
      }
    };
  }, [clearReservationTimer]);

  useEffect(() => {
    const onForeground = () => { checkReservationExpiry(); };
    const onVisibility = () => { if (document.visibilityState === "visible") checkReservationExpiry(); };
    window.addEventListener("focus", onForeground);
    window.addEventListener("pageshow", onForeground);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("focus", onForeground);
      window.removeEventListener("pageshow", onForeground);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [checkReservationExpiry]);

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
      if (checkReservationExpiry()) return;
      const pending = pending3DSRef.current;
      if (!pending || reviewRequiredRef.current || !lifecycleRef.current.alive) return;
      const generation = lifecycleRef.current.generation;

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
          .then(result => {
            if (checkReservationExpiry() || !lifecycleRef.current.alive || lifecycleRef.current.generation !== generation) return;
            if (result !== "submitted") {
              setCheckoutError(new Error(copy.review));
              window.Culqi3DS?.reset();
              return;
            }
            clearReservationTimer();
            setState("confirming");
            window.Culqi3DS?.reset();
          })
          .catch(error => {
            if (lifecycleRef.current.alive && lifecycleRef.current.generation === generation) setCheckoutError(error);
          });
      }
    }

    window.addEventListener("message", handle3DSMessage);
    return () => window.removeEventListener("message", handle3DSMessage);
  }, [checkReservationExpiry, clearReservationTimer, copy.review, onToken, setCheckoutError]);

  const busyLabel = state === "preparing"
    ? copy.preparing
    : state === "charging"
      ? copy.loading
      : state === "authenticating"
        ? copy.authenticating
        : state === "confirming"
          ? copy.confirming
          : copy.loading;
  const showLockedPreview = config.enabled && disabled;
  const showBusy = config.enabled && !disabled && state !== "ready" && state !== "error" && state !== "review" && state !== "expired";

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
          {/* Culqi3DS reserves #culqi-3ds for its challenge UI mount. */}
          <Script
            id="culqi-3ds-script"
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

      {config.mode === "sandbox" && config.enabled ? (
        <div className="culqi-availability-note" role="status">
          <strong>{locale === "es" ? "PRUEBAS · No se realizan cobros reales" : "TEST MODE · No real charges"}</strong>
          <span>{locale === "es" ? "Utiliza únicamente los datos de prueba oficiales de Culqi." : "Use only official Culqi test data."}</span>
        </div>
      ) : null}
      {!config.enabled ? (
        <div className="culqi-availability-note" role="status">
          <strong>{copy.disabled}</strong>
          <span>{locale === "es" ? "No ingreses datos de tarjeta. El pago se habilitará cuando esté configurado y verificado." : "Do not enter card details. Payment will be available after setup and verification."}</span>
        </div>
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
        <div className={`culqi-embed-shell${state === "expired" || state === "review" ? " is-closed" : ""}`}>
          {state === "expired" ? (
            <div className="culqi-busy" role="alert">
              <p>{copy.reservationExpired}</p>
              <a className="pill-button pink" href="/reserve">{copy.restartReservation}</a>
            </div>
          ) : null}
          {state === "review" ? <div className="culqi-busy" role="alert">{copy.review}</div> : null}
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
          {state !== "expired" && state !== "review" ? <div id="culqi-checkout-container" className="culqi-embed" aria-live="polite" /> : null}
        </div>
      )}

      {config.enabled ? (
        <p className="culqi-security-note">
          <ShieldCheck size={16} />
          {copy.secure}
        </p>
      ) : null}
    </div>
  );
}
