package service

import (
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
)

func paymentRateTestService(t *testing.T, handler http.HandlerFunc) (*PaymentExchangeRateService, *time.Time) {
	t.Helper()
	server := httptest.NewServer(handler)
	t.Cleanup(server.Close)
	now := time.Date(2026, 11, 10, 10, 0, 0, 0, time.UTC)
	s := NewPaymentExchangeRateService()
	s.endpoint = server.URL
	s.client = server.Client()
	s.now = func() time.Time { return now }
	return s, &now
}

func TestPaymentExchangeRateRecommendsReciprocalAndCaches(t *testing.T) {
	var calls atomic.Int32
	s, now := paymentRateTestService(t, func(w http.ResponseWriter, r *http.Request) {
		calls.Add(1)
		require.Equal(t, "application/json", r.Header.Get("Accept"))
		require.Empty(t, r.Header.Get("Authorization"))
		_, _ = fmt.Fprint(w, `{"date":"2026-11-09","base":"USD","quote":"CNY","rate":7.2}`)
	})
	quote, err := s.Get(context.Background())
	require.NoError(t, err)
	require.Equal(t, 7.2, quote.USDToCNY)
	require.Equal(t, 0.13888889, quote.BalanceRechargeMultiplier)
	require.Equal(t, "2026-11-09", quote.RateDate)
	require.Equal(t, *now, quote.FetchedAt)
	require.False(t, quote.Stale)
	quote.USDToCNY = 99 // Returned values must not mutate the cached quote.
	cached, err := s.Get(context.Background())
	require.NoError(t, err)
	require.Equal(t, 7.2, cached.USDToCNY)
	require.EqualValues(t, 1, calls.Load())
	*now = now.Add(31 * time.Minute)
	_, err = s.Get(context.Background())
	require.NoError(t, err)
	require.EqualValues(t, 2, calls.Load())
}

func TestPaymentExchangeRateRejectsInvalidResponses(t *testing.T) {
	for _, body := range []string{
		`not json`,
		`{"date":"2026-11-09","base":"CNY","quote":"USD","rate":7.2}`,
		`{"date":"2026-11-09","base":"USD","quote":"CNY","rate":0}`,
		`{"date":"2026-11-09","base":"USD","quote":"CNY","rate":-7.2}`,
		`{"date":"2026-11-09","base":"USD","quote":"CNY","rate":1001}`,
		`{"date":"2026-11-09","base":"USD","quote":"CNY","rate":1e999}`,
		`{"base":"USD","quote":"CNY","rate":7.2}`,
		`{"date":"2026-10-01","base":"USD","quote":"CNY","rate":7.2}`,
		`{"date":"2026-11-11","base":"USD","quote":"CNY","rate":7.2}`,
		strings.Repeat("x", 8193),
	} {
		t.Run(body[:min(35, len(body))], func(t *testing.T) {
			s, _ := paymentRateTestService(t, func(w http.ResponseWriter, _ *http.Request) { _, _ = fmt.Fprint(w, body) })
			quote, err := s.Get(context.Background())
			require.Error(t, err)
			require.Nil(t, quote)
		})
	}
}

func TestPaymentExchangeRateOutageUsesMarkedCacheForAtMostOneDay(t *testing.T) {
	var calls atomic.Int32
	s, now := paymentRateTestService(t, func(w http.ResponseWriter, _ *http.Request) {
		if calls.Add(1) > 1 {
			w.WriteHeader(http.StatusServiceUnavailable)
			return
		}
		_, _ = fmt.Fprint(w, `{"date":"2026-11-09","base":"USD","quote":"CNY","rate":7.2}`)
	})
	quote, err := s.Get(context.Background())
	require.NoError(t, err)
	*now = now.Add(31 * time.Minute)
	cached, err := s.Get(context.Background())
	require.NoError(t, err)
	require.True(t, cached.Stale)
	require.Equal(t, quote.FetchedAt, cached.FetchedAt)
	require.Equal(t, quote.RateDate, cached.RateDate)
	_, err = s.Get(context.Background())
	require.NoError(t, err)
	require.EqualValues(t, 2, calls.Load()) // Back off failed refreshes.
	*now = quote.FetchedAt.Add(24*time.Hour + time.Second)
	expired, err := s.Get(context.Background())
	require.Error(t, err)
	require.Nil(t, expired)
}

func TestPaymentExchangeRateRejectsInitialProviderFailure(t *testing.T) {
	s, _ := paymentRateTestService(t, func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusBadGateway) })
	quote, err := s.Get(context.Background())
	require.Error(t, err)
	require.Nil(t, quote)
}

func TestPaymentExchangeRateHonorsCancellation(t *testing.T) {
	s, _ := paymentRateTestService(t, func(_ http.ResponseWriter, _ *http.Request) { t.Error("unexpected upstream request") })
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	quote, err := s.Get(ctx)
	require.ErrorIs(t, err, context.Canceled)
	require.Nil(t, quote)
}

func TestPaymentExchangeRateMergesConcurrentRequests(t *testing.T) {
	var calls atomic.Int32
	s, _ := paymentRateTestService(t, func(w http.ResponseWriter, _ *http.Request) {
		calls.Add(1)
		_, _ = fmt.Fprint(w, `{"date":"2026-11-09","base":"USD","quote":"CNY","rate":7.2}`)
	})
	results := make(chan error, 16)
	for range 16 {
		go func() { _, err := s.Get(context.Background()); results <- err }()
	}
	for range 16 {
		require.NoError(t, <-results)
	}
	require.EqualValues(t, 1, calls.Load())
}

func TestPaymentExchangeRateHonorsUpstreamTimeout(t *testing.T) {
	s, _ := paymentRateTestService(t, func(_ http.ResponseWriter, r *http.Request) { <-r.Context().Done() })
	s.client.Timeout = 20 * time.Millisecond
	quote, err := s.Get(context.Background())
	require.Error(t, err)
	require.Nil(t, quote)
}
