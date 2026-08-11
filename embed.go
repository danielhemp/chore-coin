// Package chorecoin holds the runtime assets that the chorecoin binary
// embeds at build time and extracts to disk on startup. Keeping them as an
// embed.FS at the repo root (rather than under internal/) lets //go:embed
// reference the sibling pb_hooks/ and pb_migrations/ directories directly
// — go:embed patterns can only match paths within the current package's
// directory tree.
//
// The frontend/dist/ bundle is embedded in a separate file (embed_frontend.go)
// so builds without a built frontend still compile — useful for CI runs
// that only need the API server for tests.
package chorecoin

import (
	"embed"
	"fmt"
	"io"
	"io/fs"
	"os"
	"path/filepath"
	"strings"
)

//go:embed all:pb_hooks all:pb_migrations
var assetsFS embed.FS

// ExtractTo copies the embedded contents of embedRoot (e.g. "pb_hooks" or
// "pb_migrations") to destDir on disk, creating destDir if missing and
// overwriting any existing files. Directories inside embedRoot are recreated
// with mode 0o755; files with mode 0o644.
//
// PocketBase's jsvm plugin needs on-disk paths (not embed.FS) to load JS
// hooks and migrations, so we extract on every startup. That's safe: the
// migrator tracks applied migrations in the DB's _migrations table and only
// runs new ones; hook files are read on load and don't need persistence.
func ExtractTo(embedRoot, destDir string) error {
	if err := os.MkdirAll(destDir, 0o755); err != nil {
		return fmt.Errorf("mkdir %s: %w", destDir, err)
	}
	return fs.WalkDir(assetsFS, embedRoot, func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		rel := strings.TrimPrefix(strings.TrimPrefix(path, embedRoot), "/")
		target := filepath.Join(destDir, rel)
		if d.IsDir() {
			return os.MkdirAll(target, 0o755)
		}
		src, err := assetsFS.Open(path)
		if err != nil {
			return err
		}
		defer src.Close()
		dst, err := os.OpenFile(target, os.O_WRONLY|os.O_CREATE|os.O_TRUNC, 0o644)
		if err != nil {
			return err
		}
		defer dst.Close()
		if _, err := io.Copy(dst, src); err != nil {
			return err
		}
		return nil
	})
}
