package service

import (
	"bytes"
	"encoding/base64"
	"image"
	"image/png"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestValidateContactMethodsRejectsInvalidAndAcceptsPNG(t *testing.T) {
	var buffer bytes.Buffer
	require.NoError(t, png.Encode(&buffer, image.NewRGBA(image.Rect(0, 0, 64, 64))))
	data := base64.StdEncoding.EncodeToString(buffer.Bytes())
	method := ContactMethod{ID: "qr_1", Label: "二维码", ImageDataURL: "data:image/png;base64," + data, Enabled: true}
	require.NoError(t, ValidateContactMethods([]ContactMethod{method}))
	require.Error(t, ValidateContactMethods([]ContactMethod{{ID: "bad", Label: "bad", Text: "x", ImageDataURL: "data:image/png;base64,AAAA", Enabled: true}}))
}
