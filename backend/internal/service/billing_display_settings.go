package service

import (
	"context"
	"fmt"
	"log/slog"
	"math"
	"strconv"
	"strings"

	infraerrors "github.com/Wei-Shaw/sub2api/internal/pkg/errors"
)

func normalizeBillingDisplayCurrency(currency string) string {
	if currency == "USD" {
		return "USD"
	}
	return "CNY"
}

func parseBillingUSDToCNYRate(value string) float64 {
	rate, err := strconv.ParseFloat(value, 64)
	if err != nil || math.IsNaN(rate) || math.IsInf(rate, 0) || rate <= 0 {
		return 0
	}
	return rate
}

func validateBillingDisplaySettings(settings *SystemSettings) error {
	if settings.BillingDefaultDisplayCurrency != "" && settings.BillingDefaultDisplayCurrency != "CNY" && settings.BillingDefaultDisplayCurrency != "USD" {
		return infraerrors.BadRequest("INVALID_BILLING_CURRENCY", "billing_default_display_currency must be CNY or USD")
	}
	rate := settings.BillingUSDToCNYRate
	if math.IsNaN(rate) || math.IsInf(rate, 0) || rate < 0 {
		return infraerrors.BadRequest("INVALID_BILLING_RATE", "billing_usd_to_cny_rate must be finite and nonnegative (0 disables conversion)")
	}
	return nil
}

// Formatting is presentation-only. The original USD amount stays available in
// notifications, including when CNY is the site's default display currency.
func formatBillingUSD(amount float64, currency string, rate float64) string {
	if math.IsNaN(amount) || math.IsInf(amount, 0) {
		amount = 0
	}
	if currency == "CNY" && rate > 0 && !math.IsNaN(rate) && !math.IsInf(rate, 0) {
		return fmt.Sprintf("¥%.2f CNY (%.8f USD)", amount*rate, amount)
	}
	// USD confirmations retain the original wallet precision, including
	// sub-cent credits, while keeping at least two display decimals.
	value := strings.TrimRight(strconv.FormatFloat(amount, 'f', 8, 64), "0")
	parts := strings.SplitN(value, ".", 2)
	if len(parts) == 2 && len(parts[1]) < 2 {
		value += strings.Repeat("0", 2-len(parts[1]))
	}
	return "$" + value + " USD"
}

func loadBillingDisplaySettings(ctx context.Context, repo SettingRepository) (string, float64, error) {
	if repo == nil {
		return "USD", 0, nil
	}
	values, err := repo.GetMultiple(ctx, []string{SettingKeyBillingDefaultDisplayCurrency, SettingKeyBillingUSDToCNYRate})
	if err != nil {
		return "USD", 0, err
	}
	return normalizeBillingDisplayCurrency(values[SettingKeyBillingDefaultDisplayCurrency]), parseBillingUSDToCNYRate(values[SettingKeyBillingUSDToCNYRate]), nil
}

func (s *NotificationEmailService) addBillingDisplayVariables(ctx context.Context, event string, variables map[string]string) {
	if event != NotificationEmailEventBalanceLow && event != NotificationEmailEventBalanceRechargeSuccess {
		return
	}
	currency, rate, err := loadBillingDisplaySettings(ctx, s.settingRepo)
	if err != nil {
		slog.WarnContext(ctx, "failed to load billing display settings; using USD for notification", "event", event, "err", err)
	}
	for _, key := range []string{"current_balance", "threshold", "recharge_amount"} {
		if raw, ok := variables[key]; ok {
			if amount, err := strconv.ParseFloat(raw, 64); err == nil {
				variables[key+"_display"] = formatBillingUSD(amount, currency, rate)
			}
		}
	}
}
