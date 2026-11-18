package service

import (
	"context"
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"strings"
	"sync"
	"time"

	gocache "github.com/patrickmn/go-cache"
)

const (
	marketDiscoveryFreshness = 15 * time.Minute
	marketDiscoveryRetry     = time.Minute
	marketDiscoveryRetention = time.Hour
	marketDiscoveryTimeout   = 3 * time.Second
	marketDiscoveryPageWait  = 400 * time.Millisecond
	marketDiscoveryWorkers   = 4
)

type marketDiscovery struct {
	fetch func(context.Context, *Account) ([]string, error)
	cache *gocache.Cache
	mu    sync.Mutex
	batch chan struct{}
}

type marketDiscoveryResult struct {
	models    []string
	refreshAt time.Time
}

func newMarketDiscovery(fetch func(context.Context, *Account) ([]string, error)) *marketDiscovery {
	return &marketDiscovery{fetch: fetch, cache: gocache.New(marketDiscoveryRetention, time.Minute)}
}

func marketNeedsDiscovery(account *Account) bool {
	if account.IsOpenAIPassthroughEnabled() && !shouldForwardOpenAIResponsesViaRawChatCompletions(account) {
		return true
	}
	mapping := account.GetModelMapping()
	if len(mapping) == 0 {
		return !account.IsBedrock() && !account.IsDeepseek() && account.Platform != PlatformTypeSafe
	}
	for model := range mapping {
		if strings.Contains(model, "*") {
			return true
		}
	}
	return false
}

func marketDiscoveryKey(account *Account) string {
	// updated_at also changes when an account is used. Key the cache by the
	// upstream configuration so ordinary inference traffic doesn't invalidate it.
	config, _ := json.Marshal([]any{
		account.Platform, account.Type, account.ParentAccountID, account.Credentials,
		account.GetHeaderOverrides(), upstreamModelsProxyURL(account), account.GetOpenAIFormatBaseURL(),
	})
	return fmt.Sprintf("%d:%x", account.ID, sha256.Sum256(config))
}

func (d *marketDiscovery) cachedResult(key string) (marketDiscoveryResult, time.Time, bool) {
	value, expires, _ := d.cache.GetWithExpiration(key)
	result, ok := value.(marketDiscoveryResult)
	return result, expires, ok
}

func (d *marketDiscovery) models(ctx context.Context, accounts map[int64]*Account) (map[int64][]string, bool) {
	if d == nil {
		return nil, false
	}
	type catalogAccount struct {
		account Account
		key     string
	}
	keys := make(map[int64]string)
	var pending []catalogAccount
	cold := false
	for id, account := range accounts {
		if !marketNeedsDiscovery(account) {
			continue
		}
		key := marketDiscoveryKey(account)
		keys[id] = key
		cached, _, ok := d.cachedResult(key)
		if !ok || !time.Now().Before(cached.refreshAt) {
			cold = cold || !ok
			pending = append(pending, catalogAccount{*account, key})
		}
	}
	if len(pending) > 0 {
		d.mu.Lock()
		if d.batch == nil {
			d.batch = make(chan struct{})
			go func() {
				defer func() {
					d.mu.Lock()
					close(d.batch)
					d.batch = nil
					d.mu.Unlock()
				}()
				var workers sync.WaitGroup
				for worker := 0; worker < min(len(pending), marketDiscoveryWorkers); worker++ {
					workers.Go(func() {
						for i := worker; i < len(pending); i += marketDiscoveryWorkers {
							job := &pending[i]
							d.refresh(&job.account, job.key)
						}
					})
				}
				workers.Wait()
			}()
		}
		done := d.batch
		d.mu.Unlock()
		if cold {
			timer := time.NewTimer(marketDiscoveryPageWait)
			defer timer.Stop()
			select {
			case <-done:
			case <-timer.C:
			case <-ctx.Done():
			}
		}
	}
	models := make(map[int64][]string, len(keys))
	refreshing := false
	for id, key := range keys {
		if cached, _, ok := d.cachedResult(key); ok {
			models[id] = cached.models
			refreshing = refreshing || !time.Now().Before(cached.refreshAt)
		} else {
			refreshing = true
		}
	}
	return models, refreshing
}

func (d *marketDiscovery) refresh(account *Account, key string) {
	if cached, _, ok := d.cachedResult(key); ok && time.Now().Before(cached.refreshAt) {
		return
	}
	ctx, cancel := context.WithTimeout(context.Background(), marketDiscoveryTimeout)
	defer cancel()
	models, err := d.fetch(ctx, account)
	if err != nil {
		// Keep usable results for their original TTL. A short separate retry
		// window prevents repeated failures from extending that TTL indefinitely.
		if previous, expires, ok := d.cachedResult(key); ok {
			previous.refreshAt = time.Now().Add(marketDiscoveryRetry)
			if remaining := time.Until(expires); remaining > 0 {
				d.cache.Set(key, previous, remaining)
				return
			}
		}
		d.cache.Set(key, marketDiscoveryResult{refreshAt: time.Now().Add(marketDiscoveryRetry)}, marketDiscoveryRetry)
		return
	}
	d.cache.SetDefault(key, marketDiscoveryResult{models: models, refreshAt: time.Now().Add(marketDiscoveryFreshness)})
}

func (s *AccountTestService) fetchMarketModels(ctx context.Context, account *Account) ([]string, error) {
	if !account.IsOpenAI() || s.openaiGatewayService == nil {
		return s.FetchUpstreamSupportedModels(ctx, account)
	}
	catalog, err := s.openaiGatewayService.FetchOpenAIModelsList(ctx, account)
	if err != nil {
		return nil, err
	}
	return extractUpstreamModelIDs(catalog.Body)
}
