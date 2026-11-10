package service

import (
	"bytes"
	"encoding/base64"
	"encoding/binary"
	"encoding/json"
	"fmt"
	"hash/crc32"
	"image"
	"image/jpeg"
	"image/png"
	"strings"
	"sync"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func contactTestPNG(t *testing.T, width, height, size int) []byte {
	t.Helper()
	var buf bytes.Buffer
	require.NoError(t, png.Encode(&buf, image.NewGray(image.Rect(0, 0, width, height))))
	data := buf.Bytes()
	if size == 0 {
		return data
	}
	// Add a valid ancillary tEXt chunk before IEND to test exact byte boundaries.
	payload := make([]byte, size-len(data)-12)
	copy(payload, "note\x00")
	chunk := make([]byte, len(payload)+12)
	binary.BigEndian.PutUint32(chunk[:4], uint32(len(payload)))
	copy(chunk[4:8], "tEXt")
	copy(chunk[8:], payload)
	binary.BigEndian.PutUint32(chunk[len(chunk)-4:], crc32.ChecksumIEEE(chunk[4:len(chunk)-4]))
	out := append([]byte{}, data[:len(data)-12]...)
	out = append(out, chunk...)
	return append(out, data[len(data)-12:]...)
}

func contactTestURL(data []byte, mime string) string {
	return "data:image/" + mime + ";base64," + base64.StdEncoding.EncodeToString(data)
}

func TestContactMethodsValidationBoundaries(t *testing.T) {
	base := ContactMethod{ID: "support", Label: "客服", Text: "hello", Enabled: true}
	valid := func() []ContactMethod { return []ContactMethod{base} }
	t.Run("unicode labels and text at limit", func(t *testing.T) {
		methods := valid()
		methods[0].Label = " " + strings.Repeat("😀", 40) + " "
		methods[0].Text = strings.Repeat("😀", 500)
		require.NoError(t, ValidateContactMethods(methods))
		require.Equal(t, strings.Repeat("😀", 40), methods[0].Label)
	})
	for name, mutate := range map[string]func(*ContactMethod){
		"blank label":   func(m *ContactMethod) { m.Label = " \n " },
		"long label":    func(m *ContactMethod) { m.Label = strings.Repeat("😀", 41) },
		"long text":     func(m *ContactMethod) { m.Text = strings.Repeat("😀", 501) },
		"empty content": func(m *ContactMethod) { m.Text = " \n " },
		"invalid id":    func(m *ContactMethod) { m.ID = "support/1" },
		"long id":       func(m *ContactMethod) { m.ID = strings.Repeat("x", 65) },
	} {
		t.Run(name, func(t *testing.T) {
			methods := valid()
			mutate(&methods[0])
			require.Error(t, ValidateContactMethods(methods))
		})
	}
	t.Run("duplicate and item limit", func(t *testing.T) {
		require.Error(t, ValidateContactMethods([]ContactMethod{base, base}))
		methods := make([]ContactMethod, 6)
		for i := range methods {
			methods[i] = base
			methods[i].ID = fmt.Sprint(i)
		}
		require.NoError(t, ValidateContactMethods(methods))
		require.Error(t, ValidateContactMethods(append(methods, ContactMethod{ID: "extra", Label: "Extra", Text: "x"})))
	})
	t.Run("exact image byte limits include disabled entries", func(t *testing.T) {
		url := contactTestURL(contactTestPNG(t, 64, 64, MaxContactImageBytes), "png")
		methods := []ContactMethod{base, base, base}
		for i := range methods {
			methods[i].ID = fmt.Sprint(i)
			methods[i].ImageDataURL = url
			methods[i].Enabled = false
		}
		require.NoError(t, ValidateContactMethods(methods))
		fourth := base
		fourth.ID = "fourth"
		fourth.ImageDataURL = url
		require.Error(t, ValidateContactMethods(append(methods, fourth)))
		oversize := base
		oversize.ImageDataURL = contactTestURL(contactTestPNG(t, 64, 64, MaxContactImageBytes+1), "png")
		require.Error(t, ValidateContactMethods([]ContactMethod{oversize}))
	})
}

func TestContactImageRejectsInvalidPayloads(t *testing.T) {
	valid := contactTestPNG(t, 64, 64, 0)
	cases := map[string]string{
		"svg":              "data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=",
		"url":              "https://example.com/contact.png",
		"fake":             "data:image/png;base64,AAAA",
		"malformed base64": "data:image/png;base64,%%%%",
		"base64 newline":   "data:image/png;base64,\n" + base64.StdEncoding.EncodeToString(valid),
		"wrong MIME":       contactTestURL(valid, "jpeg"),
		"truncated PNG":    contactTestURL(valid[:len(valid)/2], "png"),
		"too narrow":       contactTestURL(contactTestPNG(t, 63, 64, 0), "png"),
		"too wide":         contactTestURL(contactTestPNG(t, 2049, 64, 0), "png"),
		"too many pixels":  contactTestURL(contactTestPNG(t, 2048, 2048, 0), "png"),
		"oversize encoded": "data:image/png;base64," + strings.Repeat("A", 140000),
	}
	for name, value := range cases {
		t.Run(name, func(t *testing.T) { _, err := validateContactImage(value); require.Error(t, err) })
	}
	var jpg bytes.Buffer
	require.NoError(t, jpeg.Encode(&jpg, image.NewGray(image.Rect(0, 0, 64, 64)), nil))
	_, err := validateContactImage(contactTestURL(jpg.Bytes(), "jpeg"))
	require.NoError(t, err)
	_, err = validateContactImage(contactTestURL(contactTestPNG(t, 2048, 64, 0), "png"))
	require.NoError(t, err)
}

func TestContactMethodJSONRequiresTypedNonNullFields(t *testing.T) {
	base := map[string]any{"id": "one", "label": "Support", "text": "x", "image_data_url": "", "enabled": true}
	for field := range base {
		for _, variant := range []string{"null", "missing", "wrong type"} {
			t.Run(field+"/"+variant, func(t *testing.T) {
				value := make(map[string]any)
				for key, entry := range base {
					value[key] = entry
				}
				switch variant {
				case "null":
					value[field] = nil
				case "missing":
					delete(value, field)
				default:
					value[field] = 123
				}
				raw, err := json.Marshal([]any{value})
				require.NoError(t, err)
				_, err = ValidateContactMethodsJSON(raw)
				require.Error(t, err)
			})
		}
	}
	for _, raw := range []string{"null", "{}", "[null]", "not-json", strings.Repeat(" ", MaxContactMethodsJSONBytes+1)} {
		_, err := ValidateContactMethodsJSON(json.RawMessage(raw))
		require.Error(t, err)
	}
	methods, err := ValidateContactMethodsJSON(json.RawMessage("[]"))
	require.NoError(t, err)
	require.NotNil(t, methods)
	require.Empty(t, methods)
	for _, raw := range []string{"", "null", "{}", "broken", "[null]"} {
		require.Equal(t, []ContactMethod{}, parseContactMethods(raw))
	}
}

func TestContactPayloadSizeAndInjectionEscaping(t *testing.T) {
	baseline, err := json.Marshal(PublicSettingsInjectionPayload{HomeContactEnabled: true, ContactMethods: []ContactMethod{}})
	require.NoError(t, err)
	for _, size := range []int{0, MaxContactImageBytes} {
		methods := []ContactMethod{{ID: "support", Label: "客服", Text: "</script><script>alert(1)</script>", ImageDataURL: contactTestURL(contactTestPNG(t, 256, 256, size), "png"), Enabled: true}}
		if size != 0 {
			for i := 1; i < 6; i++ {
				method := methods[0]
				method.ID = fmt.Sprint(i)
				method.Text = strings.Repeat("<", 500)
				if i >= 3 {
					method.ImageDataURL = ""
				}
				methods = append(methods, method)
			}
		}
		require.NoError(t, ValidateContactMethods(methods))
		encoded, err := json.Marshal(PublicSettingsInjectionPayload{HomeContactEnabled: true, ContactMethods: methods})
		require.NoError(t, err)
		require.NotContains(t, string(encoded), "</script>")
		var decoded PublicSettingsInjectionPayload
		require.NoError(t, json.Unmarshal(encoded, &decoded))
		require.Equal(t, methods, decoded.ContactMethods)
		t.Logf("image bytes per image=%d; public injection JSON=%d bytes; HTML/JSON contact increment=%d bytes", size, len(encoded), len(encoded)-len(baseline))
	}
}

func TestContactMethodsReadCacheObservesChangesAndIsolatesCallers(t *testing.T) {
	svc := &SettingService{}
	stored := `[{"id":"support","label":"Support","text":"first","image_data_url":"","enabled":true}]`
	first := svc.parseContactMethods(stored)
	require.Len(t, first, 1)
	first[0].Text = "caller-only change"
	first[0].Enabled = false
	require.Equal(t, "first", svc.parseContactMethods(stored)[0].Text)
	require.True(t, svc.parseContactMethods(stored)[0].Enabled)

	updated := strings.Replace(stored, "first", "second", 1)
	require.Equal(t, "second", svc.parseContactMethods(updated)[0].Text)
	require.Empty(t, svc.parseContactMethods("broken"))
	require.Equal(t, "first", svc.parseContactMethods(stored)[0].Text)
	require.Equal(t, []ContactMethod{}, svc.parseContactMethods("[]"))
}

func TestContactMethodsConcurrentReadsUseTheirOwnConfiguration(t *testing.T) {
	svc := &SettingService{}
	var callers sync.WaitGroup
	for i := 0; i < 8; i++ {
		callers.Add(1)
		go func(i int) {
			defer callers.Done()
			text := fmt.Sprintf("contact-%d", i)
			raw, err := json.Marshal([]ContactMethod{{ID: "support", Label: "Support", Text: text, Enabled: true}})
			if !assert.NoError(t, err) {
				return
			}
			for attempt := 0; attempt < 10; attempt++ {
				methods := svc.publicContactMethods(true, string(raw))
				if assert.Len(t, methods, 1) {
					assert.Equal(t, text, methods[0].Text)
					methods[0].Text = "changed by caller"
				}
				assert.Equal(t, []ContactMethod{}, svc.publicContactMethods(false, string(raw)))
			}
		}(i)
	}
	callers.Wait()
}
