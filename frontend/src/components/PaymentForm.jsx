import React, { useState } from 'react';
import { CardElement, useStripe, useElements } from '@stripe/react-stripe-js';

const PaymentForm = ({ amount, currency = 'LKR', clientSecret, onPaymentSuccess, onCancel }) => {
    const stripe = useStripe();
    const elements = useElements();
    const [error, setError] = useState(null);
    const [processing, setProcessing] = useState(false);

    const handleSubmit = async (event) => {
        event.preventDefault();

        if (!stripe || !elements) {
            return;
        }

        if (!clientSecret) {
            setError('Missing payment session. Please retry.');
            return;
        }

        setProcessing(true);
        setError(null);

        const cardElement = elements.getElement(CardElement);

        if (!cardElement) {
            setError('Card input is not ready. Please retry.');
            setProcessing(false);
            return;
        }

        const result = await stripe.confirmCardPayment(clientSecret, {
            payment_method: {
                card: cardElement
            }
        });

        if (result.error) {
            setError(result.error.message || 'Payment failed. Please try again.');
            setProcessing(false);
            return;
        }

        const intent = result.paymentIntent;
        if (!intent) {
            setError('Payment did not return a valid intent.');
            setProcessing(false);
            return;
        }

        try {
            await onPaymentSuccess(intent);
        } catch (callbackError) {
            setError(callbackError?.message || 'Payment verification failed.');
        } finally {
            setProcessing(false);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-4 w-full">
            <div className="p-4 border border-slate-300 rounded-md bg-white shadow-sm">
                <CardElement options={{
                    style: {
                        base: {
                            fontSize: '16px',
                            color: '#334155', // slate-700
                            '::placeholder': { color: '#94a3b8' }, // slate-400
                        },
                        invalid: { color: '#ef4444' }, // red-500
                    },
                }} />
            </div>
            {error && <div className="text-sm font-medium text-red-600 bg-red-50 p-3 rounded-md">{error}</div>}

            <button
                type="submit"
                disabled={!stripe || processing || !clientSecret}
                className="w-full flex justify-center py-3 px-4 border border-transparent rounded-md shadow-sm text-sm font-bold text-white bg-slate-800 hover:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-slate-500 disabled:bg-slate-400 transition-colors"
            >
                {processing ? 'Processing...' : `Pay ${currency} ${Number(amount || 0).toFixed(2)}`}
            </button>
            <button
                type="button"
                onClick={onCancel}
                disabled={processing}
                className="mt-2 w-full text-sm text-slate-600 font-medium py-3 rounded-md hover:bg-slate-100 transition-colors"
            >
                Cancel
            </button>
        </form>
    );
};

export default PaymentForm;
