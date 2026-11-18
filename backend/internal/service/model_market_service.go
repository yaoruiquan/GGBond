package service

import (
	"context"
	"fmt"
	"slices"
	"strings"
	"time"

	"github.com/Wei-Shaw/sub2api/internal/domain"
	"github.com/Wei-Shaw/sub2api/internal/pkg/xai"
)

func (s *ModelPlazaService) populateMarketModels(ctx context.Context, channels []Channel, groups []Group, out map[int64]*PlazaGroup) (bool, error) {
	if len(groups) == 0 {
		return false, nil
	}
	accounts, err := s.accountRepo.ListModelAvailabilityCandidates(ctx, nil, domain.ConcretePlatformIDs(), true)
	if err != nil {
		return false, fmt.Errorf("list market accounts: %w", err)
	}
	accountsByGroup := make(map[int64][]*Account)
	boundAccounts := make(map[int64]*Account)
	groupPlatforms := make(map[int64]string, len(groups))
	for _, group := range groups {
		groupPlatforms[group.ID] = group.Platform
	}
	now := time.Now()
	for i := range accounts {
		account := &accounts[i]
		if account.AutoPauseOnExpired && account.ExpiresAt != nil && !now.Before(*account.ExpiresAt) {
			continue
		}
		for _, gid := range account.GroupIDs {
			platform, ok := groupPlatforms[gid]
			if ok && (platform == PlatformComposite || platform == account.Platform || mixedListingAccountAllowed(platform, account)) {
				accountsByGroup[gid] = append(accountsByGroup[gid], account)
				boundAccounts[account.ID] = account
			}
		}
	}
	discovered, refreshing := s.marketDiscovery.models(ctx, boundAccounts)
	channelCache := populateChannelCache(channels, groupPlatforms)
	for i := range groups {
		group := &groups[i]
		bound := accountsByGroup[group.ID]
		if len(bound) == 0 {
			continue
		}
		var channel *Channel
		if ch := channelCache.channelByGroupID[group.ID]; ch != nil && ch.IsActive() {
			channel = ch
		}
		var routes []CompositeModelRoute
		if group.Platform == PlatformComposite && s.compositeRoutes != nil {
			routes, err = s.compositeRoutes.ListByGroup(ctx, group.ID, false)
			if err != nil {
				return false, fmt.Errorf("list market routes for group %d: %w", group.ID, err)
			}
			routes = slices.DeleteFunc(routes, func(route CompositeModelRoute) bool { return !route.Enabled })
		}
		out[group.ID].Models = marketGroupModels(group, bound, channel, channelCache, routes, discovered)
	}
	return refreshing, nil
}

func marketGroupModels(group *Group, accounts []*Account, channel *Channel, cache *channelCache, routes []CompositeModelRoute, discovered map[int64][]string) []PlazaModel {
	candidates := make(map[string]struct{})
	add := func(model string) {
		model = strings.TrimSpace(model)
		if model != "" && !strings.Contains(model, "*") && group.ModelAllowlist.Allows(model) {
			candidates[model] = struct{}{}
		}
	}
	if group.ModelAllowlistEnabled() {
		for _, model := range group.ModelAllowlist.Models {
			add(model)
		}
	}
	for _, p := range group.ModelPricing {
		for _, model := range p.Models {
			add(model)
		}
	}
	if channel != nil {
		for _, model := range channel.SupportedModels() {
			if isPlatformPricingMatch(group.Platform, model.Platform) {
				add(model.Name)
			}
		}
	}
	for _, route := range routes {
		if normalizeCompositeRouteMatchType(route.MatchType) == CompositeRouteMatchExact && route.Enabled {
			add(route.PublicModel)
		}
	}
	for _, account := range accounts {
		addAccountModel := func(model string) {
			if group.Platform == account.Platform || group.Platform == PlatformComposite || mixedListingModelAllowed(group.Platform, model) {
				add(model)
			}
		}
		collectMarketAccountModels(account, addAccountModel)
		for _, model := range discovered[account.ID] {
			addAccountModel(model)
		}
	}

	var out []PlazaModel
	for model := range candidates {
		byPlatform := make(map[string]PlazaModel)
		for target := range marketModelTargets(group, accounts, routes, model) {
			entry, ok := marketRoutableModel(group, accounts, channel, cache, model, target, discovered)
			if !ok {
				continue
			}
			if previous, exists := byPlatform[target.platform]; exists {
				entry.marketPricingUncertain = entry.marketPricingUncertain || previous.marketPricingUncertain || previous.marketBillingModel != entry.marketBillingModel
			}
			byPlatform[target.platform] = entry
		}
		for _, entry := range byPlatform {
			out = append(out, entry)
		}
	}
	return out
}

