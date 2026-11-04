//go:build unit

package service

import (
	"bytes"
	"context"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/Wei-Shaw/sub2api/internal/config"
	"github.com/Wei-Shaw/sub2api/internal/pkg/tlsfingerprint"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
	"github.com/tidwall/gjson"
)

type accountVideoTestUpstream struct {
	responses []*http.Response
	requests  []*http.Request
}

func (u *accountVideoTestUpstream) Do(*http.Request, string, int64, int) (*http.Response, error) {
	return nil, io.ErrUnexpectedEOF
}

func (u *accountVideoTestUpstream) DoWithTLS(req *http.Request, _ string, _ int64, _ int, _ *tlsfingerprint.Profile) (*http.Response, error) {
	u.requests = append(u.requests, req)
	if len(u.responses) == 0 {
		return nil, errors.New("upstream called more than once")
	}
	resp := u.responses[0]
	u.responses = u.responses[1:]
	return resp, nil
}

func videoTestAccount(id int64) Account {
	return Account{ID: id, Platform: PlatformOpenAI, Type: AccountTypeAPIKey, Status: StatusActive, Concurrency: 1,
		Credentials: map[string]any{"api_key": "sk-video-test", "base_url": "https://video.example/v1", "openai_capabilities": []any{"videos"}}}
}

func TestAccountTestServiceOpenAIVideoSubmissionAndTaskID(t *testing.T) {
	gin.SetMode(gin.TestMode)
	account := videoTestAccount(9)
	repo := &mockAccountRepoForGemini{accountsByID: map[int64]*Account{account.ID: &account}}
	upstream := &accountVideoTestUpstream{responses: []*http.Response{{StatusCode: http.StatusAccepted, Header: make(http.Header), Body: io.NopCloser(strings.NewReader(`{"id":"task_123","status":"queued"}`))}}}
	svc := &AccountTestService{accountRepo: repo, httpUpstream: upstream, cfg: &config.Config{}}
	rec := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(rec)
	c.Request = httptest.NewRequest(http.MethodPost, "/test", bytes.NewReader(nil))

	require.NoError(t, svc.TestAccountConnection(c, account.ID, "sora-2", "waves", AccountTestModeVideo, AccountTestOptions{Video: AccountTestVideoOptions{}}))
	require.Len(t, upstream.requests, 1)
	require.Equal(t, "https://video.example/v1/videos", upstream.requests[0].URL.String())
	require.Equal(t, "Bearer sk-video-test", upstream.requests[0].Header.Get("Authorization"))
	bodyBytes, err := io.ReadAll(upstream.requests[0].Body)
	require.NoError(t, err)
	require.Equal(t, "4", gjson.GetBytes(bodyBytes, "seconds").String())
	body := rec.Body.String()
	require.Contains(t, body, `"type":"video_task"`)
	require.Contains(t, body, `"task_id":"task_123"`)
	require.Contains(t, body, `"type":"test_complete"`)
}

func TestAccountTestServiceOpenAIVideoRequiresModelAndMapsOnce(t *testing.T) {
	gin.SetMode(gin.TestMode)
	account := videoTestAccount(11)
	account.Credentials["model_mapping"] = map[string]any{"public-video": "provider-video", "provider-video": "other-video"}
	repo := &mockAccountRepoForGemini{accountsByID: map[int64]*Account{account.ID: &account}}
	upstream := &accountVideoTestUpstream{responses: []*http.Response{{StatusCode: http.StatusOK, Header: make(http.Header), Body: io.NopCloser(strings.NewReader(`{"id":"task_456","status":"queued"}`))}}}
	svc := &AccountTestService{accountRepo: repo, httpUpstream: upstream, cfg: &config.Config{}}

	makeContext := func() (*gin.Context, *httptest.ResponseRecorder) {
		rec := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(rec)
		c.Request = httptest.NewRequest(http.MethodPost, "/test", bytes.NewReader(nil))
		return c, rec
	}

	c, rec := makeContext()
	require.NoError(t, svc.TestAccountConnection(c, account.ID, "public-video", "waves", AccountTestModeVideo))
	body, err := io.ReadAll(upstream.requests[0].Body)
	require.NoError(t, err)
	require.Equal(t, "provider-video", gjson.GetBytes(body, "model").String())
	c, rec = makeContext()
	require.Error(t, svc.TestAccountConnection(c, account.ID, "", "waves", AccountTestModeVideo))
	require.Contains(t, rec.Body.String(), "Select a video model")
	require.Len(t, upstream.requests, 1)
}

