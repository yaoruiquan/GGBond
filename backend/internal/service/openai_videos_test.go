package service

import (
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/Wei-Shaw/sub2api/internal/config"
	"github.com/gin-gonic/gin"
	"github.com/redis/go-redis/v9"
	"github.com/stretchr/testify/require"
	"github.com/tidwall/gjson"
)

type openAIVideoTestCache struct {
	GatewayCache
	bindings map[string]int64
}

func (c *openAIVideoTestCache) GetSessionAccountID(_ context.Context, groupID int64, key string) (int64, error) {
	id, ok := c.bindings[strconv.FormatInt(groupID, 10)+":"+key]
	if !ok {
		return 0, redis.Nil
	}
	return id, nil
}

func (c *openAIVideoTestCache) SetSessionAccountID(_ context.Context, groupID int64, key string, accountID int64, _ time.Duration) error {
	if c.bindings == nil {
		c.bindings = make(map[string]int64)
	}
	c.bindings[strconv.FormatInt(groupID, 10)+":"+key] = accountID
	return nil
}

type openAIVideoTestUpstream struct {
	HTTPUpstream
	do func(*http.Request) (*http.Response, error)
}

type openAIVideoTestAccountRepo struct {
	AccountRepository
	account *Account
}

func (r openAIVideoTestAccountRepo) GetByID(context.Context, int64) (*Account, error) {
	return r.account, nil
}

func (u openAIVideoTestUpstream) Do(req *http.Request, _ string, _ int64, _ int) (*http.Response, error) {
	return u.do(req)
}

func TestParseOpenAIVideoRequest(t *testing.T) {
	t.Run("json fields and dimension-based resolution", func(t *testing.T) {
		request, err := ParseOpenAIVideoRequest([]byte(`{"model":"video-model","prompt":"waves","seconds":18,"size":"1280x720"}`), "application/json")
		require.NoError(t, err)
		require.Equal(t, "video-model", request.Model)
		require.Equal(t, 18, request.Seconds)
		require.Equal(t, VideoBillingResolution720P, request.Resolution)
	})

	t.Run("multipart request remains intact", func(t *testing.T) {
		const boundary = "video-boundary"
		body := "--video-boundary\r\nContent-Disposition: form-data; name=\"model\"\r\n\r\nvideo-model\r\n" +
			"--video-boundary\r\nContent-Disposition: form-data; name=\"prompt\"\r\n\r\nwaves\r\n" +
			"--video-boundary\r\nContent-Disposition: form-data; name=\"seconds\"\r\n\r\n6\r\n--video-boundary--\r\n"
		request, err := ParseOpenAIVideoRequest([]byte(body), "multipart/form-data; boundary="+boundary)
		require.NoError(t, err)
		require.True(t, request.Multipart)
		require.Equal(t, 6, request.Seconds)
		require.Equal(t, body, string(request.Body))
	})

	t.Run("invalid duration rejected", func(t *testing.T) {
		_, err := ParseOpenAIVideoRequest([]byte(`{"model":"video-model","prompt":"waves","seconds":0}`), "application/json")
		require.ErrorContains(t, err, "positive integer")
	})
}

func TestBuildOpenAIVideoURL(t *testing.T) {
	for _, base := range []string{
		"https://upstream.example",
		"https://upstream.example/v1",
		"https://upstream.example/v1/videos",
		"https://upstream.example/video/generations",
	} {
		require.Equal(t, "https://upstream.example/v1/videos", buildOpenAIVideoURL(base, "", false), "base=%s", base)
		require.Equal(t, "https://upstream.example/v1/videos/task_123", buildOpenAIVideoURL(base, "task_123", false), "base=%s", base)
		require.Equal(t, "https://upstream.example/v1/videos/task_123/content", buildOpenAIVideoURL(base, "task_123", true), "base=%s", base)
	}
}