func collectMarketAccountModels(account *Account, add func(string)) {
	if snapshot := account.GetUpstreamModelMetadataSnapshot(); snapshot != nil {
		for model := range snapshot.Models {
			add(model)
		}
	}
	if account.IsOpenAIPassthroughEnabled() && !shouldForwardOpenAIResponsesViaRawChatCompletions(account) {
		return
	}
	mapping := account.GetModelMapping()
	if len(mapping) == 0 {
		switch {
		case account.IsBedrock():
			for model := range domain.DefaultBedrockModelMapping {
				add(model)
			}
		case account.IsDeepseek():
			for _, model := range deepseekServableModels {
				add(model)
			}
		case account.Platform == PlatformTypeSafe:
			for _, model := range defaultModelsListCandidateIDs(PlatformTypeSafe) {
				add(model)
			}
		}
	}
	if account.IsGrok() && len(stringMappingFromRaw(account.Credentials["model_mapping"])) == 0 {
		// These are the native IDs from the gateway routing table. Compatibility
		// aliases in that table are not additional Grok models.
		for _, model := range xai.DefaultModelIDs() {
			if _, ok := mapping[model]; ok {
				add(model)
			}
		}
		return
	}
	for model, target := range mapping {
		if strings.TrimSpace(target) != "" {
			add(model)
		}
	}
}

type marketModelTarget struct{ platform, model string }

func marketModelTargets(group *Group, accounts []*Account, routes []CompositeModelRoute, model string) map[marketModelTarget]struct{} {
	if group.Platform != PlatformComposite {
		return map[marketModelTarget]struct{}{{group.Platform, model}: {}}
	}
	// The same public name can route to different providers on different APIs.
	// Use gateway precedence per endpoint, including the general route fallback.
	targets := make(map[marketModelTarget]struct{})
	var fallback bool
	for _, endpoint := range []string{
		CompositeRouteEndpointMessages, CompositeRouteEndpointCountTokens, CompositeRouteEndpointResponses, CompositeRouteEndpointChatCompletions,
		CompositeRouteEndpointEmbeddings, CompositeRouteEndpointImages, CompositeRouteEndpointGemini,
	} {
		route, ok := matchCompositeRoute(routes, model, endpoint)
		if !ok {
			fallback = true
			continue
		}
		upstream := strings.TrimSpace(route.UpstreamModel)
		if upstream == "" {
			upstream = model
		}
		if isConcreteRequestPlatform(route.TargetPlatform) {
			targets[marketModelTarget{route.TargetPlatform, upstream}] = struct{}{}
		}
	}
	if fallback {
		var platform string
		ambiguous, claimedOAuth := false, false
		for _, account := range accounts {
			if explicitModelMappingClaims(*account, model) {
				ambiguous = ambiguous || (platform != "" && platform != account.Platform)
				claimedOAuth = claimedOAuth || (account.IsOAuth() && domain.UsesOpenAIGateway(account.Platform))
				platform = account.Platform
			}
		}
		if platform == "" || ambiguous {
			platform, _ = DetectModelPlatform(model)
			if ambiguous && claimedOAuth && domain.UsesOpenAIGateway(platform) {
				platform = ""
			}
		}
		if isConcreteRequestPlatform(platform) {
			targets[marketModelTarget{platform, model}] = struct{}{}
		}
	}
	return targets
}

func marketRoutableModel(group *Group, accounts []*Account, channel *Channel, cache *channelCache, public string, target marketModelTarget, discovered map[int64][]string) (PlazaModel, bool) {
	entry := PlazaModel{Name: public, Platform: target.platform}
	mapping := ChannelMappingResult{MappedModel: target.model}
	var lookup *channelLookup
	if channel != nil {
		lookup = &channelLookup{cache: cache, channel: channel, platform: target.platform}
		mapping = resolveMapping(lookup, group.ID, target.model)
	}
	scheduleModel := target.model
	if domain.UsesOpenAIGateway(target.platform) || target.platform == PlatformGemini {
		scheduleModel = mapping.MappedModel
	}
	restrictionMapping := mapping
	if lookup != nil && scheduleModel != target.model {
		restrictionMapping = resolveMapping(lookup, group.ID, scheduleModel)
	}
	var found bool
	for _, account := range accounts {
		if account.Platform != target.platform && (!mixedListingAccountAllowed(target.platform, account) || !mixedListingModelAllowed(target.platform, scheduleModel)) {
			continue
		}
		if !(&GatewayService{}).isModelSupportedByAccount(account, scheduleModel) {
			continue
		}
		upstream := resolveAccountUpstreamModel(account, mapping.MappedModel)
		if account.IsOpenAI() {
			upstream = resolveOpenAIAccountUpstreamModelForRequest(account, mapping.MappedModel, false)
			if isRetiredOpenAISubscriptionModel(account, upstream) {
				continue
			}
		}
		if strings.TrimSpace(upstream) == "" || strings.Contains(upstream, "*") || !marketAccountConfirmsModel(account, scheduleModel, upstream, discovered[account.ID]) {
			continue
		}
		if lookup != nil && channel.RestrictModels {
			billingModel := billingModelForRestriction(restrictionMapping.BillingModelSource, scheduleModel, restrictionMapping.MappedModel)
			if mapping.BillingModelSource == BillingModelSourceUpstream {
				billingModel = upstream
				if scheduleModel != mapping.MappedModel {
					billingModel = resolveAccountUpstreamModel(account, scheduleModel)
				}
			}
			if checkRestricted(lookup, group.ID, billingModel) {
				continue
			}
		}
		billingModel := upstream
		switch mapping.BillingModelSource {
		case BillingModelSourceRequested:
			billingModel = public
		case BillingModelSourceChannelMapped:
			if mapping.MappedModel != target.model {
				billingModel = mapping.MappedModel
			}
		}
		if found && entry.marketBillingModel != billingModel {
			entry.marketPricingUncertain = true
		}
		found = true
		entry.marketBillingModel = billingModel
	}
	if found && lookup != nil && !entry.marketPricingUncertain {
		entry.Pricing = lookupPricingAcrossPlatforms(cache, group.ID, target.platform, strings.ToLower(entry.marketBillingModel))
	}
	return entry, found
}