func TestAccountTestServiceOpenAIVideoDoesNotSubmitUnsupportedOrInvalidRequests(t *testing.T) {
	gin.SetMode(gin.TestMode)
	account := videoTestAccount(12)
	repo := &mockAccountRepoForGemini{accountsByID: map[int64]*Account{account.ID: &account}}
	upstream := &accountVideoTestUpstream{}
	svc := &AccountTestService{accountRepo: repo, httpUpstream: upstream, cfg: &config.Config{}}
	for _, test := range []struct {
		name    string
		model   string
		options AccountTestOptions
	}{
		{name: "invalid dimensions", model: "sora-2", options: AccountTestOptions{Video: AccountTestVideoOptions{Size: "0x720"}}},
		{name: "invalid duration", model: "sora-2", options: AccountTestOptions{Video: AccountTestVideoOptions{Seconds: -1}}},
	} {
		t.Run(test.name, func(t *testing.T) {
			rec := httptest.NewRecorder()
			c, _ := gin.CreateTestContext(rec)
			c.Request = httptest.NewRequest(http.MethodPost, "/test", nil)
			require.Error(t, svc.TestAccountConnection(c, account.ID, test.model, "p", AccountTestModeVideo, test.options))
			require.Contains(t, rec.Body.String(), `"type":"error"`)
		})
	}
	account.Credentials["openai_capabilities"] = []any{"chat_completions"}
	rec := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(rec)
	c.Request = httptest.NewRequest(http.MethodPost, "/test", nil)
	require.Error(t, svc.TestAccountConnection(c, account.ID, "sora-2", "p", AccountTestModeVideo))
	require.Contains(t, rec.Body.String(), "videos capability")
	require.Empty(t, upstream.requests)
}

func TestGetOpenAIVideoTestTaskRedactsSecretAndRejectsContentType(t *testing.T) {
	account := videoTestAccount(13)
	repo := &mockAccountRepoForGemini{accountsByID: map[int64]*Account{account.ID: &account}}
	upstream := &accountVideoTestUpstream{responses: []*http.Response{
		{StatusCode: http.StatusOK, Header: http.Header{"Content-Type": []string{"application/json"}}, Body: io.NopCloser(strings.NewReader(`{"status":"completed","message":"bad sk-video-test value"}`))},
		{StatusCode: http.StatusOK, Header: http.Header{"Content-Type": []string{"text/html"}}, Body: io.NopCloser(strings.NewReader("not video"))},
	}}
	svc := &AccountTestService{accountRepo: repo, httpUpstream: upstream, cfg: &config.Config{}}
	task, err := svc.GetOpenAIVideoTestTask(context.Background(), account.ID, "task_789")
	require.NoError(t, err)
	require.NotContains(t, task.Error, "sk-video-test")
	_, err = svc.GetOpenAIVideoTestContent(context.Background(), account.ID, "task_789", "")
	require.Error(t, err)
}

func TestAccountTestServiceOpenAIVideoStatusAndContent(t *testing.T) {
	account := videoTestAccount(10)
	repo := &mockAccountRepoForGemini{accountsByID: map[int64]*Account{account.ID: &account}}
	upstream := &accountVideoTestUpstream{responses: []*http.Response{
		{StatusCode: http.StatusOK, Header: http.Header{"Content-Type": []string{"application/json"}}, Body: io.NopCloser(strings.NewReader(`{"status":"completed","url":"sk-video-test"}`))},
		{StatusCode: http.StatusPartialContent, Header: http.Header{"Content-Type": []string{"video/mp4"}}, Body: io.NopCloser(strings.NewReader("video-bytes"))},
	}}
	svc := &AccountTestService{accountRepo: repo, httpUpstream: upstream, cfg: &config.Config{}}
	task, err := svc.GetOpenAIVideoTestTask(context.Background(), account.ID, "task_123")
	require.NoError(t, err)
	require.Equal(t, "completed", task.Status)
	resp, err := svc.GetOpenAIVideoTestContent(context.Background(), account.ID, "task_123", "bytes=0-4")
	require.NoError(t, err)
	defer resp.Body.Close()
	content, err := io.ReadAll(resp.Body)
	require.NoError(t, err)
	require.Equal(t, "video-bytes", string(content))
	require.Equal(t, "bytes=0-4", upstream.requests[1].Header.Get("Range"))
}
