import React, { useEffect, useMemo, useState } from "react";

const STORAGE_KEY = "healthlink_saved_cards";

const onlyDigits = (value) => String(value || "").replace(/\D/g, "");

const formatCardNumber = (value) => {
    const digits = onlyDigits(value).slice(0, 16);
    const groups = digits.match(/.{1,4}/g);
    return groups ? groups.join(" ") : "";
};

const formatExpiry = (value) => {
    const digits = onlyDigits(value).slice(0, 4);
    if (digits.length < 3) {
        return digits;
    }

    return `${digits.slice(0, 2)}/${digits.slice(2)}`;
};

const detectCardType = (cardNumber) => {
    const digits = onlyDigits(cardNumber);

    if (/^4/.test(digits)) {
        return "visa";
    }

    if (/^(5[1-5]|2[2-7])/.test(digits)) {
        return "mastercard";
    }

    return "unknown";
};

const luhnCheck = (cardNumber) => {
    const digits = onlyDigits(cardNumber);
    if (digits.length < 13) {
        return false;
    }

    let sum = 0;
    let shouldDouble = false;

    for (let i = digits.length - 1; i >= 0; i -= 1) {
        let digit = Number(digits[i]);

        if (shouldDouble) {
            digit *= 2;
            if (digit > 9) {
                digit -= 9;
            }
        }

        sum += digit;
        shouldDouble = !shouldDouble;
    }

    return sum % 10 === 0;
};

const getBrandLabel = (type) => {
    if (type === "visa") {
        return "VISA";
    }

    if (type === "mastercard") {
        return "Mastercard";
    }

    return "CARD";
};

