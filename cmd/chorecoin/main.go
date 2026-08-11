// Package main is the chorecoin binary — a custom PocketBase build with the
// JS hooks, JS migrations, and built PWA frontend all embedded at compile
// time. The binary is fully self-contained: drop it on a Mac, Linux server,
// or Raspberry Pi and `chorecoin serve` runs the entire app on a single
// port with no external files.
//
// Env overrides for local dev (bypass embedded copies to iterate without
// rebuilding the binary):
//
//	CHORECOIN_HOOKS_DIR       — load hooks from this on-disk dir instead
//	CHORECOIN_MIGRATIONS_DIR  — load migrations from this on-disk dir instead
//
// The frontend is always served from the embedded FS — for local frontend
// dev use `npm run dev` in the frontend/ directory (Vite dev server on 5173)
// while pointing VITE_PB_URL at your chorecoin serve URL.
package main

import (
	"fmt"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"time"

	chorecoin "github.com/danielhemp/chore-coin"
	"github.com/labstack/echo/v5"
	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/plugins/jsvm"
)

func main() {
	hooksDir, migrationsDir, err := resolveAssetDirs()
	if err != nil {
		log.Fatalf("resolve asset dirs: %v", err)
	}

	app := pocketbase.New()

	jsvm.MustRegister(app, jsvm.Config{
		HooksDir:      hooksDir,
		MigrationsDir: migrationsDir,
	})

	app.OnBeforeServe().Add(func(e *core.ServeEvent) error {
		// Serve the embedded PWA frontend with SPA fallback (unknown paths
		// return index.html so React Router handles client-side routing).
		// Registered on /* — PocketBase's own /api/* and /_/* take priority
		// because Echo matches more-specific patterns first.
		e.Router.GET("/*", apis.StaticDirectoryHandler(chorecoin.FrontendFS(), true))

		// Parent-only backup download.
		//
		// GET /api/custom/backup → 200 with `application/zip` body — a
		// full PocketBase backup produced via app.CreateBackup(). Returns
		// the zip inline so the browser prompts to save. Name includes a
		// timestamp so multiple backups don't collide in the user's
		// Downloads folder.
		e.Router.GET("/api/custom/backup", func(c echo.Context) error {
			info := apis.RequestInfo(c)
			if info.AuthRecord == nil || info.AuthRecord.GetString("role") != "parent" {
				return apis.NewForbiddenError("Parents only.", nil)
			}

			stamp := time.Now().UTC().Format("2006-01-02-150405")
			backupName := fmt.Sprintf("chorecoin-backup-%s.zip", stamp)

			// CreateBackup writes to pb_data/backups/<name> and returns
			// once the file is complete + consistent (uses SQLite Backup
			// API under the hood — safe to run while the server is live).
			if err := app.CreateBackup(c.Request().Context(), backupName); err != nil {
				return apis.NewApiError(http.StatusInternalServerError, "Backup failed.", err)
			}

			backupPath := filepath.Join(app.DataDir(), "backups", backupName)
			// Return the file as a download. Echo's File() adds the right
			// Content-Type and Content-Length. We set Content-Disposition
			// explicitly so the browser saves rather than displays.
			c.Response().Header().Set(
				"Content-Disposition",
				fmt.Sprintf(`attachment; filename="%s"`, backupName),
			)
			return c.File(backupPath)
		})

		return nil
	})

	if err := app.Start(); err != nil {
		log.Fatal(err)
	}
}

// resolveAssetDirs picks the on-disk locations of pb_hooks and pb_migrations
// that jsvm will load. Env vars take precedence (for local dev); otherwise
// extract the embedded copies to the OS cache dir on every startup — cheap
// and idempotent.
func resolveAssetDirs() (hooksDir, migrationsDir string, err error) {
	if h := os.Getenv("CHORECOIN_HOOKS_DIR"); h != "" {
		hooksDir = h
	}
	if m := os.Getenv("CHORECOIN_MIGRATIONS_DIR"); m != "" {
		migrationsDir = m
	}
	if hooksDir != "" && migrationsDir != "" {
		return hooksDir, migrationsDir, nil
	}

	cacheRoot, err := os.UserCacheDir()
	if err != nil {
		cacheRoot = os.TempDir()
	}
	assetsRoot := filepath.Join(cacheRoot, "chorecoin", "assets")

	if hooksDir == "" {
		hooksDir = filepath.Join(assetsRoot, "hooks")
		if err := chorecoin.ExtractTo("pb_hooks", hooksDir); err != nil {
			return "", "", err
		}
	}
	if migrationsDir == "" {
		migrationsDir = filepath.Join(assetsRoot, "migrations")
		if err := chorecoin.ExtractTo("pb_migrations", migrationsDir); err != nil {
			return "", "", err
		}
	}
	return hooksDir, migrationsDir, nil
}