// A gateway may pass arbitrary model strings to an upstream without a mapping.
// For such accounts, require a concrete ID from that account's catalog.
func marketAccountConfirmsModel(account *Account, requested, upstream string, discovered []string) bool {
	if account.IsBedrock() {
		return true
	}
	if !account.IsOpenAIPassthroughEnabled() || shouldForwardOpenAIResponsesViaRawChatCompletions(account) {
		mapping := account.GetModelMapping()
		if len(mapping) == 0 {
			if account.IsDeepseek() && isDeepseekServableModel(upstream) {
				return true
			}
			if account.Platform == PlatformTypeSafe && slices.Contains(defaultModelsListCandidateIDs(PlatformTypeSafe), upstream) {
				return true
			}
		}
		if _, exact := mapping[requested]; exact || (len(mapping) != 0 && requested != upstream) {
			return true
		}
	}
	if slices.Contains(discovered, upstream) || slices.Contains(discovered, requested) {
		return true
	}
	if snapshot := account.GetUpstreamModelMetadataSnapshot(); snapshot != nil {
		_, upstreamKnown := snapshot.Models[upstream]
		_, requestedKnown := snapshot.Models[requested]
		return upstreamKnown || requestedKnown
	}
	return false
}

// Use the same base costs as usage billing, at a multiplier of one so the
// market can present the applicable group or user multiplier separately.
func (s *ModelPlazaService) fillMarketMediaPricing(ctx context.Context, model *PlazaModel, group *Group) bool {
	if s.billingService == nil || model.Platform != PlatformGrok {
		return false
	}
	video := isGrokVideoBillingModel(model.Name)
	if !video && !isGrokImageGenerationModel(model.Name) {
		return false
	}
	ctx = WithResolvedTargetPlatform(ctx, model.Platform)
	gateway := OpenAIGatewayService{billingService: s.billingService, resolver: s.resolver}
	key := &APIKey{GroupID: &group.ID, Group: group}
	resolved := gateway.resolveOpenAIChannelPricing(ctx, model.Name, key)
	if resolved != nil && resolved.Mode == BillingModeToken && (video || !group.ImageCountBilling) {
		return false
	}
	mode, tiers := BillingModeImage, []string{ImageBillingSize1K, ImageBillingSize2K}
	if video {
		mode, tiers = BillingModeVideo, []string{VideoBillingResolution480P, VideoBillingResolution720P}
		if xai.CanonicalImagineVideoModel(model.Name) == xai.CanonicalImagineVideoModel("grok-imagine-video-1.5-preview") {
			tiers = append(tiers, VideoBillingResolution1080P)
		}
	}
	model.MediaRate = mode
	pricing := &ChannelModelPricing{BillingMode: mode}
	if video && resolved != nil && resolved.Source == PricingSourceChannel && (resolved.Mode == BillingModePerRequest || resolved.Mode == BillingModeImage) {
		// Combining a channel price per video with group prices per second
		// cannot be represented by a single unit on the card.
		for _, tier := range tiers {
			if apiKeyHasConfiguredVideoPrice(key, model.Name, tier) {
				model.Pricing = nil
				return true
			}
		}
		pricing.BillingMode = BillingModePerRequest
	}
	for i, tier := range tiers {
		var cost *CostBreakdown
		if video {
			cost = gateway.calculateOpenAIVideoCost(ctx, model.Name, key, &OpenAIForwardResult{VideoCount: 1, VideoDurationSeconds: 1, VideoResolution: tier}, 1)
		} else {
			cost = gateway.calculateOpenAIImageCost(ctx, model.Name, key, &OpenAIForwardResult{ImageCount: 1, ImageSize: tier}, 1)
		}
		price := cost.TotalCost
		pricing.Intervals = append(pricing.Intervals, PricingInterval{TierLabel: tier, PerRequestPrice: &price, SortOrder: i})
	}
	pricing.PerRequestPrice = pricing.Intervals[0].PerRequestPrice
	model.Pricing = pricing
	return true
}
