package service

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"math"
	"net/http"
	"sync"
	"time"

	"github.com/shopspring/decimal"
)

const paymentExchangeRateURL = "https://api.frankfurter.dev/v2/rate/USD/CNY?providers=ecb"

// PaymentExchangeRate is a reference quote, never an applied payment setting.
type PaymentExchangeRate struct {
	USDToCNY                  float64   `json:"usd_to_cny"`
	BalanceRechargeMultiplier float64   `json:"balance_recharge_multiplier"`
	RateDate                  string    `json:"rate_date"`
	FetchedAt                 time.Time `json:"fetched_at"`
	Source                    string    `json:"source"`
	Stale                     bool      `json:"stale"`
}

// PaymentExchangeRateService keeps reference requests off the checkout path.
// The fixed endpoint receives no credentials or payment/customer data.
type PaymentExchangeRateService struct {
	mu          sync.Mutex
	client      *http.Client
	endpoint    string
	now         func() time.Time
	cached      *PaymentExchangeRate
	nextAttempt time.Time
}

func NewPaymentExchangeRateService() *PaymentExchangeRateService {
	return &PaymentExchangeRateService{
		client: &http.Client{
			Timeout: 8 * time.Second,
			CheckRedirect: func(_ *http.Request, _ []*http.Request) error {
				return http.ErrUseLastResponse
			},
		},
		endpoint: paymentExchangeRateURL,
		now:      time.Now,
	}
}

func (s *PaymentExchangeRateService) Get(ctx context.Context) (*PaymentExchangeRate, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	now := s.now().UTC()
	if s.cached != nil && now.Sub(s.cached.FetchedAt) < 24*time.Hour && now.Before(s.nextAttempt) {
		quote := *s.cached
		return &quote, nil
	}
	quote, err := s.fetch(ctx, now)
	if err != nil {
		// Briefly reuse a previously checked quote during provider outages,
		// retaining its date and fetch time and explicitly marking it stale.
		if s.cached != nil && now.Sub(s.cached.FetchedAt) < 24*time.Hour {
			cached := *s.cached
			cached.Stale = true
			s.cached = &cached
			s.nextAttempt = now.Add(2 * time.Minute)
			return &cached, nil
		}
		return nil, err
	}
	s.cached = quote
	s.nextAttempt = now.Add(30 * time.Minute)
	result := *quote
	return &result, nil
}

func (s *PaymentExchangeRateService) fetch(ctx context.Context, now time.Time) (*PaymentExchangeRate, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, s.endpoint, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Accept", "application/json")
	resp, err := s.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("fetch payment exchange rate: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("exchange rate provider status: %d", resp.StatusCode)
	}
	body, err := io.ReadAll(io.LimitReader(resp.Body, 8193))
	if err != nil || len(body) > 8192 {
		return nil, fmt.Errorf("invalid exchange rate response size")
	}
	var payload struct {
		Date  string  `json:"date"`
		Base  string  `json:"base"`
		Quote string  `json:"quote"`
		Rate  float64 `json:"rate"`
	}
	if json.Unmarshal(body, &payload) != nil || payload.Base != "USD" || payload.Quote != "CNY" ||
		math.IsNaN(payload.Rate) || math.IsInf(payload.Rate, 0) || payload.Rate <= 0 || payload.Rate > 1000 {
		return nil, fmt.Errorf("invalid USD/CNY exchange rate response")
	}
	rateDate, err := time.Parse(time.DateOnly, payload.Date)
	today := now.Truncate(24 * time.Hour)
	if err != nil || rateDate.After(today) || today.Sub(rateDate) > 7*24*time.Hour {
		return nil, fmt.Errorf("exchange rate date is missing, future or too old")
	}
	return &PaymentExchangeRate{
		USDToCNY:                  payload.Rate,
		BalanceRechargeMultiplier: decimal.NewFromInt(1).Div(decimal.NewFromFloat(payload.Rate)).Round(8).InexactFloat64(),
		RateDate:                  payload.Date,
		FetchedAt:                 now,
		Source:                    "Frankfurter / ECB",
	}, nil
}
