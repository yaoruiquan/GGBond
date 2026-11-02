package main

import (
	"bufio"
	"context"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
	"golang.org/x/net/http2"
)

type shutdownProbe struct {
	context   context.Context
	remaining time.Duration
	err       error
}

func (p *shutdownProbe) Shutdown(ctx context.Context) error {
	p.context = ctx
	deadline, _ := ctx.Deadline()
	p.remaining = time.Until(deadline)
	return p.err
}

func TestShutdownHTTPServerUsesConfiguredDeadline(t *testing.T) {
	wantErr := errors.New("shutdown failed")
	probe := &shutdownProbe{err: wantErr}
	err := shutdownHTTPServer(probe, 60)
	require.ErrorIs(t, err, wantErr)
	require.InDelta(t, 60, probe.remaining.Seconds(), 1)
	require.ErrorIs(t, probe.context.Err(), context.Canceled)
}

func TestShutdownHTTPServerTracksActiveSSE(t *testing.T) {
	for _, protocol := range []string{"http1", "http2", "h2c"} {
		t.Run(protocol, func(t *testing.T) {
			release := make(chan struct{})
			finished := make(chan struct{})
			server := httptest.NewUnstartedServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				defer close(finished)
				w.Header().Set("Content-Type", "text/event-stream")
				_, _ = io.WriteString(w, "data: started\n\n")
				w.(http.Flusher).Flush()
				<-release
				_, _ = io.WriteString(w, "data: completed\n\n")
			}))
			server.EnableHTTP2 = protocol == "http2"
			if protocol == "h2c" {
				require.NoError(t, http2.ConfigureServer(server.Config, &http2.Server{}))
				protocols := new(http.Protocols)
				protocols.SetHTTP1(true)
				protocols.SetUnencryptedHTTP2(true)
				server.Config.Protocols = protocols
			}
			if protocol == "http2" {
				server.StartTLS()
			} else {
				server.Start()
			}
			t.Cleanup(server.Close)
			t.Cleanup(func() { close(release) })
			client := server.Client()
			client.Timeout = 5 * time.Second
			if protocol == "h2c" {
				protocols := new(http.Protocols)
				protocols.SetUnencryptedHTTP2(true)
				client.Transport = &http.Transport{Protocols: protocols}
				t.Cleanup(client.CloseIdleConnections)
			}
			response, err := client.Get(server.URL)
			require.NoError(t, err)
			defer response.Body.Close()
			if protocol == "http1" {
				require.Equal(t, 1, response.ProtoMajor)
			} else {
				require.Equal(t, 2, response.ProtoMajor)
			}
			line, err := bufio.NewReader(response.Body).ReadString('\n')
			require.NoError(t, err)
			require.Equal(t, "data: started\n", line)
			err = shutdownHTTPServer(server.Config, 1)
			require.ErrorIs(t, err, context.DeadlineExceeded)
			select {
			case <-finished:
				t.Fatal("Shutdown timeout must not imply active SSE was canceled or completed")
			default:
			}
		})
	}
}
