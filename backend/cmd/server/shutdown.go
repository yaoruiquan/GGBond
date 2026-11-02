package main

import (
	"context"
	"time"
)

type httpShutdownServer interface {
	Shutdown(context.Context) error
}

// shutdownHTTPServer only bounds HTTP draining; service cleanup keeps its existing order.
// The caller supplies the validated configuration, including the default for older files.
func shutdownHTTPServer(server httpShutdownServer, timeoutSeconds int) error {
	ctx, cancel := context.WithTimeout(context.Background(), time.Duration(timeoutSeconds)*time.Second)
	defer cancel()
	return server.Shutdown(ctx)
}
