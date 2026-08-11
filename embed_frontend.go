package chorecoin

import (
	"embed"
	"io/fs"
)

// The built frontend (Vite → frontend/dist) is embedded into the binary so
// `chorecoin serve` can serve the entire app — API and PWA — from a single
// process with no external files.
//
// frontend/dist must exist at build time (gitignored, produced by
// `make frontend` or `npm run build` inside frontend/). If it's missing,
// `go build` fails with a clear filesystem error; the Makefile ensures the
// frontend target runs before go build so this doesn't surprise anyone
// using the documented build path.
//
//go:embed all:frontend/dist
var frontendFS embed.FS

// FrontendFS returns the built frontend as a virtual filesystem rooted at
// the site root (i.e. FrontendFS().Open("index.html") works, not
// FrontendFS().Open("frontend/dist/index.html")). This is what the HTTP
// static handler wants.
func FrontendFS() fs.FS {
	sub, err := fs.Sub(frontendFS, "frontend/dist")
	if err != nil {
		panic("chorecoin: embed_frontend: fs.Sub failed: " + err.Error())
	}
	return sub
}