func TestForwardOpenAIVideoCreatesAndBindsTask(t *testing.T) {
	body := []byte(`{"model":"public-video","prompt":"waves","seconds":20,"size":"1280x720","audio":false}`)
	request, err := ParseOpenAIVideoRequest(body, "application/json")
	require.NoError(t, err)
	gin.SetMode(gin.TestMode)
	recorder := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(recorder)
	c.Request = httptest.NewRequest(http.MethodPost, "/v1/videos", strings.NewReader(string(body)))
	c.Request.Header.Set("Content-Type", "application/json")
	cache := &openAIVideoTestCache{}
	account := &Account{ID: 7, Platform: PlatformOpenAI, Type: AccountTypeAPIKey, Credentials: map[string]any{
		"api_key": "provider-key", "base_url": "https://upstream.example/v1",
		"model_mapping": map[string]any{"channel-video": "upstream-video"},
	}}
	groupID := int64(3)
	apiKey := &APIKey{ID: 9, GroupID: &groupID}
	svc := &OpenAIGatewayService{
		cfg: &config.Config{}, cache: cache,
		httpUpstream: openAIVideoTestUpstream{do: func(req *http.Request) (*http.Response, error) {
			require.Equal(t, "https://upstream.example/v1/videos", req.URL.String())
			require.Equal(t, http.MethodPost, req.Method)
			require.Equal(t, "Bearer provider-key", req.Header.Get("Authorization"))
			require.NoError(t, req.Context().Err())
			forwarded, readErr := io.ReadAll(req.Body)
			require.NoError(t, readErr)
			require.Equal(t, "upstream-video", gjson.GetBytes(forwarded, "model").String())
			require.Equal(t, "20", gjson.GetBytes(forwarded, "seconds").String())
			require.True(t, gjson.GetBytes(forwarded, "audio").Exists())
			return &http.Response{StatusCode: http.StatusAccepted, Header: http.Header{"Content-Type": {"application/json"}}, Body: io.NopCloser(strings.NewReader(`{"id":"video_123","status":"queued","seconds":20}`))}, nil
		}},
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	result, err := svc.ForwardOpenAIVideo(ctx, c, account, apiKey, request, "", false, "channel-video")
	require.NoError(t, err)
	require.Equal(t, http.StatusAccepted, recorder.Code)
	require.Equal(t, "video_123", result.ResponseID)
	require.Equal(t, "public-video", result.Model)
	require.Equal(t, "channel-video", result.BillingModel)
	require.Equal(t, "upstream-video", result.UpstreamModel)
	require.Equal(t, 1, result.VideoCount)
	require.Equal(t, 20, result.VideoDurationSeconds)
	require.Equal(t, int64(7), cache.bindings[strconv.FormatInt(groupID, 10)+":"+openAIVideoTaskCacheKey(apiKey.ID, "video_123")])
}

func TestGetOpenAIVideoTaskAccountUsesBoundAccountAndAPIKey(t *testing.T) {
	groupID := int64(3)
	account := &Account{ID: 7, Platform: PlatformOpenAI, Type: AccountTypeAPIKey, Status: StatusActive, GroupIDs: []int64{groupID}}
	cache := &openAIVideoTestCache{}
	key := &APIKey{ID: 9, GroupID: &groupID}
	require.NoError(t, cache.SetSessionAccountID(context.Background(), groupID, openAIVideoTaskCacheKey(key.ID, "video_123"), account.ID, time.Hour))
	svc := &OpenAIGatewayService{cfg: &config.Config{}, cache: cache, accountRepo: openAIVideoTestAccountRepo{account: account}}
	resolved, err := svc.GetOpenAIVideoTaskAccount(context.Background(), key, "video_123")
	require.NoError(t, err)
	require.Same(t, account, resolved)

	otherKey := &APIKey{ID: 10, GroupID: &groupID}
	_, err = svc.GetOpenAIVideoTaskAccount(context.Background(), otherKey, "video_123")
	require.ErrorIs(t, err, ErrOpenAIVideoTaskNotFound)
	_, err = svc.GetOpenAIVideoTaskAccount(context.Background(), key, "unknown")
	require.ErrorIs(t, err, ErrOpenAIVideoTaskNotFound)
}

func TestOpenAIVideoCapabilityRequiresAPIKeyAccount(t *testing.T) {
	for _, tt := range []struct {
		name    string
		account *Account
		want    bool
	}{
		{name: "explicitly enabled", account: &Account{Platform: PlatformOpenAI, Type: AccountTypeAPIKey, Credentials: map[string]any{"openai_capabilities": []any{"videos"}}}, want: true},
		{name: "explicitly omitted", account: &Account{Platform: PlatformOpenAI, Type: AccountTypeAPIKey, Credentials: map[string]any{"openai_capabilities": []any{"chat_completions"}}}},
		{name: "oauth account", account: &Account{Platform: PlatformOpenAI, Type: AccountTypeOAuth, Credentials: map[string]any{"openai_capabilities": []any{"videos"}}}},
	} {
		t.Run(tt.name, func(t *testing.T) {
			require.Equal(t, tt.want, tt.account.SupportsOpenAIEndpointCapability(OpenAIEndpointCapabilityVideos))
		})
	}
}

func TestNormalizeVideoBillingDurationForModel(t *testing.T) {
	require.Equal(t, 20, NormalizeVideoBillingDurationForModel("minimax-h3", 20))
	require.Equal(t, 15, NormalizeVideoBillingDurationForModel("grok-imagine-video", 20))
}

func TestCalculateOpenAIVideoCostPreservesLongDuration(t *testing.T) {
	price := 0.1
	key := &APIKey{Group: &Group{VideoPrice720P: &price}}
	svc := &OpenAIGatewayService{billingService: &BillingService{}}
	cost := svc.calculateOpenAIVideoCost(context.Background(), "video-model", key, &OpenAIForwardResult{
		VideoCount: 1, VideoResolution: VideoBillingResolution720P, VideoDurationSeconds: 20,
	}, 1)
	require.InDelta(t, 2.0, cost.TotalCost, 1e-10)
}

func TestOpenAIVideoPricingRequiresSupportedBillingMode(t *testing.T) {
	for _, mode := range []BillingMode{BillingModeToken, BillingModePerRequest, BillingModeImage, BillingModeVideo} {
		t.Run(string(mode), func(t *testing.T) {
			billing := NewBillingService(&config.Config{}, nil)
			svc := &OpenAIGatewayService{resolver: NewModelPricingResolver(nil, billing)}
			key := &APIKey{Group: &Group{ID: 3, ModelPricing: []ChannelModelPricing{
				{Models: []string{"video-model"}, BillingMode: mode},
			}}}
			err := svc.CheckOpenAIVideoPricing(context.Background(), key, "video-model", "", VideoBillingResolution720P)
			if mode == BillingModeVideo {
				require.NoError(t, err)
			} else {
				require.Error(t, err)
			}
		})
	}
}

func TestOpenAIVideoUsageDeduplicatesByTaskRatherThanHTTPRequest(t *testing.T) {
	usageRepo := &openAIRecordUsageLogRepoStub{}
	billingRepo := &openAIRecordUsageBillingRepoStub{}
	svc := newOpenAIRecordUsageServiceForTest(usageRepo, &openAIRecordUsageUserRepoStub{}, &openAIRecordUsageSubRepoStub{}, nil)
	svc.usageBillingRepo = billingRepo
	price := 0.1
	user := &User{ID: 1}
	key := &APIKey{ID: 2, User: user, Group: &Group{VideoPrice720P: &price}}
	account := &Account{ID: 7, Platform: PlatformOpenAI, Type: AccountTypeAPIKey}
	var taskBillingID string
	for _, httpID := range []string{"request-first", "request-replayed"} {
		err := svc.RecordUsage(context.Background(), &OpenAIRecordUsageInput{
			APIKey: key, User: user, Account: account,
			Result: &OpenAIForwardResult{
				RequestID: httpID, ResponseID: "video_123", Model: "video-model",
				VideoCount: 1, VideoDurationSeconds: 20, VideoResolution: VideoBillingResolution720P,
			},
		})
		require.NoError(t, err)
		require.NotNil(t, billingRepo.lastCmd)
		if taskBillingID == "" {
			taskBillingID = billingRepo.lastCmd.RequestID
		}
		require.Equal(t, taskBillingID, billingRepo.lastCmd.RequestID)
		require.Equal(t, "openai-video:7:video_123", usageRepo.lastLog.RequestID)
	}
}

func TestBulkOpenAIVideoCapabilitiesPreserveExplicitRestrictions(t *testing.T) {
	for _, capabilities := range [][]string{
		{"chat_completions", "embeddings"},
		{"chat_completions", "videos"},
		{"embeddings", "videos"},
		{"videos"},
	} {
		t.Run(strings.Join(capabilities, "+"), func(t *testing.T) {
			value, _, err := normalizeBulkOpenAIEndpointCapabilities(capabilities)
			require.NoError(t, err)
			require.Equal(t, capabilities, value)
		})
	}
}

func TestOpenAIVideoMultipartModelRewrite(t *testing.T) {
	const contentType = "multipart/form-data; boundary=video-boundary"
	body := strings.Join([]string{
		"--video-boundary",
		`Content-Disposition: form-data; name="model"`,
		"",
		"public-model",
		"--video-boundary--",
		"",
	}, "\r\n")
	rewritten, rewrittenType, err := rewriteOpenAIImagesMultipartModel([]byte(body), contentType, "upstream-model")
	require.NoError(t, err)
	require.Contains(t, rewrittenType, "boundary=")
	require.Contains(t, string(rewritten), "upstream-model")
	require.NotContains(t, string(rewritten), "public-model")
}
