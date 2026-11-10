//go:build unit

package service

import (
	"bytes"
	"context"
	"errors"
	"log/slog"
	"math"
	"testing"

	"github.com/Wei-Shaw/sub2api/internal/config"
	"github.com/stretchr/testify/require"
)

func TestBillingDisplaySettingsRoundTrip(t *testing.T) {
	repo := newMockSettingRepo()
	svc := NewSettingService(repo, &config.Config{})
	ctx := context.Background()
	require.NoError(t, svc.UpdateSettings(ctx, &SystemSettings{BillingDefaultDisplayCurrency: "CNY", BillingUSDToCNYRate: 7.23456789}))
	stored := svc.parseSettings(repo.data)
	require.Equal(t, "CNY", stored.BillingDefaultDisplayCurrency)
	require.Equal(t, 7.23456789, stored.BillingUSDToCNYRate)
	public, err := svc.GetPublicSettings(ctx)
	require.NoError(t, err)
	require.Equal(t, stored.BillingUSDToCNYRate, public.BillingUSDToCNYRate)
	rawInjection, err := svc.GetPublicSettingsForInjection(ctx)
	require.NoError(t, err)
	injection := rawInjection.(*PublicSettingsInjectionPayload)
	require.Equal(t, stored.BillingUSDToCNYRate, injection.BillingUSDToCNYRate)
	require.Equal(t, "CNY", injection.BillingDefaultDisplayCurrency)
	// Partial old clients preserve both saved settings.
	require.NoError(t, svc.UpdateSettingsOmitting(ctx, &SystemSettings{SiteName: "New"}, OmittedSettingKeys{SettingKeyBillingUSDToCNYRate: {}, SettingKeyBillingDefaultDisplayCurrency: {}}))
	require.Equal(t, "7.23456789", repo.data[SettingKeyBillingUSDToCNYRate])
}

func TestBillingDisplaySettingsValidationAndDefaults(t *testing.T) {
	svc := NewSettingService(newMockSettingRepo(), &config.Config{})
	defaults := svc.parseSettings(nil)
	require.Equal(t, "CNY", defaults.BillingDefaultDisplayCurrency)
	require.Zero(t, defaults.BillingUSDToCNYRate)
	for _, raw := range []string{"NaN", "Inf", "-1", "bad", "0"} {
		require.Zero(t, parseBillingUSDToCNYRate(raw))
	}
	for _, rate := range []float64{-1, math.NaN(), math.Inf(1)} {
		require.Error(t, validateBillingDisplaySettings(&SystemSettings{BillingUSDToCNYRate: rate}))
	}
	require.Error(t, validateBillingDisplaySettings(&SystemSettings{BillingDefaultDisplayCurrency: "EUR"}))
}

func TestBillingDisplayNotificationVariables(t *testing.T) {
	repo := newMockSettingRepo()
	repo.data[SettingKeyBillingUSDToCNYRate] = "7.2"
	repo.data[SettingKeyBillingDefaultDisplayCurrency] = "CNY"
	svc := &NotificationEmailService{settingRepo: repo}
	vars := map[string]string{"current_balance": "10", "threshold": "20", "recharge_amount": "0.13888889"}
	svc.addBillingDisplayVariables(context.Background(), NotificationEmailEventBalanceLow, vars)
	require.Equal(t, "10", vars["current_balance"], "legacy custom template values remain canonical USD")
	require.Equal(t, "¥72.00 CNY (10.00000000 USD)", vars["current_balance_display"])
	require.Equal(t, "¥144.00 CNY (20.00000000 USD)", vars["threshold_display"])
	legacy := (&BalanceNotifyService{settingRepo: repo}).buildBalanceLowEmailBody("User", 10, 20, "Site", "")
	require.Contains(t, legacy, "¥72.00 CNY (10.00000000 USD)")
	require.NotContains(t, legacy, "%!")
	require.Equal(t, "$10.00 USD", formatBillingUSD(10, "CNY", 0))
	upstream := map[string]string{"threshold": "20"}
	svc.addBillingDisplayVariables(context.Background(), NotificationEmailEventAccountQuotaAlert, upstream)
	require.NotContains(t, upstream, "threshold_display")
}

func TestBillingDisplayUSDNotificationPreservesOriginalCredit(t *testing.T) {
	for _, currency := range []string{"USD", "CNY"} {
		// No conversion rate falls back to USD; sub-cent wallet credits must
		// remain visible in a recharge confirmation rather than become $0.00.
		require.Equal(t, "$0.00138889 USD", formatBillingUSD(0.00138889, currency, 0))
		require.Equal(t, "$10.00000008 USD", formatBillingUSD(10.00000008, currency, 0))
		require.Equal(t, "$10.00 USD", formatBillingUSD(10, currency, 0))
	}
}

type failingBillingDisplaySettingRepo struct {
	SettingRepository
	err error
}

func (r failingBillingDisplaySettingRepo) GetMultiple(context.Context, []string) (map[string]string, error) {
	return nil, r.err
}

func TestBillingDisplayNotificationSettingsFailureIsVisible(t *testing.T) {
	readErr := errors.New("settings repository unavailable")
	repo := failingBillingDisplaySettingRepo{err: readErr}
	currency, rate, err := loadBillingDisplaySettings(context.Background(), repo)
	require.ErrorIs(t, err, readErr)
	require.Equal(t, "USD", currency)
	require.Zero(t, rate)

	var logs bytes.Buffer
	previousLogger := slog.Default()
	slog.SetDefault(slog.New(slog.NewJSONHandler(&logs, nil)))
	t.Cleanup(func() { slog.SetDefault(previousLogger) })
	vars := map[string]string{"recharge_amount": "0.00138889"}
	(&NotificationEmailService{settingRepo: repo}).addBillingDisplayVariables(context.Background(), NotificationEmailEventBalanceRechargeSuccess, vars)
	require.Equal(t, "$0.00138889 USD", vars["recharge_amount_display"])
	require.Contains(t, logs.String(), `"level":"WARN"`)
	require.Contains(t, logs.String(), `"event":"balance.recharge_success"`)
	require.Contains(t, logs.String(), readErr.Error())

	logs.Reset()
	body := (&BalanceNotifyService{settingRepo: repo}).buildBalanceLowEmailBody("User", 10, 20, "Site", "")
	require.Contains(t, body, "$10.00 USD")
	require.Contains(t, logs.String(), `"event":"balance.low"`)
}
