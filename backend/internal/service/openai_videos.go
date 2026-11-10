package service

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"io"
	"mime"
	"mime/multipart"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/Wei-Shaw/sub2api/internal/config"
	"github.com/Wei-Shaw/sub2api/internal/pkg/logger"
	"github.com/gin-gonic/gin"
	"github.com/tidwall/gjson"
)

const OpenAIVideosEndpoint = "/v1/videos"

const openAIVideoTaskTTL = 7 * 24 * time.Hour

var ErrOpenAIVideoTaskNotFound = errors.New("video task not found")

type OpenAIVideoRequest struct {
	Body        []byte
	ContentType string
	Multipart   bool
	Model       string
	Prompt      string
	Seconds     int
	Resolution  string
}

func ParseOpenAIVideoRequest(body []byte, contentType string) (*OpenAIVideoRequest, error) {
	mediaType, params, err := mime.ParseMediaType(contentType)
	if err != nil && contentType != "" {
		return nil, errors.New("invalid Content-Type")
	}
	fields := make(map[string]string)
	multipartBody := mediaType == "multipart/form-data"
	if multipartBody {
		if params["boundary"] == "" {
			return nil, errors.New("multipart boundary is required")
		}
		reader := multipart.NewReader(bytes.NewReader(body), params["boundary"])
		for {
			part, nextErr := reader.NextPart()
			if nextErr == io.EOF {
				break
			}
			if nextErr != nil {
				return nil, errors.New("invalid multipart body")
			}
			name := part.FormName()
			if part.FileName() == "" {
				value, readErr := io.ReadAll(io.LimitReader(part, 1<<20))
				if readErr != nil {
					_ = part.Close()
					return nil, errors.New("invalid multipart field")
				}
				if _, exists := fields[name]; exists {
					_ = part.Close()
					return nil, fmt.Errorf("duplicate multipart field: %s", name)
				}
				fields[name] = string(value)
			}
			_ = part.Close()
		}
	} else if mediaType == "" || mediaType == "application/json" {
		if !gjson.ValidBytes(body) || !gjson.ParseBytes(body).IsObject() {
			return nil, errors.New("request body must be a JSON object")
		}
		for _, name := range []string{"model", "prompt", "seconds", "duration", "resolution", "size"} {
			fields[name] = gjson.GetBytes(body, name).String()
		}
		if mediaType == "" {
			contentType = "application/json"
		}
	} else {
		return nil, errors.New("Content-Type must be application/json or multipart/form-data")
	}
	model, prompt := strings.TrimSpace(fields["model"]), strings.TrimSpace(fields["prompt"])
	if model == "" || prompt == "" {
		return nil, errors.New("model and prompt are required")
	}
	secondsText := firstNonEmptyString(fields["seconds"], fields["duration"])
	seconds := 0
	if secondsText != "" {
		parsed, err := strconv.Atoi(secondsText)
		if err != nil || parsed <= 0 {
			return nil, errors.New("seconds or duration must be a positive integer")
		}
		seconds = parsed
	}
	resolution := firstNonEmptyString(fields["resolution"], fields["size"])
	return &OpenAIVideoRequest{
		Body: body, ContentType: contentType, Multipart: multipartBody, Model: model, Prompt: prompt,
		Seconds: seconds, Resolution: videoRequestResolution(resolution),
	}, nil
}

func videoRequestResolution(value string) string {
	if dims := strings.Split(strings.ToLower(value), "x"); len(dims) == 2 {
		w, _ := strconv.Atoi(dims[0])
		h, _ := strconv.Atoi(dims[1])
		if w > 0 && h > 0 {
			value = strconv.Itoa(min(w, h)) + "p"
		}
	}
	if strings.TrimSpace(value) == "" {
		return VideoBillingResolution720P
	}
	return NormalizeVideoBillingResolutionOrDefault(value)
}

func openAIVideoTaskCacheKey(apiKeyID int64, taskID string) string {
	return fmt.Sprintf("openai-video:%d:%s", apiKeyID, DeriveSessionHashFromSeed(taskID))
}

