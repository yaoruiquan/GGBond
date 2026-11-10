package admin

import (
	"io"
	"net/http"
	"strconv"

	"github.com/Wei-Shaw/sub2api/internal/pkg/response"
	"github.com/gin-gonic/gin"
)

// GetVideoTestTask reads a task using the selected upstream account, without billing relay users.
func (h *AccountHandler) GetVideoTestTask(c *gin.Context) {
	accountID, taskID, ok := parseVideoTestPath(c)
	if !ok {
		return
	}
	if h.accountTestService == nil {
		response.Error(c, http.StatusServiceUnavailable, "Account test service unavailable")
		return
	}
	task, err := h.accountTestService.GetOpenAIVideoTestTask(c.Request.Context(), accountID, taskID)
	if err != nil {
		response.ErrorFrom(c, err)
		return
	}
	c.Header("Cache-Control", "no-store")
	response.Success(c, task)
}

// GetVideoTestContent streams authenticated content through the admin boundary.
func (h *AccountHandler) GetVideoTestContent(c *gin.Context) {
	accountID, taskID, ok := parseVideoTestPath(c)
	if !ok {
		return
	}
	if h.accountTestService == nil {
		response.Error(c, http.StatusServiceUnavailable, "Account test service unavailable")
		return
	}
	upstream, err := h.accountTestService.GetOpenAIVideoTestContent(c.Request.Context(), accountID, taskID, c.GetHeader("Range"))
	if err != nil {
		response.ErrorFrom(c, err)
		return
	}
	defer func() { _ = upstream.Body.Close() }()
	for _, name := range []string{"Content-Type", "Content-Length", "Content-Range", "Accept-Ranges", "ETag", "Last-Modified"} {
		if value := upstream.Header.Get(name); value != "" {
			c.Header(name, value)
		}
	}
	c.Header("Cache-Control", "private, no-store")
	c.Header("X-Content-Type-Options", "nosniff")
	c.Status(upstream.StatusCode)
	c.Writer.WriteHeaderNow()
	if _, err := io.Copy(c.Writer, upstream.Body); err != nil {
		_ = c.Error(err)
	}
}

func parseVideoTestPath(c *gin.Context) (int64, string, bool) {
	accountID, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil || accountID <= 0 {
		response.BadRequest(c, "Invalid account ID")
		return 0, "", false
	}
	taskID := c.Param("task_id")
	if taskID == "" || taskID == "." || taskID == ".." || len(taskID) > 256 {
		response.BadRequest(c, "Invalid video task ID")
		return 0, "", false
	}
	for _, ch := range taskID {
		if (ch < 'a' || ch > 'z') && (ch < 'A' || ch > 'Z') && (ch < '0' || ch > '9') && ch != '-' && ch != '_' && ch != '.' {
			response.BadRequest(c, "Invalid video task ID")
			return 0, "", false
		}
	}
	return accountID, taskID, true
}
