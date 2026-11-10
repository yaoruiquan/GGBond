package service

import (
	"testing"

	dbent "github.com/Wei-Shaw/sub2api/ent"
	"github.com/stretchr/testify/require"
)

func TestPaymentCreditPrecision(t *testing.T) {
	require.Equal(t, 0.13888889, calculateCreditedBalance(1, 0.13888889))
	require.Equal(t, 10.00000008, calculateCreditedBalance(72, 0.13888889))
	cfg := &PaymentConfig{BalanceRechargeMultiplier: 0.13888889, RechargeBonusTiers: []RechargeBonusTier{{MinAmount: 1, BonusPercent: 15}}}
	quote := quoteRechargeBonus(cfg, 1, "CNY")
	require.Equal(t, 0.02083333, quote.Bonus)
	require.Equal(t, 0.15972222, quote.Credited)
	require.Equal(t, 0.13888889, paymentOrderAmountWithoutBonus(&dbent.PaymentOrder{Amount: quote.Credited, BonusAmount: quote.Bonus, OrderType: "balance"}))
	cfg.RechargeBonusMode = RechargeBonusModeDiscount
	quote = quoteRechargeBonus(cfg, 1, "CNY")
	require.Equal(t, 0.85, quote.PayBase)
	require.Equal(t, 0.13888889, quote.Credited)
	require.Equal(t, 0.02083333, quote.Bonus)
	// A partial USD refund must not become a full cash refund merely because
	// its difference falls within a cent of the canonical credit amount.
	require.Equal(t, 0.5, calculateGatewayRefundAmount(0.01, 1, 0.005, "CNY"))
	require.Equal(t, 1.0, calculateGatewayRefundAmount(0.13888889, 1, 0.13888889, "CNY"))
	require.Equal(t, 0.5, calculateGatewayRefundAmount(0.13888889, 1, 0.06944445, "CNY"))
}