func (s *OpenAIGatewayService) GetOpenAIVideoTaskAccount(ctx context.Context, apiKey *APIKey, taskID string) (*Account, error) {
	if s.cache == nil || apiKey == nil || apiKey.GroupID == nil {
		return nil, errors.New("video task storage is unavailable")
	}
	accountID, err := s.cache.GetSessionAccountID(ctx, *apiKey.GroupID, openAIVideoTaskCacheKey(apiKey.ID, taskID))
	if errors.Is(err, ErrStickySessionNotFound) {
		return nil, ErrOpenAIVideoTaskNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("read video task binding: %w", err)
	}
	account, err := s.getSchedulableAccount(ctx, accountID)
	if err != nil {
		return nil, err
	}
	if account == nil || !account.IsOpenAI() || account.Type != AccountTypeAPIKey || account.Status != StatusActive || !s.openAIAccountMatchesSchedulingGroup(account, apiKey.GroupID) {
		return nil, ErrOpenAIVideoTaskNotFound
	}
	return account, nil
}

func buildOpenAIVideoURL(base, taskID string, content bool) string {
	parsed, err := url.Parse(strings.TrimSpace(base))
	if err == nil {
		for _, suffix := range []string{"/v1/video/generations", "/video/generations", "/v1/videos", "/videos"} {
			if strings.HasSuffix(strings.TrimRight(parsed.Path, "/"), suffix) {
				parsed.Path = strings.TrimSuffix(strings.TrimRight(parsed.Path, "/"), suffix)
				parsed.RawPath = ""
				base = parsed.String()
				break
			}
		}
	}
	target := buildOpenAIEndpointURL(base, OpenAIVideosEndpoint)
	if taskID != "" {
		parsed, _ := url.Parse(target)
		parsed.Path += "/" + url.PathEscape(taskID)
		if content {
			parsed.Path += "/content"
		}
		target = parsed.String()
	}
	return target
}

func (s *OpenAIGatewayService) CheckOpenAIVideoPricing(ctx context.Context, apiKey *APIKey, model, mappedModel, resolution string) error {
	if s.cfg != nil && s.cfg.RunMode == config.RunModeSimple {
		return nil
	}
	billingModel := strings.TrimSpace(mappedModel)
	if billingModel == "" {
		billingModel = model
	}
	if apiKeyHasConfiguredVideoPrice(apiKey, billingModel, resolution) {
		return nil
	}
	if resolved := s.resolveOpenAIChannelPricing(ctx, billingModel, apiKey); resolved != nil {
		if resolved.Mode == BillingModeVideo || (resolved.Source == PricingSourceChannel &&
			(resolved.Mode == BillingModePerRequest || resolved.Mode == BillingModeImage)) {
			return nil
		}
	}
	return errors.New("video pricing is not configured; configure the group's video price or channel model pricing")
}