const PaymentForm = ({ amount, currency = "LKR", clientSecret, onPaymentSuccess, onCancel }) => {
    const [cardHolder, setCardHolder] = useState("");
    const [cardNumber, setCardNumber] = useState("");
    const [expiry, setExpiry] = useState("");
    const [cvv, setCvv] = useState("");
    const [saveCard, setSaveCard] = useState(false);
    const [generatedOtp, setGeneratedOtp] = useState("");
    const [otpCode, setOtpCode] = useState("");
    const [otpSent, setOtpSent] = useState(false);
    const [processing, setProcessing] = useState(false);
    const [error, setError] = useState("");
    const [savedCards, setSavedCards] = useState([]);

    useEffect(() => {
        try {
            const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "[]");
            setSavedCards(Array.isArray(parsed) ? parsed : []);
        } catch {
            setSavedCards([]);
        }
    }, []);

    const cardType = useMemo(() => detectCardType(cardNumber), [cardNumber]);

    const validateCardFields = () => {
        const trimmedHolder = String(cardHolder || "").trim();
        const digits = onlyDigits(cardNumber);
        const expiryDigits = onlyDigits(expiry);
        const cvvDigits = onlyDigits(cvv);

        if (!clientSecret) {
            return "Missing payment session. Please initialize payment first.";
        }

        if (!trimmedHolder || trimmedHolder.length < 3) {
            return "Please enter a valid card holder name.";
        }

        if (!/^[A-Za-z][A-Za-z\s'.-]*$/.test(trimmedHolder)) {
            return "Card holder name can contain letters and spaces only.";
        }

        if (!luhnCheck(digits)) {
            return "Invalid card number. Use a valid Visa/Mastercard number (for testing: 4242 4242 4242 4242 or 5555 5555 5555 4444).";
        }

        if (cardType === "unknown") {
            return "Only Visa and Mastercard are supported in this demo.";
        }

        if (expiryDigits.length !== 4) {
            return "Please enter expiry as MM/YY.";
        }

        const month = Number(expiryDigits.slice(0, 2));
        const year = Number(expiryDigits.slice(2));
        if (month < 1 || month > 12) {
            return "Please enter a valid expiry month.";
        }

        const now = new Date();
        const currentYear = Number(String(now.getFullYear()).slice(2));
        const currentMonth = now.getMonth() + 1;
        if (year < currentYear || (year === currentYear && month < currentMonth)) {
            return "Card is expired. Please use a valid card.";
        }

        if (!/^\d{3,4}$/.test(cvvDigits)) {
            return "Please enter a valid CVV.";
        }

        return "";
    };

    const persistCardIfNeeded = () => {
        if (!saveCard) {
            return;
        }

        const digits = onlyDigits(cardNumber);
        const cardRecord = {
            id: `${Date.now()}`,
            brand: cardType,
            holder: String(cardHolder || "").trim(),
            last4: digits.slice(-4),
            expiry: formatExpiry(expiry)
        };

        const nextCards = [cardRecord, ...savedCards.filter((entry) => entry.last4 !== cardRecord.last4)].slice(0, 5);
        setSavedCards(nextCards);
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextCards));
    };

    const sendOtp = (event) => {
        event.preventDefault();
        setError("");

        const validationError = validateCardFields();
        if (validationError) {
            setError(validationError);
            return;
        }

        setGeneratedOtp("123456");
        setOtpCode("");
        setOtpSent(true);
    };

    const confirmOtp = async (event) => {
        event.preventDefault();
        setError("");

        if (String(otpCode).trim() !== generatedOtp) {
            setError("Invalid OTP. For demo, use 123456.");
            return;
        }

        setProcessing(true);
        try {
            persistCardIfNeeded();

            await onPaymentSuccess({
                id: `demo_pi_${Date.now()}`,
                status: "succeeded",
                demo: true,
                cardType,
                cardLast4: onlyDigits(cardNumber).slice(-4),
                savedCard: saveCard
            });
        } catch (callbackError) {
            setError(callbackError?.message || "Payment verification failed.");
        } finally {
            setProcessing(false);
        }
    };

    const cardGradient =
        cardType === "visa"
            ? "from-sky-700 via-blue-600 to-indigo-700"
            : cardType === "mastercard"
                ? "from-slate-900 via-stone-800 to-orange-700"
                : "from-slate-700 via-slate-600 to-slate-800";

    return (
        <div className="space-y-4 w-full">
            <div className={`rounded-2xl p-5 text-white shadow-lg bg-linear-to-br ${cardGradient}`}>
                <div className="flex items-center justify-between">
                    <p className="text-xs uppercase tracking-[0.18em] opacity-80">HealthLink Secure Pay</p>
                    <div className="inline-flex items-center gap-2">
                        <span className={`text-xs px-2 py-0.5 rounded-full ${cardType === "unknown" ? "bg-white/20" : "bg-white/30"}`}>
                            {getBrandLabel(cardType)}
                        </span>
                    </div>
                </div>
                <div className="mt-6 h-8 w-12 rounded-md bg-white/25" />
                <p className="mt-6 text-xl md:text-2xl tracking-[0.12em] font-semibold">
                    {formatCardNumber(cardNumber) || "0000 0000 0000 0000"}
                </p>
                <div className="mt-4 flex items-end justify-between">
                    <div>
                        <p className="text-[10px] uppercase opacity-75">Card Holder</p>
                        <p className="text-sm font-medium">{cardHolder || "YOUR NAME"}</p>
                    </div>
                    <div>
                        <p className="text-[10px] uppercase opacity-75">Expiry</p>
                        <p className="text-sm font-medium">{formatExpiry(expiry) || "MM/YY"}</p>
                    </div>
                </div>
            </div>

            <form onSubmit={otpSent ? confirmOtp : sendOtp} className="space-y-4">
                {!otpSent ? (
                    <>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <div className="md:col-span-2">
                                <label className="block text-sm text-slate-700">Card Holder Name</label>
                                <input
                                    type="text"
                                    autoComplete="cc-name"
                                    value={cardHolder}
                                    onChange={(event) => setCardHolder(event.target.value)}
                                    placeholder="John Doe"
                                    className="w-full mt-1 border border-slate-300 rounded-md px-3 py-2"
                                />
                            </div>
                            <div className="md:col-span-2">
                                <label className="block text-sm text-slate-700">Card Number</label>
                                <input
                                    type="text"
                                    inputMode="numeric"
                                    autoComplete="cc-number"
                                    maxLength={19}
                                    value={formatCardNumber(cardNumber)}
                                    onChange={(event) => setCardNumber(event.target.value)}
                                    placeholder="4111 1111 1111 1111"
                                    className="w-full mt-1 border border-slate-300 rounded-md px-3 py-2"
                                />
                                <p className="mt-1 text-xs text-slate-500">
                                    Stripe test cards: Visa 4242 4242 4242 4242, Mastercard 5555 5555 5555 4444.
                                </p>
                            </div>
                            <div>
                                <label className="block text-sm text-slate-700">Expiry (MM/YY)</label>
                                <input
                                    type="text"
                                    inputMode="numeric"
                                    autoComplete="cc-exp"
                                    maxLength={5}
                                    value={formatExpiry(expiry)}
                                    onChange={(event) => setExpiry(event.target.value)}
                                    placeholder="12/30"
                                    className="w-full mt-1 border border-slate-300 rounded-md px-3 py-2"
                                />
                            </div>
                            <div>
                                <label className="block text-sm text-slate-700">CVV</label>
                                <input
                                    type="password"
                                    inputMode="numeric"
                                    autoComplete="cc-csc"
                                    maxLength={4}
                                    value={cvv}
                                    onChange={(event) => setCvv(onlyDigits(event.target.value).slice(0, 4))}
                                    placeholder="123"
                                    className="w-full mt-1 border border-slate-300 rounded-md px-3 py-2"
                                />
                            </div>
                        </div>

                        <div className="flex items-center justify-between gap-3 flex-wrap">
                            <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                                <input type="checkbox" checked={saveCard} onChange={(event) => setSaveCard(event.target.checked)} />
                                Save card details for next time
                            </label>
                            <div className="inline-flex items-center gap-2 text-xs text-slate-500">
                                <span className="px-2 py-1 rounded bg-sky-50 text-sky-700 border border-sky-100">VISA</span>
                                <span className="px-2 py-1 rounded bg-orange-50 text-orange-700 border border-orange-100">MASTERCARD</span>
                            </div>
                        </div>

                        {savedCards.length > 0 ? (
                            <p className="text-xs text-slate-500">Saved cards on this device: {savedCards.length}</p>
                        ) : null}

                        <button
                            type="submit"
                            className="w-full flex justify-center py-3 px-4 border border-transparent rounded-md shadow-sm text-sm font-bold text-white bg-slate-800 hover:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-slate-500 transition-colors"
                        >
                            Send OTP to Complete {currency} {Number(amount || 0).toFixed(2)}
                        </button>
                    </>
                ) : (
                    <>
                        <div className="rounded-md border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm text-indigo-800">
                            Dummy OTP sent. Use <span className="font-semibold">123456</span> for now.
                        </div>
                        <div>
                            <label className="block text-sm text-slate-700">Enter OTP</label>
                            <input
                                type="text"
                                inputMode="numeric"
                                maxLength={6}
                                value={otpCode}
                                onChange={(event) => setOtpCode(onlyDigits(event.target.value).slice(0, 6))}
                                placeholder="6-digit OTP"
                                className="w-full mt-1 border border-slate-300 rounded-md px-3 py-2"
                            />
                        </div>
                        <div className="flex gap-2">
                            <button
                                type="submit"
                                disabled={processing}
                                className="flex-1 py-3 px-4 border border-transparent rounded-md shadow-sm text-sm font-bold text-white bg-emerald-700 hover:bg-emerald-600 disabled:bg-slate-400"
                            >
                                {processing ? "Processing..." : `Verify OTP & Pay ${currency} ${Number(amount || 0).toFixed(2)}`}
                            </button>
                            <button
                                type="button"
                                disabled={processing}
                                onClick={() => {
                                    setOtpSent(false);
                                    setOtpCode("");
                                    setGeneratedOtp("");
                                    setError("");
                                }}
                                className="py-3 px-4 border border-slate-300 rounded-md text-sm font-medium text-slate-700 hover:bg-slate-50"
                            >
                                Edit Card
                            </button>
                        </div>
                    </>
                )}

                {error ? <div className="text-sm font-medium text-red-600 bg-red-50 p-3 rounded-md">{error}</div> : null}

                <button
                    type="button"
                    onClick={onCancel}
                    disabled={processing}
                    className="mt-1 w-full text-sm text-slate-600 font-medium py-3 rounded-md hover:bg-slate-100 transition-colors"
                >
                    Cancel
                </button>
            </form>
        </div>
    );
};

export default PaymentForm;