func (s *OpenAIGatewayService) ForwardOpenAIVideo(ctx context.Context, c *gin.Context, account *Account, apiKey *APIKey, request *OpenAIVideoRequest, taskID string, content bool, mappedModel string) (*OpenAIForwardResult, error) {
	started := time.Now()
	if account == nil || !account.IsOpenAI() || account.Type != AccountTypeAPIKey {
		return nil, errors.New("video requests require an OpenAI API key account")
	}
	if request != nil && (s.cache == nil || apiKey == nil || apiKey.ID <= 0 || apiKey.GroupID == nil) {
		return nil, errors.New("video task storage is unavailable")
	}
	base, err := s.validateUpstreamBaseURL(account.GetOpenAIBaseURL())
	if err != nil {
		return nil, err
	}
	target := buildOpenAIVideoURL(base, taskID, content)
	method := http.MethodGet
	body := []byte(nil)
	contentType := ""
	billingModel := ""
	if request != nil {
		method, body, contentType = http.MethodPost, request.Body, request.ContentType
		billingModel = strings.TrimSpace(mappedModel)
		if billingModel == "" {
			billingModel = request.Model
		}
	}
	upstreamModel := billingModel
	if request != nil {
		upstreamModel = account.GetMappedModel(billingModel)
		if upstreamModel != request.Model {
			if request.Multipart {
				body, contentType, err = rewriteOpenAIImagesMultipartModel(body, contentType, upstreamModel)
				if err != nil {
					return nil, err
				}
			} else {
				body = ReplaceModelInBody(body, upstreamModel)
			}
		}
		SetOpsUpstreamModel(c, upstreamModel)
		// Accepted jobs must still be bound and billed when the client disconnects.
		ctx = context.WithoutCancel(ctx)
	}
	upstreamReq, err := http.NewRequestWithContext(WithHTTPUpstreamProfile(ctx, HTTPUpstreamProfileOpenAI), method, target, bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	query := upstreamReq.URL.Query()
	for key, values := range c.Request.URL.Query() {
		query[key] = values
	}
	upstreamReq.URL.RawQuery = query.Encode()
	apiToken := account.GetOpenAIApiKey()
	if apiToken == "" {
		return nil, errors.New("video account is missing api_key")
	}
	upstreamReq.Header.Set("Authorization", "Bearer "+apiToken)
	upstreamReq.Header.Set("Accept", "application/json")
	if request != nil {
		upstreamReq.Header.Set("Content-Type", contentType)
		if value := c.GetHeader("Idempotency-Key"); value != "" {
			upstreamReq.Header.Set("Idempotency-Key", value)
		}
	}
	if content {
		upstreamReq.Header.Set("Accept", "*/*")
		for _, name := range []string{"Range", "If-Range", "If-None-Match", "If-Modified-Since"} {
			if value := c.GetHeader(name); value != "" {
				upstreamReq.Header.Set(name, value)
			}
		}
	}
	if ua := account.GetOpenAIUserAgent(); ua != "" {
		upstreamReq.Header.Set("User-Agent", ua)
	}
	account.ApplyHeaderOverrides(upstreamReq.Header)
	SetActualOpenAIUpstreamEndpoint(c, OpenAIVideosEndpoint)
	proxy := ""
	if account.Proxy != nil {
		proxy = account.Proxy.URL()
	}
	resp, err := s.httpUpstream.Do(upstreamReq, proxy, account.ID, account.Concurrency)
	SetOpsLatencyMs(c, OpsUpstreamLatencyMsKey, time.Since(started).Milliseconds())
	if err != nil {
		return nil, fmt.Errorf("video upstream request failed: %s", sanitizeUpstreamErrorMessage(err.Error()))
	}
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode >= http.StatusBadRequest {
		responseBody := s.readUpstreamErrorBody(resp)
		s.handleOpenAIAccountUpstreamError(ctx, account, resp.StatusCode, resp.Header, responseBody, billingModel)
		writeOpenAIEmbeddingsUpstreamResponse(c, resp, responseBody, s.responseHeaderFilter)
		return nil, fmt.Errorf("video upstream returned status %d", resp.StatusCode)
	}
	if content {
		for _, name := range []string{"Content-Type", "Content-Length", "Content-Disposition", "Content-Range", "Accept-Ranges", "ETag", "Last-Modified", "Cache-Control"} {
			if value := resp.Header.Get(name); value != "" {
				c.Header(name, value)
			}
		}
		c.Status(resp.StatusCode)
		c.Writer.WriteHeaderNow()
		_, err = io.Copy(c.Writer, resp.Body)
		return nil, err
	}
	responseBody, err := ReadUpstreamResponseBody(resp.Body, s.cfg, c, openAITooLargeError)
	if err != nil {
		return nil, err
	}
	result := &OpenAIForwardResult{
		RequestID:       firstNonEmptyString(resp.Header.Get("x-request-id"), resp.Header.Get("x-oneapi-request-id")),
		UpstreamHeaders: resp.Header,
		BillingModel:    billingModel, UpstreamModel: upstreamModel, Duration: time.Since(started),
	}
	if request != nil {
		result.Model = request.Model
		result.ResponseID = firstNonEmptyString(gjson.GetBytes(responseBody, "id").String(), gjson.GetBytes(responseBody, "request_id").String(), gjson.GetBytes(responseBody, "data.id").String())
		if result.ResponseID == "" {
			return nil, errors.New("video upstream returned no task ID")
		}
		bindCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), 5*time.Second)
		if err := s.cache.SetSessionAccountID(bindCtx, derefGroupID(apiKey.GroupID), openAIVideoTaskCacheKey(apiKey.ID, result.ResponseID), account.ID, openAIVideoTaskTTL); err != nil {
			logger.LegacyPrintf("service.openai_gateway", "bind video task account failed: account_id=%d task_id=%s err=%v", account.ID, result.ResponseID, err)
		}
		cancel()
		result.VideoCount = 1
		result.VideoResolution = request.Resolution
		result.VideoDurationSeconds = request.Seconds
		if seconds := firstPositiveGJSONInt(gjson.GetBytes(responseBody, "seconds"), gjson.GetBytes(responseBody, "duration")); seconds > 0 {
			result.VideoDurationSeconds = seconds
		}
		result.Usage = extractOpenAIEmbeddingsUsage(responseBody)
	}
	writeOpenAIEmbeddingsUpstreamResponse(c, resp, responseBody, s.responseHeaderFilter)
	return result, nil
}
